import * as path from "node:path";
import { mkdir } from "node:fs/promises";
import {
	completeSimple,
	type Api,
	type AssistantMessage,
	type Context,
	type Model,
} from "@oh-my-pi/pi-ai";
import {
	type CreateAgentSessionOptions,
	createAgentSession,
	discoverAuthStorage,
	ModelRegistry,
	SessionManager,
	Settings,
} from "@oh-my-pi/pi-coding-agent";
import { isAuthenticated, kNoAuth } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import {
	expandRoleAlias,
	resolveExplicitModelRole,
	resolveModelOverride,
	resolveRoleChain,
	resolveRoleSelection,
} from "@oh-my-pi/pi-coding-agent/config/model-resolver";
import { buildOutputValidator } from "@oh-my-pi/pi-coding-agent/tools/output-schema-validator";
import { parseJsonWithRepair } from "@oh-my-pi/pi-utils";
import { loadSpec, splitCacheBoundary, substituteVars } from "./spec.js";

export interface RunOptions {
	specPath: string;
	outPath: string;
	inputPaths: string[];
	cwd?: string;
}

export interface RunResult {
	data: unknown;
	outPath: string;
	model: string;
	yieldCalls: number;
	reminderTurns: number;
}

const REMINDER =
	"You stopped without calling yield. Call yield now with the final JSON matching the output schema.";

function contextOf(specPath: string, model: string): string {
	return `spec ${specPath} model ${model}`;
}

function assistantText(message: AssistantMessage): string {
	const parts: string[] = [];
	for (const block of message.content) {
		if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
			const text = (block as { text?: unknown }).text;
			if (typeof text === "string" && text.length > 0) parts.push(text);
		}
	}
	return parts.join("");
}

function formatIssues(issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>): string {
	return issues
		.map(issue => {
			const at = issue.path.map(p => (typeof p === "symbol" ? p.toString() : String(p))).join(".");
			return `${at.length > 0 ? `${at}: ` : ""}${issue.message}`;
		})
		.join("; ");
}

function validateData(outputSchema: unknown, data: unknown, ctx: string): unknown {
	const { validator, error } = buildOutputValidator(outputSchema);
	if (error || !validator) return data;
	const normalized = validator.normalize(data);
	const result = validator.validate(normalized);
	if (!result.success) {
		throw new Error(`${ctx}: output does not match schema: ${formatIssues(result.issues)}`);
	}
	return normalized;
}

async function resolveModel(
	specModel: string,
	settings: Settings,
	modelRegistry: ModelRegistry,
	specPath: string,
): Promise<Model<Api>> {
	const expanded = expandRoleAlias(specModel, settings);
	const available = modelRegistry.getAvailable();
	const hasAuth = async (model: Model<Api>): Promise<boolean> => {
		const key = await modelRegistry.getApiKey(model);
		return key === kNoAuth || isAuthenticated(key);
	};
	const seen = new Set<string>();
	const candidates: Model<Api>[] = [];
	const push = (model: Model<Api> | undefined): void => {
		if (!model) return;
		const key = `${model.provider}/${model.id}`;
		if (seen.has(key)) return;
		seen.add(key);
		candidates.push(model);
	};
	// Role identity first (when the spec names one), then the general override
	// resolution of the expanded pattern.
	const role = resolveExplicitModelRole(specModel, settings);
	if (role) push(resolveRoleSelection([role], settings, available)?.model);
	push(resolveModelOverride([expanded], modelRegistry, settings).model);
	// Auth fallback only: walk the role's retry chain for the first candidate
	// with working credentials. No hand-rolled retry chains beyond this.
	const chainRole = role ?? (specModel.trim().includes("/") ? undefined : specModel.trim());
	if (chainRole) {
		for (const candidate of resolveRoleChain(chainRole, settings, available)) push(candidate.model);
	}
	for (const candidate of candidates) {
		if (await hasAuth(candidate)) return candidate;
	}
	throw new Error(
		`${contextOf(specPath, specModel)}: cannot resolve model (no match, or no working credentials)`,
	);
}

