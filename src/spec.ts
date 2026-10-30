import { parseFrontmatter } from "@oh-my-pi/pi-utils";
import { normalizeToolNames } from "@oh-my-pi/pi-coding-agent/tools/builtin-names";
import { z } from "zod";

export interface RunnerSpec {
	model: string;
	tools: string[];
	system: string;
	user: string;
	args: number;
	output: unknown;
	rawPath: string;
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
});

function normalizeTools(raw: string | string[] | null | undefined): string[] {
	if (raw == null) return [];
	const names = (typeof raw === "string" ? raw.split(",") : raw)
		.map(s => s.trim())
		.filter(s => s.length > 0);
	return normalizeToolNames(names);
}

export async function loadSpec(path: string): Promise<RunnerSpec> {
	const content = await Bun.file(path).text();
	const { frontmatter, body } = parseFrontmatter(content);
	const parsed = SpecFrontmatter.parse(frontmatter);
	const user = body.trim();
	if (!user) throw new Error(`spec ${path}: body (user prompt) must be non-empty`);
	return {
		model: parsed.model,
		tools: normalizeTools(parsed.tools),
		system: parsed.system,
		user,
		args: parsed.args,
		output: parsed.output,
		rawPath: path,
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
