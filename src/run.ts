import { createHash } from "node:crypto";
import * as path from "node:path";
import { mkdir } from "node:fs/promises";
import {
	completeSimple,
	retryTransientCompletion,
	type Api,
	type ApiKey,
	type AssistantMessage,
	type Context,
	type Model,
	type SimpleStreamOptions,
} from "@oh-my-pi/pi-ai";
import type { Usage } from "@oh-my-pi/pi-catalog/types";
import { markPerCallContextMessage } from "@oh-my-pi/pi-ai/utils/block-symbols";
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
	type RoleChainCandidate,
	} from "@oh-my-pi/pi-coding-agent/config/model-resolver";
import { buildNamedToolChoice } from "@oh-my-pi/pi-coding-agent/utils/tool-choice";
import { buildOutputValidator } from "@oh-my-pi/pi-coding-agent/tools/output-schema-validator";
import { parseJsonWithRepair } from "@oh-my-pi/pi-utils";
import type { ConfiguredThinkingLevel } from "@oh-my-pi/pi-tui/thinking";
import {
	concreteThinkingLevel,
	parseConfiguredThinkingLevel,
	shouldDisableReasoning,
	toReasoningEffort,
} from "@oh-my-pi/pi-tui/thinking";
import { loadSpec, splitCacheBoundary, substituteVars } from "./spec.js";

export class UsageError extends Error {
	override name = "UsageError";
}

export interface RunOptions {
	specPath: string;
	outPath: string;
	inputPaths: string[];
	cwd?: string;
	modelOverride?: string;
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

// `anthropic-beta` token that gates Anthropic's structured-output `output_config.format`
// (exported as `structuredOutputsBeta` from pi-ai's anthropic-headers module, which lives
// outside the published type surface, so the literal is pinned here).
const ANTHROPIC_STRUCTURED_OUTPUTS_BETA = "structured-outputs-2025-12-15";

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
	if (error) throw new Error(`${ctx}: cannot build output validator: ${error}`);
	if (!validator) return data;
	const normalized = validator.normalize(data);
	const result = validator.validate(normalized);
	if (!result.success) {
		throw new Error(`${ctx}: output does not match schema: ${formatIssues(result.issues)}`);
	}
	return normalized;
}

function usageLine(usage: Partial<Usage> | undefined): void {
	const num = (value: unknown): number =>
		typeof value === "number" && Number.isFinite(value) ? value : 0;
	const line = {
		input: num(usage?.input),
		output: num(usage?.output),
		cacheRead: num(usage?.cacheRead),
		cacheWrite: num(usage?.cacheWrite),
	};
	process.stderr.write(`omp-json-runner usage ${JSON.stringify(line)}\n`);
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function childRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
	const child = toRecord(parent[key]);
	if (child) return child;
	const fresh: Record<string, unknown> = {};
	parent[key] = fresh;
	return fresh;
}
function mergeBetaHeader(
	headers: Record<string, string> | undefined,
	beta: string,
): Record<string, string> {
	const merged: Record<string, string> = {};
	let betaKey: string | undefined;
	let betaValue: string | undefined;
	for (const [key, value] of Object.entries(headers ?? {})) {
		if (key.toLowerCase() === "anthropic-beta") {
			betaKey = key;
			betaValue = value;
		} else {
			merged[key] = value;
		}
	}
	const tokens = (betaValue ?? "").split(",").map(token => token.trim()).filter(Boolean);
	if (!tokens.includes(beta)) tokens.push(beta);
	merged[betaKey ?? "anthropic-beta"] = tokens.join(",");
	return merged;
}


/**
 * `SimpleStreamOptions.onPayload` hook that forces provider-native structured JSON output
 * for the no-tool path. Never throws: injection failures leave the payload untouched and
 * the parseJsonWithRepair + schema-validation net below still applies.
 */