async function runNoTools(args: {
	resolved: Model<Api>;
	apiKey: string | undefined;
	system: string;
	userMessages: string[];
	outputSchema: unknown;
	ctx: string;
}): Promise<unknown> {
	const { resolved, apiKey, system, userMessages, outputSchema, ctx } = args;
	const context: Context = {
		systemPrompt: [system],
		messages: userMessages.map(text => ({ role: "user" as const, content: text, timestamp: Date.now() })),
	};
	let message: AssistantMessage;
	try {
		message = await completeSimple(resolved, context, { apiKey });
	} catch (error) {
		throw new Error(`${ctx}: completion failed: ${error instanceof Error ? error.message : String(error)}`);
	}
	const text = assistantText(message).trim();
	if (!text) throw new Error(`${ctx}: model returned empty response`);
	let data: unknown;
	try {
		data = parseJsonWithRepair(text);
	} catch (error) {
		throw new Error(
			`${ctx}: response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	return validateData(outputSchema, data, ctx);
}

export async function run(options: RunOptions): Promise<RunResult> {
	const cwd = options.cwd ?? process.cwd();
	const spec = await loadSpec(options.specPath);
	if (options.inputPaths.length !== spec.args) {
		throw new Error(
			`spec ${options.specPath}: expected ${spec.args} input(s), got ${options.inputPaths.length}`,
		);
	}
	const inputs = await Promise.all(
		options.inputPaths.map(async inputPath => {
			try {
				return await Bun.file(inputPath).text();
			} catch (error) {
				throw new Error(
					`spec ${options.specPath}: cannot read input ${inputPath}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}),
	);
	const system = substituteVars(spec.system, inputs);
	const user = substituteVars(spec.user, inputs);
	const split = splitCacheBoundary(user);
	let userMessages = split
		? [split.staticPrefix, split.dynamicSuffix].filter(part => part.length > 0)
		: [user];
	if (userMessages.length === 0) userMessages = [user];
	if (userMessages.some(part => part.trim().length === 0)) {
		throw new Error(`spec ${options.specPath}: user prompt is empty after substitution`);
	}

	const settings = await Settings.init({ cwd });
	let modelRegistry: ModelRegistry;
	try {
		const authStorage = await discoverAuthStorage(undefined, { settings, cwd });
		modelRegistry = new ModelRegistry(authStorage, undefined, { settings });
	} catch (error) {
		throw new Error(
			`spec ${options.specPath}: auth/model setup failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	let resolved: Model<Api>;
	try {
		resolved = await resolveModel(spec.model, settings, modelRegistry, options.specPath);
	} catch (error) {
		throw error instanceof Error ? error : new Error(String(error));
	}
	const modelLabel = `${resolved.provider}/${resolved.id}`;
	const ctx = contextOf(options.specPath, modelLabel);

	if (spec.tools.length === 0) {
		const key = await modelRegistry.getApiKey(resolved);
		if (key !== kNoAuth && !isAuthenticated(key)) {
			throw new Error(`${ctx}: no working credentials for ${resolved.provider}`);
		}
		const data = await runNoTools({
			resolved,
			apiKey: key === kNoAuth ? undefined : key,
			system: `${system}\n\nRespond with a single JSON object matching this output schema. Do not wrap it in code fences:\n${JSON.stringify(spec.output)}`,
			userMessages,
			outputSchema: spec.output,
			ctx,
		});
		await writeOut(options.outPath, data);
		return { data, outPath: options.outPath, model: modelLabel, yieldCalls: 0, reminderTurns: 0 };
	}

	return await runWithTools({
		model: resolved,
		cwd,
		settings,
		modelRegistry,
		outPath: options.outPath,
		system,
		userMessages,
		outputSchema: spec.output,
		toolNames: spec.tools,
		modelLabel,
		ctx,
	});
}

async function runWithTools(args: {
	cwd: string;
	settings: Settings;
	modelRegistry: ModelRegistry;
	model: Model<Api>;
	outPath: string;
	system: string;
	userMessages: string[];
	outputSchema: unknown;
	toolNames: string[];
	modelLabel: string;
	ctx: string;
}): Promise<RunResult> {
	const sessionOptions: CreateAgentSessionOptions = {
		cwd: args.cwd,
		settings: args.settings,
		modelRegistry: args.modelRegistry,
		model: args.model,
		// The yield instruction rides the spec system prompt (which replaces
		// the default blocks); the yield tool itself validates `data` against
		// the output schema at call time.
		systemPrompt: [
			`${args.system}\n\nWhen the task is complete, call the yield tool with the final JSON object as \`data\`. The data MUST match the output schema. Do not call yield for interim results.`,
		],
		toolNames: args.toolNames,
		outputSchema: args.outputSchema,
		outputSchemaMode: "strict",
		requireYieldTool: true,
		sessionManager: SessionManager.inMemory(args.cwd),
		hasUI: false,
	};
	let session: Awaited<ReturnType<typeof createAgentSession>>["session"];
	try {
		({ session } = await createAgentSession(sessionOptions));
		} catch (error) {
			throw new Error(
				`${args.ctx}: session creation failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	let yieldCalls = 0;
	let reminderTurns = 0;
	let yielded: unknown;
	let hasYield = false;
	const unsubscribe = session.subscribe(event => {
		if (event.type !== "tool_execution_end" || event.toolName !== "yield" || event.isError) return;
		const details = (event.result as { details?: unknown } | undefined)?.details as
			| { data?: unknown; status?: unknown; useLastTurn?: unknown; type?: unknown; complete?: unknown }
			| undefined;
		if (!details || typeof details !== "object") return;
		if (details.status !== undefined && details.status !== "success") return;
		// Incremental section submits (array-typed `type` labels) are progress
		// reports, not the final result: only a terminal (untyped) yield ends
		// the run. A forced-final `complete` still ends it.
		if (Array.isArray(details.type) && details.type.length > 0 && details.complete !== true) return;
		yieldCalls += 1;
		if (details.data === undefined && details.useLastTurn === true) {
			yielded = session.getLastAssistantText();
			hasYield = yielded !== undefined;
			return;
		}
		yielded = details.data;
		hasYield = true;
	});
	const sendInitial = async (): Promise<void> => {
		// Queue the suffix behind the live run so both user messages reach the
		// model before it answers: prefix caching then holds the shared prefix
		// across runs with varying dynamic suffixes.
		const run = session.prompt(args.userMessages[0], {
			attribution: "agent",
			runCommands: false,
			expandPromptTemplates: false,
			throwOnDrop: true,
		});
		if (args.userMessages.length > 1) {
			await session.followUp(args.userMessages[1], undefined, {
				attribution: "agent",
				expandPromptTemplates: false,
			});
		}
		try {
			await run;
		} catch (error) {
			throw new Error(
				`${args.ctx}: initial prompt failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		await session.waitForIdle();
	};
	const sendReminder = async (): Promise<void> => {
		try {
			await session.prompt(REMINDER, {
				attribution: "agent",
				runCommands: false,
				expandPromptTemplates: false,
				throwOnDrop: true,
			});
		} catch (error) {
			throw new Error(
				`${args.ctx}: reminder prompt failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		await session.waitForIdle();
	};
	try {
		await sendInitial();
		if (!hasYield) {
			reminderTurns += 1;
			await sendReminder();
		}
		if (!hasYield) {
			throw new Error(`${args.ctx}: model stopped without calling yield`);
		}
		let data = yielded;
		if (typeof data === "string") {
			const trimmed = data.trim();
			if (trimmed) {
				try {
					data = parseJsonWithRepair(trimmed);
				} catch {
					// Keep the raw string; schema validation decides.
				}
			}
		}
		data = validateData(args.outputSchema, data, args.ctx);
		await writeOut(args.outPath, data);
		return { data, outPath: args.outPath, model: args.modelLabel, yieldCalls, reminderTurns };
	} finally {
		unsubscribe();
		await session.dispose().catch(() => {});
	}
}

async function writeOut(outPath: string, data: unknown): Promise<void> {
	const dir = path.dirname(outPath);
	if (dir && dir !== "." && dir !== "") {
		await mkdir(dir, { recursive: true });
	}
	await Bun.write(outPath, `${JSON.stringify(data, null, 2)}\n`);
}
