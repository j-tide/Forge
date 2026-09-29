/**
 * Persisted, explicitly synthetic Insights suggestions and tool-history UI.
 * Only the subsequent task creation is a real local Main mutation. Neither the
 * fixture messages nor tool rows represent model execution or Forge acceptance.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
	mkdir,
	readFile,
	realpath,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";

const SESSION_ID =
	/^session-(?:\d{1,20}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

function inside(target, root) {
	assert.ok(
		path.resolve(target).startsWith(path.resolve(root) + path.sep),
		`Fixture path must be inside isolated project: ${target}`,
	);
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function walkConditionalInsightsSuggestions(ctx) {
	const {
		page,
		app,
		projectId,
		fixture,
		profile,
		report,
		t,
		button,
		main,
		click,
		press,
		segment,
		shot,
		blocked,
		nav,
	} = ctx;
	assert.equal(
		report.project?.path,
		fixture,
		"Suggestions require a verified isolated project",
	);
	assert.equal(
		report.effectiveDirectories?.userData,
		profile,
		"Suggestions require a verified isolated profile",
	);
	const effective = await app.evaluate(({ app: application }) =>
		application.getPath("userData"),
	);
	assert.equal(effective, profile);
	const accounts = await page.evaluate(() =>
		window.electronAPI.getProviderAccounts(),
	);
	assert.ok(
		accounts.success && accounts.data.accounts.length === 0,
		"Offline suggestions fixture requires no model accounts",
	);
	const created = await page.evaluate(
		(id) => window.electronAPI.newInsightsSession(id),
		projectId,
	);
	assert.ok(
		created.success && created.data && SESSION_ID.test(created.data.id),
		"Main must create a valid session identity",
	);
	const sessionId = created.data.id;
	const sessionsDir = path.join(
		fixture,
		".forge-glass-preview",
		"insights",
		"sessions",
	);
	await mkdir(sessionsDir, { recursive: true });
	inside(await realpath(sessionsDir), await realpath(fixture));
	const sessionPath = path.join(sessionsDir, `${sessionId}.json`);
	inside(sessionPath, fixture);
	const now = new Date().toISOString();
	const suffix = randomUUID().slice(0, 8);
	const title = `SYNTHETIC Insights suggestion fixture ${suffix}`;
	const assistantText =
		"SYNTHETIC UI FIXTURE ONLY: these suggestions and tool rows were persisted for interaction QA. No model or tool execution occurred.";
	const suggestions = [
		{
			title: `Conditional suggested task A ${suffix}`,
			description:
				"Explicit synthetic suggestion A for local Create Task UI. No model generated this proposal; creating it only writes a pending plan and never starts execution.",
			metadata: { category: "ui_ux", complexity: "simple" },
		},
		{
			title: `Conditional suggested task B ${suffix}`,
			description:
				"Explicit synthetic suggestion B for a second independent card action. This fixture is not an approved task execution contract or Forge Host acceptance.",
			metadata: { category: "documentation", complexity: "medium" },
		},
	];
	const assistantMessageId = `fixture-assistant-${suffix}`;
	const toolsUsed = [
		{
			name: "Read",
			input: "SYNTHETIC tool row: README.md; no file was read by an agent.",
			timestamp: now,
		},
		{
			name: "Glob",
			input: "SYNTHETIC tool row: **/*.md; no search was performed.",
			timestamp: now,
		},
		{
			name: "Grep",
			input: "SYNTHETIC tool row: fixture-only; no search was performed.",
			timestamp: now,
		},
		{
			name: "FixtureUnknownTool",
			input: "SYNTHETIC fallback icon row; no tool exists or ran.",
			timestamp: now,
		},
	];
	const persisted = {
		...created.data,
		id: sessionId,
		projectId,
		title,
		createdAt: now,
		updatedAt: now,
		messages: [
			{
				id: `fixture-user-${suffix}`,
				role: "user",
				content:
					"SYNTHETIC UI FIXTURE ONLY: offline suggestion rendering request.",
				timestamp: now,
			},
			{
				id: assistantMessageId,
				role: "assistant",
				content: assistantText,
				timestamp: now,
				suggestedTasks: suggestions,
				toolsUsed,
			},
		],
	};
	await writeFile(sessionPath, JSON.stringify(persisted, null, 2));
	// switchInsightsSession explicitly uses Main's disk reader and updates its
	// cache, so a Renderer reload or a new Electron runtime is unnecessary.
	const loaded = await page.evaluate(
		({ projectId, sessionId }) =>
			window.electronAPI.switchInsightsSession(projectId, sessionId),
		{ projectId, sessionId },
	);
	assert.ok(loaded.success && loaded.data);
	assert.equal(loaded.data.id, sessionId);
	assert.equal(loaded.data.messages[1].content, assistantText);
	assert.deepEqual(loaded.data.messages[1].suggestedTasks, suggestions);
	assert.equal(loaded.data.messages[1].toolsUsed.length, toolsUsed.length);
	report.fixtureSetup.push({
		kind: "persisted-synthetic-insights-suggestions-and-tools",
		projectId,
		sessionId,
		sessionPath,
		suggestions: suggestions.map((suggestion) => suggestion.title),
		tools: toolsUsed.map((tool) => tool.name),
		realModelExecution: false,
		realToolExecution: false,
		reader:
			"Actual Main switchInsightsSession disk reader verified fixture contents",
	});
	report.insightsSuggestions = {
		scope:
			"Synthetic offline messages/tools, with real local task creation into backlog. No executor or online model.",
		sessionId,
		sessionPath,
		createdTasks: [],
	};
	await nav("kanban");
	await nav("insights");
	await expect(main().getByText(assistantText, { exact: true })).toBeVisible({
		timeout: 15_000,
	});
	const row = main()
		.locator('div[role="button"]')
		.filter({ has: page.getByText(title, { exact: true }) })
		.first();
	await click(
		row,
		"Select persisted synthetic suggestion session via actual history UI",
	);
	await expect(main().getByText(assistantText, { exact: true })).toBeVisible();

	await segment("conditional-insights-suggested-tools-history", async () => {
		const label = await t("uiKnowledgeContext", "toolsUsed", {
			count: toolsUsed.length,
		});
		const toggle = main().getByRole("button", {
			name: new RegExp(escapeRegex(label)),
		});
		await expect(
			main().getByText(toolsUsed[0].input, { exact: true }),
		).toHaveCount(0);
		await click(toggle, "Expand explicitly synthetic Insights tool history");
		for (const tool of toolsUsed) {
			await expect(main().getByText(tool.name, { exact: true })).toBeVisible();
			await expect(main().getByText(tool.input, { exact: true })).toBeVisible();
		}
		if ((await toggle.getAttribute("aria-expanded")) !== null)
			await expect(toggle).toHaveAttribute("aria-expanded", "true");
		await shot("insights-synthetic-tools-expanded");
		await click(toggle, "Collapse explicitly synthetic Insights tool history");
		for (const tool of toolsUsed)
			await expect(main().getByText(tool.input, { exact: true })).toHaveCount(
				0,
			);
		if ((await toggle.getAttribute("aria-expanded")) !== null)
			await expect(toggle).toHaveAttribute("aria-expanded", "false");
		await toggle.focus();
		await press("Enter", "Expand synthetic tool history by keyboard");
		await expect(
			main().getByText(toolsUsed[0].input, { exact: true }),
		).toBeVisible();
		await press("Enter", "Collapse synthetic tool history by keyboard");
		await expect(
			main().getByText(toolsUsed[0].input, { exact: true }),
		).toHaveCount(0);
	});

	await segment(
		"conditional-insights-suggested-create-failure-preserves-card",
		async () => {
			const specs = path.join(fixture, ".forge-glass-preview", "specs");
			const heldSpecs = path.join(
				fixture,
				".forge-glass-preview",
				`specs-held-for-insights-failure-${suffix}`,
			);
			await mkdir(specs, { recursive: true });
			inside(await realpath(specs), await realpath(fixture));
			inside(heldSpecs, fixture);
			const before = await page.evaluate(
				(id) => window.electronAPI.getTasks(id, { forceRefresh: true }),
				projectId,
			);
			assert.ok(before.success && before.data);
			const guard = {
				kind: "isolated-insights-task-write-failure",
				path: specs,
				heldPath: heldSpecs,
				reason:
					"A labelled file temporarily replaces only the disposable specs directory, forcing real Main refusal before any task write",
				restored: false,
			};
			report.fixtureSetup.push(guard);
			await rename(specs, heldSpecs);
			try {
				await writeFile(
					specs,
					"EXPLICIT UI FAILURE FIXTURE ONLY: original specs directory held beside this file for guaranteed restoration.\n",
					{ flag: "wx" },
				);
				const card = main()
					.getByRole("heading", {
						name: suggestions[0].title,
						level: 4,
						exact: true,
					})
					.locator("..");
				const createButton = button(
					await t("common", "insights.createTask"),
					card,
				);
				await click(
					createButton,
					"Create Task real isolated filesystem failure",
				);
				await page
					.getByText(await t("uiKnowledgeContext", "createTaskFailed"), {
						exact: true,
					})
					.last()
					.waitFor({ timeout: 10_000 });
				await expect(createButton).toBeEnabled();
				await expect(
					card.getByText(suggestions[0].description, { exact: true }),
				).toBeVisible();
				await expect(
					button(await t("common", "insights.taskCreated"), card),
				).toHaveCount(0);
				await shot("insights-suggestion-create-failure-visible");
			} finally {
				guard.cleanupErrors = [];
				try {
					await rm(specs, { force: true });
				} catch (error) {
					guard.cleanupErrors.push(`Guard removal: ${String(error)}`);
				}
				try {
					await rename(heldSpecs, specs);
					guard.restored = true;
				} catch (error) {
					guard.cleanupErrors.push(
						`Original specs directory restoration: ${String(error)}`,
					);
				}
				assert.deepEqual(
					guard.cleanupErrors,
					[],
					"The isolated failure fixture was not fully restored",
				);
			}
			const sessionAfterFailure = await page.evaluate(
				({ projectId, sessionId }) =>
					window.electronAPI.switchInsightsSession(projectId, sessionId),
				{ projectId, sessionId },
			);
			assert.ok(sessionAfterFailure.success && sessionAfterFailure.data);
			assert.equal(
				sessionAfterFailure.data.messages[1].suggestedTasks[0].createdTaskId,
				undefined,
				"A failed card action must not mark the persisted suggestion as created",
			);
			const after = await page.evaluate(
				(id) => window.electronAPI.getTasks(id, { forceRefresh: true }),
				projectId,
			);
			assert.ok(after.success && after.data);
			assert.deepEqual(
				after.data.map((task) => task.id).sort(),
				before.data.map((task) => task.id).sort(),
				"Failed card creation must not add or remove tasks",
			);
		},
	);

	await segment(
		"conditional-insights-suggested-create-backlog-tasks",
		async () => {
			const before = await page.evaluate(
				(id) => window.electronAPI.getTasks(id, { forceRefresh: true }),
				projectId,
			);
			assert.ok(before.success && before.data);
			const beforeIds = new Set(before.data.map((task) => task.id));
			for (const [suggestionIndex, suggestion] of suggestions.entries()) {
				const card = main()
					.getByRole("heading", {
						name: suggestion.title,
						level: 4,
						exact: true,
					})
					.locator("..");
				await expect(
					card.getByText(suggestion.description, { exact: true }),
				).toBeVisible();
				const createButton = button(
					await t("common", "insights.createTask"),
					card,
				);
				await expect(createButton).toBeEnabled();
				await click(
					createButton,
					`Create local backlog task from synthetic card: ${suggestion.title}`,
				);
				const createdIndicator = button(
					await t("common", "insights.taskCreated"),
					card,
				);
				await expect(createdIndicator).toBeDisabled({ timeout: 10_000 });
				const all = await page.evaluate(
					(id) => window.electronAPI.getTasks(id, { forceRefresh: true }),
					projectId,
				);
				assert.ok(all.success && all.data);
				const matches = all.data.filter(
					(task) => task.title === suggestion.title && !beforeIds.has(task.id),
				);
				assert.equal(
					matches.length,
					1,
					"One card action must create exactly one new task",
				);
				const task = matches[0];
				assert.equal(task.status, "backlog");
				assert.equal(task.metadata?.sourceType, "insights");
				assert.equal(task.metadata?.category, suggestion.metadata.category);
				assert.equal(task.metadata?.complexity, suggestion.metadata.complexity);
				const running = await page.evaluate(
					(id) => window.electronAPI.checkTaskRunning(id),
					task.id,
				);
				assert.ok(
					running.success && running.data === false,
					"Creating a suggestion must not start an executor",
				);
				const specDir = path.join(
					fixture,
					".forge-glass-preview",
					"specs",
					task.specId || task.id,
				);
				inside(specDir, fixture);
				inside(await realpath(specDir), await realpath(fixture));
				const plan = JSON.parse(
					await readFile(
						path.join(specDir, "implementation_plan.json"),
						"utf8",
					),
				);
				const metadata = JSON.parse(
					await readFile(path.join(specDir, "task_metadata.json"), "utf8"),
				);
				assert.equal(plan.status, "pending");
				assert.deepEqual(plan.phases, []);
				assert.equal(metadata.sourceType, "insights");
				report.insightsSuggestions.createdTasks.push({
					id: task.id,
					title: task.title,
					status: task.status,
					specDir,
					planStatus: plan.status,
					executorRunning: false,
				});
				const source = {
					sessionId,
					messageId: assistantMessageId,
					suggestionIndex,
				};
				const repeated = await page.evaluate(
					({ projectId, suggestion, source }) =>
						window.electronAPI.createTaskFromInsights(
							projectId,
							suggestion.title,
							suggestion.description,
							suggestion.metadata,
							source,
						),
					{ projectId, suggestion, source },
				);
				assert.ok(repeated.success && repeated.data);
				assert.equal(
					repeated.data.id,
					task.id,
					"Repeating the same persisted suggestion identity must return its original task",
				);
				const afterRepeat = await page.evaluate(
					(id) => window.electronAPI.getTasks(id, { forceRefresh: true }),
					projectId,
				);
				assert.ok(afterRepeat.success && afterRepeat.data);
				assert.deepEqual(
					afterRepeat.data.map((task) => task.id).sort(),
					all.data.map((task) => task.id).sort(),
					"The idempotent repeat must not add or remove any task",
				);
				const fresh = await page.evaluate(
					({ projectId, sessionId }) =>
						window.electronAPI.switchInsightsSession(projectId, sessionId),
					{ projectId, sessionId },
				);
				assert.ok(fresh.success && fresh.data);
				assert.equal(
					fresh.data.messages[1].suggestedTasks[suggestionIndex].createdTaskId,
					task.id,
					"Main must persist the suggestion-to-task identity",
				);
				await blocked(
					`Task Created indicator for ${suggestion.title}`,
					"Verified disabled after the real local creation; this success indicator has no executable action",
				);
			}
			await shot("insights-synthetic-suggestions-created");
			await nav("kanban");
			await click(
				button("Refresh Tasks", main()),
				"Refresh Kanban after real suggestion task creation",
			);
			for (const task of report.insightsSuggestions.createdTasks)
				await expect(button(task.title)).toBeVisible({ timeout: 10_000 });
			await shot("insights-suggestion-tasks-in-backlog");
			await nav("insights");
			await expect(
				main().getByText(assistantText, { exact: true }),
			).toBeVisible();
			for (const suggestion of suggestions) {
				const card = main()
					.getByRole("heading", {
						name: suggestion.title,
						level: 4,
						exact: true,
					})
					.locator("..");
				await expect(
					button(await t("common", "insights.taskCreated"), card),
				).toBeDisabled();
				await expect(
					button(await t("common", "insights.createTask"), card),
				).toHaveCount(0);
			}
			const revisited = await page.evaluate(
				(id) => window.electronAPI.getTasks(id, { forceRefresh: true }),
				projectId,
			);
			assert.ok(revisited.success && revisited.data);
			for (const suggestion of suggestions)
				assert.equal(
					revisited.data.filter((task) => task.title === suggestion.title)
						.length,
					1,
					"Revisiting the persisted card must not create duplicate tasks",
				);
			await shot("insights-suggestions-created-badges-persisted");
			await blocked(
				"Regenerate or Retry synthetic offline suggestion content",
				"Generation controls are exercised separately through the guarded real loopback SDK fixture; this offline fixture has no model account",
			);
		},
	);
}