function jsonPayloadHook(outputSchema: unknown): NonNullable<SimpleStreamOptions["onPayload"]> {
	return (payload: unknown, model?: Model<Api>) => {
		try {
			const params = toRecord(payload);
			if (!params || !model) return undefined;
			const api = model.api;
			if (api === "openai-completions" || api === "openrouter") {
				params.response_format = {
					type: "json_schema",
					json_schema: { name: "output", schema: outputSchema, strict: false },
				};
				return undefined;
			}
			if (api === "openai-responses" || api === "openai-codex-responses" || api === "azure-openai-responses") {
				const text = childRecord(params, "text");
				if (text) {
					text.format = { type: "json_schema", name: "output", schema: outputSchema };
				}
				return undefined;
			}
			if (api === "anthropic-messages" || api === "bedrock-converse-stream") {
				const outputConfig = childRecord(params, "output_config");
				if (outputConfig) {
					outputConfig.format = { type: "json_schema", schema: outputSchema };
				}
				return undefined;
			}
			if (api === "google-generative-ai" || api === "google-vertex") {
				const config = childRecord(params, "config");
				if (config) {
					config.responseMimeType = "application/json";
					config.responseSchema = jsonSchemaToGoogleSchema(outputSchema);
				}
				return undefined;
			}
			if (api === "google-gemini-cli") {
				const request = toRecord(params.request);
				const generationConfig = request ? childRecord(request, "generationConfig") : undefined;
				if (generationConfig) {
					generationConfig.responseMimeType = "application/json";
					generationConfig.responseSchema = jsonSchemaToGoogleSchema(outputSchema);
				}
				return undefined;
			}
			if (api === "ollama-chat") {
				params.format = "json";
				return undefined;
			}
			params.response_format = { type: "json_object" };
			return undefined;
		} catch {
			return undefined;
		}
	};
}

/** Strip JSON Schema keywords Gemini rejects; best effort, the validation net still applies. */
function jsonSchemaToGoogleSchema(schema: unknown): unknown {
	if (Array.isArray(schema)) return schema.map(jsonSchemaToGoogleSchema);
	if (typeof schema !== "object" || schema === null) return schema;
	const input = schema as Record<string, unknown>;
	const output: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input)) {
		if (key === "$schema" || key === "$id" || key === "$defs" || key === "definitions") continue;
		if (key === "additionalProperties" && typeof value !== "boolean") continue;
		output[key] = jsonSchemaToGoogleSchema(value);
	}
	return output;
}

/**
 * Prefix a bare role name (`default`, `task`, …) to its `@role` alias form so the
 * resolver treats it as a role rather than a model pattern. Unknown names pass through.
 */
function normalizeRolePattern(specModel: string, settings: Settings): string {
	const trimmed = specModel.trim();
	if (trimmed.includes("/") || trimmed.startsWith("@")) return trimmed;
	// Only prefix when the bare name is a CONFIGURED role: a bare model id must keep
	// matching the catalog, and `resolveExplicitModelRole` + `resolveRoleChain` handle
	// the `@role` form downstream.
	const roles = settings.getModelRoles();
	if (roles && Object.hasOwn(roles, trimmed)) return `@${trimmed}`;
	return trimmed;
}

function reasoningFor(level: ConfiguredThinkingLevel | undefined): Pick<SimpleStreamOptions, "reasoning" | "disableReasoning"> {
	if (level === undefined) return {};
	const concrete = concreteThinkingLevel(level);
	if (shouldDisableReasoning(concrete)) return { disableReasoning: true };
	const reasoning = toReasoningEffort(concrete);
	return reasoning === undefined ? {} : { reasoning };
}

/**
 * Resolve the spec's model pattern to role-chain candidates in attempt order: the primary
 * match first, then the role's retry chain. Returns RoleChainCandidates (with thinking
 * levels); the caller applies the auth preflight and per-attempt fallback.
 */
function resolveCandidates(
	specModel: string,
	settings: Settings,
	modelRegistry: ModelRegistry,
): RoleChainCandidate[] {
	const pattern = normalizeRolePattern(specModel, settings);
	const available = modelRegistry.getAvailable();
	const seen = new Set<string>();
	const candidates: RoleChainCandidate[] = [];
	const push = (candidate: RoleChainCandidate | undefined): void => {
		if (!candidate) return;
		const key = `${candidate.model.provider}/${candidate.model.id}`;
		if (seen.has(key)) return;
		seen.add(key);
		candidates.push(candidate);
	};
	const expanded = expandRoleAlias(pattern, settings);
	const override = resolveModelOverride([expanded], modelRegistry, settings);
	if (override.model) {
		push({ model: override.model, explicit: true, thinkingLevel: override.thinkingLevel });
	}
	const role = resolveExplicitModelRole(pattern, settings);
	if (role) {
		for (const candidate of resolveRoleChain(role, settings, available)) push(candidate);
	}
	return candidates;
}

