import { parseArrayOrCSV } from "@oh-my-pi/pi-coding-agent/discovery/helpers";
import { BUILTIN_TOOL_NAMES, normalizeToolNames } from "@oh-my-pi/pi-coding-agent/tools/builtin-names";
import { buildOutputValidator } from "@oh-my-pi/pi-coding-agent/tools/output-schema-validator";
import { parseFrontmatter } from "@oh-my-pi/pi-utils";
import { z } from "zod";

export interface RunnerSpec {
	model: string;
	tools: string[];
	system: string;
	user: string;
	args: number;
	output: unknown;
	rawPath: string;
	thinkingLevel?: string;
}

export const CACHE_BOUNDARY = "<!-- CACHE_BOUNDARY -->";

const SpecFrontmatter = z.object({
	model: z.string().min(1),
	tools: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
	system: z.string().min(1),
	args: z.number().int().min(1),
	output: z
		.record(z.unknown())
		.refine(v => !Array.isArray(v), { message: "output must be a JSON Schema object" }),
	thinking: z.string().min(1).optional(),
	thinkingLevel: z.string().min(1).optional(),
});

/** Top-level frontmatter keys after normalization; `output` keeps its keys verbatim. */
const KNOWN_TOP_LEVEL_KEYS = new Set([
	"model",
	"tools",
	"system",
	"args",
	"output",
	"thinking",
	"thinkingLevel",
]);

function kebabToCamel(key: string): string {
	return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Normalize ONLY top-level frontmatter keys (kebab-case to camelCase for
 * known keys). Nested values — including the `output` schema — pass through
 * verbatim.
 */
function normalizeTopLevelKeys(frontmatter: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(frontmatter)) {
		const camel = kebabToCamel(key);
		out[KNOWN_TOP_LEVEL_KEYS.has(camel) ? camel : key] = value;
	}
	return out;
}

function normalizeTools(raw: string | string[] | null | undefined, path: string): string[] {
	if (raw == null) return [];
	const names = (parseArrayOrCSV(raw) ?? []).map(s => s.trim()).filter(s => s.length > 0);
	const normalized = normalizeToolNames(names);
	const known = new Set<string>(BUILTIN_TOOL_NAMES);
	const unknown = normalized.filter(name => !known.has(name));
	if (unknown.length > 0) {
		throw new Error(`spec ${path}: unknown tool(s): ${unknown.join(", ")}`);
	}
	return normalized;
}

export async function loadSpec(path: string): Promise<RunnerSpec> {
	const content = await Bun.file(path).text();
	const { frontmatter, body } = parseFrontmatter(content, { location: path, level: "fatal", rawKeys: true });
	const parsed = SpecFrontmatter.parse(normalizeTopLevelKeys(frontmatter));
	const { error } = buildOutputValidator(parsed.output);
	if (error) throw new Error(`spec ${path}: invalid output schema: ${error}`);
	const user = body.trim();
	if (!user) throw new Error(`spec ${path}: body (user prompt) must be non-empty`);
	const thinkingLevel = parsed.thinkingLevel ?? parsed.thinking;
	return {
		model: parsed.model,
		tools: normalizeTools(parsed.tools, path),
		system: parsed.system,
		user,
		args: parsed.args,
		output: parsed.output,
		rawPath: path,
		...(thinkingLevel !== undefined ? { thinkingLevel } : {}),
	};
}

export function substituteVars(text: string, inputs: string[]): string {
	return text.replace(/\$\$|\$(\d+)/g, (m, digits: string | undefined) => {
		if (digits === undefined) return "$";
		const k = Number(digits);
		if (!Number.isInteger(k) || k < 1 || k > inputs.length) {
			throw new RangeError(`$${digits} out of range: spec takes ${inputs.length} input(s)`);
		}
		return inputs[k - 1];
	});
}

export function splitCacheBoundary(text: string): { staticPrefix: string; dynamicSuffix: string } | null {
	const i = text.indexOf(CACHE_BOUNDARY);
	if (i === -1) return null;
	return {
		staticPrefix: text.slice(0, i).trim(),
		dynamicSuffix: text.slice(i + CACHE_BOUNDARY.length).trim(),
	};
}
