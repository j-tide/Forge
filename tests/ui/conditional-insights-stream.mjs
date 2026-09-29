/**
 * Real Insights UI -> IPC -> Main SDK -> loopback HTTP -> UI protocol fixtures.
 * This never authenticates an online provider or proves Forge Host acceptance.
 * The caller owns Electron focus and supplies an isolated project and profile.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import {
	captureNativeClipboard,
	restoreNativeClipboard,
} from "./clipboard-fixture-safety.mjs";

export {
	captureNativeClipboard,
	restoreNativeClipboard,
} from "./clipboard-fixture-safety.mjs";

const MODEL = "forge-ui-fixture-model";
const OUTPUT =
	"LOCAL PROTOCOL FIXTURE ONLY: streaming response reached the Insights UI.";
const ERROR = "LOCAL PROTOCOL FIXTURE ONLY: deterministic stream failure.";
const HTTP_ERROR =
	"LOCAL PROTOCOL FIXTURE ONLY: deterministic request rejection.";
const STREAM_PREFIX = "LOCAL PROTOCOL FIXTURE ONLY: pending cancellation.";

/** Bounded, tool-free OpenAI-compatible transport; no forwarding is possible. */
export async function createInsightsLoopbackFixture() {
	const requests = [];
	const rejected = [];
	const sockets = new Set();
	let mode = "success";
	let serial = 0;
	const server = createServer(async (request, response) => {
		const remote = request.socket.remoteAddress;
		const record = {
			index: ++serial,
			method: request.method,
			path: request.url,
			mode,
			remote,
			startedAt: new Date().toISOString(),
			chunks: 0,
			ended: false,
			disconnected: false,
			toolCallsReturned: 0,
		};
		requests.push(record);
		let timer;
		response.on("close", () => {
			clearTimeout(timer);
			record.disconnected = !record.ended;
			record.closedAt = new Date().toISOString();
		});
		const reject = (reason, status = 400) => {
			rejected.push({ index: record.index, reason });
			record.rejection = reason;
			record.ended = true;
			response.writeHead(status, { "Content-Type": "application/json" });
			response.end(
				JSON.stringify({
					error: {
						message: `Fixture rejected ${reason}`,
						type: "fixture_rejection",
					},
				}),
			);
		};
		if (remote !== "127.0.0.1" && remote !== "::ffff:127.0.0.1")
			return reject("non-loopback peer", 403);
		if (request.headers.host !== `127.0.0.1:${server.address()?.port}`)
			return reject("unexpected host", 403);
		if (request.method === "GET" && request.url === "/v1/models") {
			record.ended = true;
			response.writeHead(200, { "Content-Type": "application/json" });
			response.end(
				JSON.stringify({
					object: "list",
					data: [
						{ id: MODEL, object: "model", owned_by: "isolated-ui-fixture" },
					],
				}),
			);
			return;
		}
		if (request.method !== "POST" || request.url !== "/v1/chat/completions")
			return reject("unsupported method or path", 404);
		let body = "";
		try {
			for await (const chunk of request) {
				body += chunk.toString("utf8");
				if (Buffer.byteLength(body) > 1_048_576)
					return reject("oversized request", 413);
			}
			const parsed = JSON.parse(body);
			record.model = parsed.model;
			record.stream = parsed.stream;
			record.messages = parsed.messages?.map((message) => ({
				role: message.role,
				content: message.content,
			}));
			record.toolsProvided = Array.isArray(parsed.tools)
				? parsed.tools.length
				: 0;
			if (
				parsed.model !== MODEL ||
				parsed.stream !== true ||
				!Array.isArray(parsed.messages)
			)
				return reject("unexpected model or request shape");
			if (
				!JSON.stringify(parsed.messages).includes("LOCAL UI TRANSPORT FIXTURE")
			)
				return reject("missing explicit fixture prompt");
		} catch (error) {
			return reject(`invalid request: ${String(error)}`);
		}
		if (record.mode === "http-error") {
			record.error = HTTP_ERROR;
			record.httpStatus = 400;
			record.ended = true;
			response.writeHead(400, { "Content-Type": "application/json" });
			response.end(
				JSON.stringify({
					error: { message: HTTP_ERROR, type: "fixture_error" },
				}),
			);
			return;
		}
		response.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		});
		const send = (payload) => {
			if (!response.destroyed) {
				response.write(`data: ${JSON.stringify(payload)}\n\n`);
				record.chunks++;
			}
		};
		const chunk = (delta, finish_reason = null) => ({
			id: `fixture-${record.index}`,
			object: "chat.completion.chunk",
			created: Math.floor(Date.now() / 1000),
			model: MODEL,
			choices: [{ index: 0, delta, finish_reason }],
		});
		const finish = () => {
			send(chunk({}, "stop"));
			record.ended = true;
			response.end("data: [DONE]\n\n");
		};
		send(chunk({ role: "assistant", content: "" }));
		if (record.mode === "slow") {
			record.output = STREAM_PREFIX;
			send(chunk({ content: STREAM_PREFIX }));
			// If UI cancellation fails, this bounded fixture still terminates.
			timer = setTimeout(() => {
				record.expired = true;
				finish();
			}, 25_000);
		} else if (record.mode === "stream-error") {
			record.error = ERROR;
			record.output =
				"LOCAL PROTOCOL FIXTURE ONLY: partial output before error.";
			send(chunk({ content: record.output }));
			timer = setTimeout(() => {
				send({ error: { message: ERROR, type: "fixture_error" } });
				record.ended = true;
				response.end("data: [DONE]\n\n");
			}, 250);
		} else {
			record.output = `${OUTPUT} Request ${record.index}.`;
			const midpoint = Math.floor(record.output.length / 2);
			send(chunk({ content: record.output.slice(0, midpoint) }));
			timer = setTimeout(() => {
				send(chunk({ content: record.output.slice(midpoint) }));
				finish();
			}, 150);
		}
	});
	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
	return {
		baseUrl: `http://127.0.0.1:${server.address().port}`,
		requests,
		rejected,
		setMode: (value) => {
			assert.ok(
				["success", "slow", "stream-error", "http-error"].includes(value),
			);
			mode = value;
		},
		async close() {
			for (const socket of sockets) socket.destroy();
			await new Promise((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
		},
	};
}

async function waitUntil(check, message, timeout = 12_000) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const result = await check();
		if (result) return result;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(message);
}