async function runNoTools(args: {
	candidates: RoleChainCandidate[];
	modelRegistry: ModelRegistry;
	system: string;
	staticPrefix: string;
	dynamicSuffix: string;
	outputSchema: unknown;
	specThinking: ConfiguredThinkingLevel | undefined;
	ctx: string;
}): Promise<{ data: unknown; usage: Usage | undefined }> {
	const { candidates, modelRegistry, system, staticPrefix, dynamicSuffix, outputSchema, specThinking, ctx } = args;
	if (candidates.length === 0) {
		throw new Error(`${ctx}: cannot resolve model (no match, or no working credentials)`);
	}
	const sessionId = `omp-json-runner-${Date.now().toString(36)}`;
	const context: Context = {
		systemPrompt: [system],
		messages: [
			{ role: "user" as const, content: staticPrefix, timestamp: Date.now() },
			...(dynamicSuffix
				? [{ role: "user" as const, content: dynamicSuffix, timestamp: Date.now() }]
				: []),
		],
	};
	const suffix = context.messages[context.messages.length - 1];
	if (suffix && typeof suffix === "object") markPerCallContextMessage(suffix);
	const onPayload = jsonPayloadHook(outputSchema);
	let lastError: string | undefined;
	for (const candidate of candidates) {
		const candidateModel = candidate.model;
		// Anthropic's structured-output beta reaches the wire through `model.headers`
		// (merged into the client's beta header). Clone per attempt so the beta never
		// leaks into the shared registry model.
		const model: Model<Api> =
			candidateModel.api === "anthropic-messages"
				? {
						...candidateModel,
						headers: mergeBetaHeader(candidateModel.headers, ANTHROPIC_STRUCTURED_OUTPUTS_BETA),
					}
				: candidateModel;
		const candidateCtx = `${ctx} [${model.provider}/${model.id}]`;
		let apiKey: ApiKey | undefined;
		try {
			apiKey = modelRegistry.resolver(model, sessionId);
		} catch {
			apiKey = undefined;
		}
		if (apiKey === undefined) {
			try {
				const key = await modelRegistry.getApiKey(model, sessionId);
				if (key === kNoAuth) apiKey = undefined;
				else if (isAuthenticated(key)) apiKey = key;
				else {
					lastError = `${candidateCtx}: no working credentials for ${model.provider}`;
					continue;
				}
			} catch (error) {
				lastError = `${candidateCtx}: credential lookup failed: ${error instanceof Error ? error.message : String(error)}`;
				continue;
			}
		}
		const reasoning = reasoningFor(candidate.thinkingLevel ?? specThinking);
		const completeOnce = async (): Promise<AssistantMessage> => {
			try {
				return await completeSimple(model, context, {
					apiKey,
					...reasoning,
					onPayload,
					promptCacheKey: createHash("sha256")
						.update(system)
						.update("\0")
						.update(staticPrefix)
						.update("\0")
						.update(`${model.provider}/${model.id}`)
						.digest("hex"),
					sessionId,
				});
			} catch (error) {
				throw new Error(
					`${candidateCtx}: completion failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		};
		let message: AssistantMessage;
		try {
			message = await retryTransientCompletion(() => completeOnce(), { provider: model.provider });
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
			continue;
		}
		if (message.stopReason === "error" || message.stopReason === "aborted") {
			lastError = `${candidateCtx}: completion ${message.stopReason}: ${message.errorMessage ?? "unknown error"}`;
			continue;
		}
		if (message.stopReason === "length") {
			throw new Error(`${candidateCtx}: response truncated (length limit)`);
		}
		const text = assistantText(message).trim();
		if (!text) {
			lastError = `${candidateCtx}: model returned empty response`;
			continue;
		}
		let data: unknown;
		try {
			data = parseJsonWithRepair(text);
		} catch (error) {
			lastError = `${candidateCtx}: response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
			continue;
		}
		return { data: validateData(outputSchema, data, candidateCtx), usage: message.usage };
	}
	throw new Error(lastError ?? `${ctx}: completion failed`);
}

export async function run(options: RunOptions): Promise<RunResult> {
	const cwd = options.cwd ?? process.cwd();
	const spec = await loadSpec(options.specPath);
	if (options.modelOverride !== undefined) {
		const trimmed = options.modelOverride.trim();
		if (!trimmed) {
			throw new UsageError(`spec ${options.specPath}: --model override cannot be empty`);
		}
		spec.model = trimmed;
	}
	if (options.inputPaths.length !== spec.args) {
		throw new UsageError(
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
	// Split on the RAW template so a `$$`-escaped marker from an input cannot act as the
	// boundary; trim halves before substitution so input edge whitespace is preserved.
	const rawSplit = splitCacheBoundary(spec.user);
	const halves = rawSplit
		? [rawSplit.staticPrefix, rawSplit.dynamicSuffix]
		: [spec.user, ""];
	const [staticPrefix, dynamicSuffix] = [substituteVars(halves[0], inputs), halves[1] ? substituteVars(halves[1], inputs) : ""];
	const userText = rawSplit ? `${staticPrefix}\n\n${dynamicSuffix}` : staticPrefix;
	if (!userText.trim()) {
		throw new UsageError(`spec ${options.specPath}: user prompt is empty after substitution`);
	}

	const specThinking = parseConfiguredThinkingLevel(spec.thinkingLevel ?? null) ?? undefined;

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

	const candidates = resolveCandidates(spec.model, settings, modelRegistry);
	if (candidates.length === 0) {
		throw new Error(
			`${contextOf(options.specPath, spec.model)}: cannot resolve model (no match, or no working credentials)`,
		);
	}
	const primary = candidates[0].model;
	const modelLabel = `${primary.provider}/${primary.id}`;
	const ctx = contextOf(options.specPath, modelLabel);
	const thinkingLevel = candidates[0].thinkingLevel ?? specThinking;

	if (spec.tools.length === 0) {
		const { data, usage } = await runNoTools({
			candidates,
			modelRegistry,
			system: `${system}\n\nRespond with a single JSON object matching this output schema. Do not wrap it in code fences:\n${JSON.stringify(spec.output)}`,
			staticPrefix: rawSplit ? staticPrefix : userText,
			dynamicSuffix: rawSplit ? dynamicSuffix : "",
			outputSchema: spec.output,
			specThinking,
			ctx,
		});
		usageLine(usage);
		await writeOut(options.outPath, data);
		return { data, outPath: options.outPath, model: modelLabel, yieldCalls: 0, reminderTurns: 0 };
	}

	return await runWithTools({
		model: primary,
		cwd,
		settings,
		modelRegistry,
		outPath: options.outPath,
		specPath: options.specPath,
		specModel: spec.model,
		system,
		userText,
		outputSchema: spec.output,
		toolNames: spec.tools,
		modelLabel,
		thinkingLevel,
		ctx,
	});
}

async function runWithTools(args: {
	cwd: string;
	settings: Settings;
	modelRegistry: ModelRegistry;
	model: Model<Api>;
	outPath: string;
	specPath: string;
	specModel: string;
	system: string;
	userText: string;
	outputSchema: unknown;
	toolNames: string[];
	modelLabel: string;
	thinkingLevel: ConfiguredThinkingLevel | undefined;
	ctx: string;
}): Promise<RunResult> {
	const sessionOptions: CreateAgentSessionOptions = {
		cwd: args.cwd,
		settings: args.settings,
		modelRegistry: args.modelRegistry,
		model: args.model,
		modelPattern: normalizeRolePattern(args.specModel, args.settings),
		modelPatternFallbackRole: `subagent:omp-json-runner:${Date.now().toString(36)}`,
		thinkingLevel: args.thinkingLevel,
		// The yield instruction rides the spec system prompt (which replaces
		// the default blocks); the yield tool itself validates `data` against
		// the output schema at call time.
		systemPrompt: [
			`${args.system}\n\nWhen the task is complete, call the yield tool with the final JSON object as \`data\`. The data MUST match the output schema. Do not call yield for interim results.`,
		],
		toolNames: args.toolNames,
		restrictToolNames: true,
		noContextFiles: true,
		enableMCP: false,
		disableExtensionDiscovery: true,
		cacheWarming: false,
		skills: [],
		rules: [],
		promptTemplates: [],
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
	let abortedYieldError: string | undefined;
	const unsubscribe = session.subscribe(event => {
		if (event.type !== "tool_execution_end" || event.toolName !== "yield") return;
		const details = (event.result as { details?: unknown } | undefined)?.details as
			| { data?: unknown; status?: unknown; error?: unknown; useLastTurn?: unknown; type?: unknown; complete?: unknown }
			| undefined;
		if (!details || typeof details !== "object") return;
		if (event.isError || details.status === "aborted") {
			if (typeof details.error === "string" && details.error) abortedYieldError = details.error;
			return;
		}
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
	try {
		try {
			await session.prompt(args.userText, {
				attribution: "agent",
				runCommands: false,
				expandPromptTemplates: false,
				throwOnDrop: true,
			});
		} catch (error) {
			throw new Error(
				`${args.ctx}: initial prompt failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		await session.waitForIdle();
		if (!hasYield) {
			reminderTurns += 1;
			try {
				await session.prompt(REMINDER, {
					attribution: "agent",
					runCommands: false,
					expandPromptTemplates: false,
					throwOnDrop: true,
					toolChoice: buildNamedToolChoice("yield", session.model),
					synthetic: true,
				});
			} catch (error) {
				throw new Error(
					`${args.ctx}: reminder prompt failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			await session.waitForIdle();
		}
		if (!hasYield) {
			throw new Error(
				abortedYieldError
					? `${args.ctx}: yield aborted: ${abortedYieldError}`
					: `${args.ctx}: model stopped without calling yield`,
			);
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
		let usage: Partial<Usage> | undefined;
		try {
			const stats = session.getSessionStats();
			usage = stats.tokens;
		} catch {
			usage = undefined;
		}
		usageLine(usage);
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
