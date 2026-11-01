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
	/** CLI form: `path` (label = positional `inputN`) or `slug=path` (label + `{slug}` ref). */
	slugs?: string[];
}

export const CACHE_BOUNDARY = "<!-- CACHE_BOUNDARY -->";

const SpecFrontmatter = z.object({
	model: z.string().min(1),
	tools: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
	system: z.string().min(1),
	args: z.number().int().min(1),
	slugs: z.array(z.string().regex(/^[A-Za-z0-9_-]+$/, "slug must match [A-Za-z0-9_-]+")).optional(),
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
	"slugs",
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
	if (parsed.slugs !== undefined) {
		if (parsed.slugs.length !== parsed.args) {
			throw new Error(`spec ${path}: slugs has ${parsed.slugs.length} entries but args is ${parsed.args}`);
		}
		const dupes = parsed.slugs.filter((s, i) => parsed.slugs!.indexOf(s) !== i);
		if (dupes.length > 0) throw new Error(`spec ${path}: duplicate slug(s): ${[...new Set(dupes)].join(", ")}`);
	}
	return {
		model: parsed.model,
		tools: normalizeTools(parsed.tools, path),
		system: parsed.system,
		user,
		args: parsed.args,
		output: parsed.output,
		rawPath: path,
		...(thinkingLevel !== undefined ? { thinkingLevel } : {}),
		...(parsed.slugs !== undefined ? { slugs: parsed.slugs } : {}),
	};
}

/**
 * One resolved CLI input: either text (file read as UTF-8) or an image part
 * (loaded through the SDK vision pipeline). `label` is the display name in
 * markers/placeholders (path basename).
 */
export interface ResolvedInput {
	kind: "text" | "image";
	label: string;
	text?: string;
	image?: { data: string; mimeType: string };
}

/**
 * A substituted prompt segment: text plus the image parts referenced at that
 * position (in reference order). Callers assemble parts into the final user
 * content; text stays a single string for hashing/logging.
 */
export interface SubstitutedPrompt {
	text: string;
	images: Array<{ data: string; mimeType: string }>;
}

/**
 * Template substitution over resolved inputs. Supported references:
 * - `$N` / `...$N`: plain text content of input N (variadic: all inputs from
 *   N on, joined by blank lines; image inputs contribute a `[Image: label]`
 *   line + their parts).
 * - `{slug}` / `...{slug}`: same content wrapped in `-- BEGIN slug --` /
 *   `-- END slug --` markers (slug defaults to the input's label when the
 *   spec names inputs positionally — see `resolveInputLabels`). NOTE: a spec
 *   naming an input `type` would hijack `{"type": ...}` JSON examples —
 *   avoid generic slugs like `type`.
 * - `$$` escapes to a literal `$`. A `{slug}` ref whose slug matches NO spec
 *   input passes through VERBATIM (so JSON examples like `{"type": "object"}`
 *   and prose like `[via Claim {key} {ID}]` need no escaping).
 * Image inputs inline as `[Image: label]` text + the decoded parts.
 */
export function substituteInputs(text: string, inputs: ResolvedInput[], slugs: string[]): SubstitutedPrompt {
	const images: Array<{ data: string; mimeType: string }> = [];
	const refRe = /\$\$|\.\.\.(\$(\d+)|\{([A-Za-z0-9_-]+)\})|(\$(\d+)|\{([A-Za-z0-9_-]+)\})/g;
	const out = text.replace(refRe, (m, _variadic, vNum, vSlug, _plain, pNum, pSlug) => {
		if (m === "$$") return "$";
		const variadic = _variadic !== undefined;
		const num = vNum ?? pNum;
		const slug = vSlug ?? pSlug;
		if (slug !== undefined && !slugs.includes(slug)) return m; // unknown slug: verbatim
		const start = num !== undefined ? Number(num) : slugIndex(slug, slugs, inputs.length);
		if (!Number.isInteger(start) || start < 1 || start > inputs.length) {
			throw new RangeError(`$${num ?? slug} out of range: spec takes ${inputs.length} input(s)`);
		}
		const end = variadic ? inputs.length : start;
		const blocks: string[] = [];
		for (let k = start; k <= end; k++) {
			const input = inputs[k - 1];
			if (input.image) images.push(input.image);
			const body = input.kind === "image" ? `[Image: ${input.label}]` : (input.text ?? "");
			blocks.push(slug !== undefined ? `-- BEGIN ${slugs[k - 1]} --\n${body}\n-- END ${slugs[k - 1]} --` : body);
		}
		return blocks.join("\n\n");
	});
	return { text: out, images };
}

function slugIndex(slug: string, slugs: string[], count: number): number {
	const i = slugs.indexOf(slug);
	if (i === -1) throw new RangeError(`{${slug}} matches no spec input (have: ${slugs.join(", ") || "none"})`);
	if (i >= count) throw new RangeError(`{${slug}} out of range: spec takes ${count} input(s)`);
	return i + 1;
}


export function substituteVars(text: string, inputs: string[]): string {
	return substituteInputs(
		text,
		inputs.map((t, i) => ({ kind: "text" as const, label: `input${i + 1}`, text: t })),
		inputs.map((_, i) => `input${i + 1}`),
	).text;
}

export function splitCacheBoundary(text: string): { staticPrefix: string; dynamicSuffix: string } | null {
	const i = text.indexOf(CACHE_BOUNDARY);
	if (i === -1) return null;
	return {
		staticPrefix: text.slice(0, i).trim(),
		dynamicSuffix: text.slice(i + CACHE_BOUNDARY.length).trim(),
	};
}