export async function walkConditionalInsightsStream(ctx) {
	const {
		app,
		page,
		projectId,
		fixture,
		profile,
		report,
		t,
		button,
		main,
		click,
		fill,
		segment,
		shot,
		blocked,
		nav,
	} = ctx;
	const settings = await page.evaluate(() => window.electronAPI.getSettings());
	assert.ok(settings.success && settings.data);
	const accounts = await page.evaluate(() =>
		window.electronAPI.getProviderAccounts(),
	);
	assert.ok(
		accounts.success && accounts.data.accounts.length === 0,
		"Stream fixture requires an empty isolated provider profile",
	);
	assert.equal(
		report.effectiveDirectories?.userData,
		profile,
		"Stream fixture requires verified isolated userData",
	);
	assert.equal(
		report.project?.path,
		fixture,
		"Stream fixture requires verified isolated project",
	);
	const transport = await createInsightsLoopbackFixture();
	const evidence = {
		scope:
			"OpenAI-compatible HTTP/SSE protocol fixture through current Main SDK using an isolated Ollama account. No online provider, task execution, or complete online task acceptance.",
		baseUrl: transport.baseUrl,
		model: MODEL,
		requests: transport.requests,
		rejectedRequests: transport.rejected,
		ipcEvents: [],
		sdkFetchGuard: [],
		accountRemoved: false,
		fetchGuardRestored: false,
		transportClosed: false,
	};
	report.insightsLoopback = evidence;
	report.fixtureSetup.push({
		kind: "loopback-HTTP-SSE-transport-fixture",
		providerRoute: "ollama -> @ai-sdk/openai-compatible",
		baseUrl: transport.baseUrl,
		model: MODEL,
		hostedProviderAcceptance: false,
	});
	let accountId;
	let clipboardSnapshot;
	try {
		await app.evaluate((_electron, baseUrl) => {
			if (globalThis.__conditionalInsightsFetch)
				throw new Error(
					"An existing Insights fixture fetch guard is still active",
				);
			const originalFetch = globalThis.fetch;
			const state = { originalFetch, events: [], guard: null };
			const origin = new URL(baseUrl).origin;
			state.guard = (input, init) => {
				const url = new URL(
					typeof input === "string" || input instanceof URL
						? String(input)
						: input.url,
				);
				const accepted =
					url.origin === origin &&
					["/v1/chat/completions", "/v1/models"].includes(url.pathname);
				state.events.push({
					url: `${url.origin}${url.pathname}`,
					hasQuery: Boolean(url.search),
					method: init?.method || input?.method || "GET",
					accepted,
				});
				if (!accepted)
					throw new Error(
						"Isolated Insights fixture rejected non-loopback SDK fetch",
					);
				return originalFetch(input, { ...init, redirect: "error" });
			};
			globalThis.__conditionalInsightsFetch = state;
			globalThis.fetch = state.guard;
		}, transport.baseUrl);
		const configured = await page.evaluate(
			async ({ baseUrl, model }) => {
				const saved = await window.electronAPI.saveProviderAccount({
					provider: "ollama",
					name: "LOCAL UI TRANSPORT FIXTURE ONLY",
					authType: "api-key",
					billingModel: "pay-per-use",
					baseUrl,
					customModels: [{ id: model, label: "Local protocol fixture only" }],
				});
				if (!saved.success || !saved.data)
					throw new Error(saved.error || "Fixture account setup failed");
				return saved.data.id;
			},
			{ baseUrl: transport.baseUrl, model: MODEL },
		);
		accountId = configured;
		await page.evaluate(async (model) => {
			const settings = await window.electronAPI.getSettings();
			if (!settings.success || !settings.data)
				throw new Error(settings.error || "Fixture settings read failed");
			const persisted = await window.electronAPI.saveSettings({
				providerAgentConfig: {
					...settings.data.providerAgentConfig,
					ollama: {
						...settings.data.providerAgentConfig?.ollama,
						featureModels: {
							...settings.data.providerAgentConfig?.ollama?.featureModels,
							insights: model,
						},
						featureThinking: {
							...settings.data.providerAgentConfig?.ollama?.featureThinking,
							insights: "low",
						},
					},
				},
			});
			if (!persisted.success)
				throw new Error(
					persisted.error || "Fixture feature config setup failed",
				);
		}, MODEL);
		await page.reload();
		await page.locator(".forge-glass-sidebar").waitFor({ timeout: 30_000 });
		await page.evaluate((projectId) => {
			globalThis.__conditionalInsightsEvents = [];
			const record = (kind, id, value) => {
				if (id === projectId)
					globalThis.__conditionalInsightsEvents.push({
						kind,
						value,
						at: new Date().toISOString(),
					});
			};
			globalThis.__conditionalInsightsUnsubscribe = [
				window.electronAPI.onInsightsStatus((id, status) =>
					record("status", id, status),
				),
				window.electronAPI.onInsightsStreamChunk((id, chunk) =>
					record("chunk", id, chunk),
				),
				window.electronAPI.onInsightsError(
					(id, error, sessionId, requestId, code) =>
						record("error", id, { error, sessionId, requestId, code }),
				),
			];
		}, projectId);
		await nav("insights");
		await expect(main().getByRole("button", { name: new RegExp(MODEL) })).toBeVisible();
		// This is an actual UI session creation; subsequent content enters via UI.
		await click(
			button(await t("uiKnowledgeContext", "newChat"), main()),
			"New Chat for local HTTP/SSE fixture",
		);
		const textarea = main().getByPlaceholder(
			await t("uiKnowledgeContext", "askPlaceholder"),
		);
		const send = button(await t("uiKnowledgeContext", "send"), main());
		const control = (names) =>
			main()
				.getByRole("button", { name: new RegExp(`^(?:${names.join("|")})$`) })
				.last();
		const stop = control([
			"Stop response",
			"Stop generating",
			"Stop generation",
			"Cancel response",
		]);
		const regenerate = control([
			"Regenerate response",
			"Regenerate message",
			"Regenerate",
		]);
		const copy = control(["Copy response", "Copy message", "Copy"]);
		const retryResponse = control(["Retry response", "Retry message"]);
		const sendFixture = async (suffix, mode) => {
			transport.setMode(mode);
			await expect(textarea).toBeEnabled();
			await fill(
				textarea,
				`LOCAL UI TRANSPORT FIXTURE: ${suffix}. No online model is used.`,
				`Enter ${mode} transport fixture prompt`,
			);
			const prior = transport.requests.length;
			await click(
				send,
				`Send ${mode} transport fixture through actual Insights UI`,
			);
			return waitUntil(
				() =>
					transport.requests
						.slice(prior)
						.find((request) => request.method === "POST"),
				`Main SDK did not reach the local ${mode} transport`,
			);
		};
		const session = async () => {
			const result = await page.evaluate(
				(id) => window.electronAPI.getInsightsSession(id),
				projectId,
			);
			assert.ok(result.success && result.data);
			return result.data;
		};

		await segment(
			"conditional-insights-local-stream-send-and-copy",
			async () => {
				const request = await sendFixture(
					"successful tool-free streaming response",
					"success",
				);
				await expect(textarea).toBeEnabled({ timeout: 15_000 });
				await expect(
					main().getByText(request.output, { exact: true }).last(),
				).toBeVisible();
				const stored = await session();
				assert.equal(stored.messages.at(-1)?.content, request.output);
				assert.equal(stored.messages.at(-1)?.role, "assistant");
				if ((await copy.count()) && (await copy.isVisible())) {
					clipboardSnapshot = await captureNativeClipboard(app);
					if (clipboardSnapshot.unsupported.length)
						await blocked(
							"Copy real Insights response",
							`Clipboard contains formats that cannot be restored safely: ${clipboardSnapshot.unsupported.join(", ")}`,
						);
					else {
						try {
							await click(copy, "Copy real local fixture response via UI");
							await waitUntil(
								async () =>
									(await app.evaluate(({ clipboard }) =>
										clipboard.readText(),
									)) === request.output,
								"Copied response does not match rendered response",
							);
						} finally {
							await restoreNativeClipboard(app, clipboardSnapshot);
							evidence.clipboardRestoration =
								"Verified native text/html/rtf contents after the real copy action; image and custom formats are conservatively blocked.";
							clipboardSnapshot = undefined;
						}
					}
				} else
					await blocked(
						"Copy Insights response",
						"Current build has no response copy control",
					);
				await shot("insights-loopback-stream-success");
			},
		);

		await segment("conditional-insights-local-regenerate", async () => {
			if (!(await regenerate.count()) || !(await regenerate.isVisible())) {
				await blocked(
					"Regenerate Insights response",
					"Current build has no regenerate response control",
				);
				return;
			}
			const before = await session();
			transport.setMode("success");
			const prior = transport.requests.length;
			await click(regenerate, "Regenerate local fixture response through UI");
			const request = await waitUntil(
				() =>
					transport.requests
						.slice(prior)
						.find((request) => request.method === "POST"),
				"Regenerate did not reach loopback transport",
			);
			await expect(textarea).toBeEnabled({ timeout: 15_000 });
			await expect(
				main().getByText(request.output, { exact: true }).last(),
			).toBeVisible();
			const after = await session();
			assert.equal(
				after.messages.filter((message) => message.role === "user").length,
				before.messages.filter((message) => message.role === "user").length,
				"Regenerate must not duplicate the user prompt",
			);
			assert.equal(after.messages.at(-1)?.content, request.output);
			assert.equal(
				after.messages.filter((message) => message.role === "assistant").length,
				before.messages.filter((message) => message.role === "assistant")
					.length,
				"Regenerate must replace the selected response rather than append another assistant response",
			);
			await shot("insights-loopback-regenerate");
		});

		await segment("conditional-insights-local-stop-stream", async () => {
			// Stop is shown only during loading; check source to avoid creating a
			// 25-second uninterruptible stream in an older build lacking the control.
			const sourceRoot = path.resolve(
				path.dirname(fileURLToPath(import.meta.url)),
				"../../src",
			);
			const source = await readFile(
				path.join(sourceRoot, "renderer/components/Insights.tsx"),
				"utf8",
			);
			if (
				!/cancelInsights|stopResponse|stopGeneration|cancelResponse|cancelMessage|handleCancel/.test(
					source,
				)
			) {
				await blocked(
					"Stop Insights streaming",
					"Current source/build has no streaming cancellation control",
				);
				return;
			}
			const request = await sendFixture(
				"long-running bounded cancellation stream",
				"slow",
			);
			await expect(
				main().getByText(STREAM_PREFIX, { exact: true }).last(),
			).toBeVisible();
			await expect(stop).toBeVisible({ timeout: 5_000 });
			await click(stop, "Stop active local fixture stream through real UI");
			await waitUntil(
				() => request.disconnected,
				"Stop did not close the real HTTP stream",
				10_000,
			);
			assert.equal(
				request.expired,
				undefined,
				"Stop must precede bounded fixture expiration",
			);
			await expect(textarea).toBeEnabled({ timeout: 10_000 });
			assert.equal(
				(await session()).messages.some(
					(message) =>
						message.role === "assistant" && message.content === STREAM_PREFIX,
				),
				false,
				"Cancelled partial output must not be persisted as a completed assistant response",
			);
			await shot("insights-loopback-stream-stopped");
		});

		await segment(
			"conditional-insights-local-http-and-stream-errors",
			async () => {
				const failureLabel = await t(
					"uiKnowledgeContext",
					"generationErrors.request-failed",
				);
				for (const [mode, expectedError] of [
					["http-error", HTTP_ERROR],
					["stream-error", ERROR],
				]) {
					const before = await session();
					const request = await sendFixture(
						`deterministic ${mode} visibility`,
						mode,
					);
					await expect(
						main().getByRole("alert").filter({ hasText: failureLabel }).last(),
					).toBeVisible({ timeout: 15_000 });
					assert.equal(
						request.error,
						expectedError,
						"The actual loopback transport emitted the labelled fixture failure",
					);
					await expect(textarea).toBeEnabled({ timeout: 10_000 });
					const after = await session();
					assert.equal(
						after.messages.filter((message) => message.role === "assistant")
							.length,
						before.messages.filter((message) => message.role === "assistant")
							.length,
						"Failed output must not become a successful persisted assistant response",
					);
					await shot(`insights-loopback-${mode}`);
				}
				let retry;
				if (
					(await retryResponse.count()) &&
					(await retryResponse.isVisible())
				) {
					const before = await session();
					transport.setMode("success");
					const prior = transport.requests.length;
					await click(
						retryResponse,
						"Retry unanswered local fixture prompt through real UI",
					);
					retry = await waitUntil(
						() =>
							transport.requests
								.slice(prior)
								.find((request) => request.method === "POST"),
						"Retry did not reach local HTTP transport",
					);
					await expect(textarea).toBeEnabled({ timeout: 15_000 });
					const after = await session();
					assert.equal(
						after.messages.filter((message) => message.role === "user").length,
						before.messages.filter((message) => message.role === "user").length,
						"Retry must not duplicate the unanswered user prompt",
					);
					assert.equal(
						after.messages.filter((message) => message.role === "assistant")
							.length,
						before.messages.filter((message) => message.role === "assistant")
							.length + 1,
						"Retry must add exactly one successful response for the unanswered prompt",
					);
				} else {
					await blocked(
						"Retry Insights response",
						"Current build has no retry response control for the unanswered prompt",
					);
					retry = await sendFixture(
						"successful retry after visible transport errors",
						"success",
					);
				}
				await expect(textarea).toBeEnabled({ timeout: 15_000 });
				await expect(
					main().getByText(retry.output, { exact: true }).last(),
				).toBeVisible();
			},
		);
		assert.equal(
			transport.rejected.length,
			0,
			"Local fixture received an unsupported request",
		);
	} finally {
		const cleanupErrors = [];
		if (clipboardSnapshot && !clipboardSnapshot.unsupported.length)
			await restoreNativeClipboard(app, clipboardSnapshot).catch((error) =>
				cleanupErrors.push(`Clipboard restoration: ${String(error)}`),
			);
		evidence.ipcEvents = await page
			.evaluate(() => {
				const events = globalThis.__conditionalInsightsEvents || [];
				for (const cleanup of globalThis.__conditionalInsightsUnsubscribe || [])
					cleanup();
				delete globalThis.__conditionalInsightsUnsubscribe;
				return events;
			})
			.catch((error) => [{ cleanupError: String(error) }]);
		const guardCleanup = await app
			.evaluate(() => {
				const state = globalThis.__conditionalInsightsFetch;
				if (!state)
					return {
						events: [],
						restored: false,
						mismatch: "Missing guard state",
					};
				const restored = globalThis.fetch === state.guard;
				if (restored) globalThis.fetch = state.originalFetch;
				const events = state.events;
				if (restored) delete globalThis.__conditionalInsightsFetch;
				return {
					events,
					restored,
					mismatch: restored
						? undefined
						: "Main fetch changed while the fixture guard was active",
				};
			})
			.catch((error) => ({
				events: [],
				restored: false,
				mismatch: String(error),
			}));
		evidence.sdkFetchGuard = guardCleanup.events;
		evidence.fetchGuardRestored = guardCleanup.restored;
		if (!guardCleanup.restored)
			cleanupErrors.push(
				`SDK fetch guard restoration: ${guardCleanup.mismatch}`,
			);
		if (evidence.ipcEvents.some((event) => event.cleanupError))
			cleanupErrors.push("Insights IPC listener cleanup failed");
		if (accountId) {
			try {
				const removed = await page.evaluate(
					(id) => window.electronAPI.deleteProviderAccount(id),
					accountId,
				);
				evidence.accountRemoved = removed.success;
				if (!removed.success)
					cleanupErrors.push(
						"Disposable local transport account cleanup failed",
					);
			} catch (error) {
				cleanupErrors.push(`Account cleanup: ${String(error)}`);
			}
		}
		try {
			const restored = await page.evaluate(
				(providerAgentConfig) =>
					window.electronAPI.saveSettings({ providerAgentConfig }),
				settings.data.providerAgentConfig ?? {},
			);
			if (!restored.success)
				cleanupErrors.push("Isolated per-provider settings cleanup failed");
		} catch (error) {
			cleanupErrors.push(`Settings restoration: ${String(error)}`);
		}
		try {
			await transport.close();
			evidence.transportClosed = true;
		} catch (error) {
			cleanupErrors.push(`Transport cleanup: ${String(error)}`);
		}
		try {
			const remaining = await page.evaluate(() =>
				window.electronAPI.getProviderAccounts(),
			);
			if (!remaining.success || remaining.data.accounts.length)
				cleanupErrors.push("A fixture provider account remains");
		} catch (error) {
			cleanupErrors.push(`Account cleanup verification: ${String(error)}`);
		}
		if (!evidence.sdkFetchGuard.every((event) => event.accepted))
			cleanupErrors.push("The SDK attempted an out-of-fixture fetch");
		const actualPosts = transport.requests.filter(
			(request) => request.method === "POST",
		).length;
		const guardedPosts = evidence.sdkFetchGuard.filter(
			(event) => event.accepted && event.method === "POST",
		).length;
		evidence.sdkPostRequests = { actual: actualPosts, guarded: guardedPosts };
		if (actualPosts !== guardedPosts)
			cleanupErrors.push(
				"SDK POST requests did not all pass through the loopback fetch guard",
			);
		evidence.cleanupErrors = cleanupErrors;
		assert.deepEqual(
			cleanupErrors,
			[],
			"Local transport fixture cleanup or egress verification failed",
		);
	}
}
