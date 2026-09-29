/**
 * Ordinary local entries in the isolated conditional UI walk.
 * Native directory selection is an explicitly labelled, one-use transport
 * fixture. All project/task APIs and subsequent UI actions remain actual.
 * This helper never launches Electron or claims native-picker UI coverage.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";

export async function walkConditionalOrdinaryEntries(ctx) {
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
		dialog,
		click,
		action,
		press,
		segment,
		shot,
		blocked,
		nav,
		closeLayers,
		createTaskFixture,
		refreshTasks,
	} = ctx;
	report.fixtureSetup ??= [];
	const fixturePath = path.resolve(fixture);
	const dataPath = path.dirname(path.resolve(profile));
	const canonicalDataPath = await realpath(dataPath);
	const isInside = (filename) => {
		const relative = path.relative(dataPath, path.resolve(filename));
		return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
	};
	assert.ok(
		isInside(fixturePath),
		"Only the runner disposable project is allowed",
	);
	assert.equal(
		path.resolve(report.data),
		dataPath,
		"Require the exact runner temporary root",
	);
	const directories = await app.evaluate(({ app: application }) => ({
		userData: application.getPath("userData"),
		home: application.getPath("home"),
	}));
	assert.equal(path.resolve(directories.userData), path.resolve(profile));
	assert.ok(isInside(directories.home), "Require the isolated HOME");
	assert.match(
		await readFile(path.join(fixturePath, "README.md"), "utf8"),
		/CONDITIONAL UI FIXTURE/,
	);
	const getProjects = async () => {
		const result = await page.evaluate(() => window.electronAPI.getProjects());
		assert.ok(result.success && Array.isArray(result.data));
		return result.data;
	};
	const primary = (await getProjects()).find(
		(project) => project.id === projectId,
	);
	assert.ok(
		primary &&
			path.resolve(primary.path) === fixturePath &&
			primary.autoBuildPath === ".forge-glass-preview",
	);
	const noAccounts = async () => {
		const result = await page.evaluate(() =>
			window.electronAPI.getProviderAccounts(),
		);
		assert.ok(
			result.success && result.data?.accounts?.length === 0,
			"Ordinary entries require no model accounts",
		);
	};
	await noAccounts();
	const cardFor = (task) =>
		main()
			.locator(".task-card-enhanced")
			.filter({
				has: page.getByRole("button", { name: task.title, exact: true }),
			});

	await segment("conditional-ordinary-global-and-board-entries", async () => {
		await nav("kanban");
		const sidebar = page.locator(".forge-glass-sidebar");
		if ((await sidebar.getAttribute("data-collapsed")) === "true") {
			await click(
				button(await t("navigation", "actions.expandSidebar"), sidebar),
				"Restore expanded sidebar before ordinary entries",
			);
		}
		await click(
			button(await t("navigation", "actions.collapseSidebar"), sidebar),
			"Collapse global sidebar from ordinary header button",
		);
		await expect(sidebar).toHaveAttribute("data-collapsed", "true");
		await click(
			button(await t("navigation", "actions.expandSidebar"), sidebar),
			"Expand global sidebar from ordinary header button",
		);
		await expect(sidebar).toHaveAttribute("data-collapsed", "false");
		await click(
			button(await t("navigation", "tooltips.help"), sidebar),
			"Open About Forge from ordinary sidebar button",
		);
		await expect(
			dialog().getByText(await t("uiShell", "about.provenance"), {
				exact: true,
			}),
		).toBeVisible();
		await shot("ordinary-about-forge");
		await click(
			button(await t("common", "buttons.close"), dialog()).first(),
			"Close About Forge through its actual footer",
		);
		const authentication = await t("common", "usage.authenticationAriaLabel", {
			provider: await t("common", "usage.noAccount"),
		});
		await click(
			button(authentication, page.locator(".forge-glass-project-tabs")),
			"Open Accounts from independent No Account badge",
		);
		const settings = page.locator(
			'section[aria-labelledby="settings-page-title"]',
		);
		await expect(
			settings.locator('nav button[aria-current="page"]'),
		).toHaveText(await t("settings", "sections.accounts.title"));
		await click(
			button(await t("common", "buttons.back"), settings).first(),
			"Close Accounts opened by ordinary authentication badge",
		);
		await noAccounts();
		const planning = main().locator(
			'.forge-glass-board-column[data-status="backlog"]',
		);
		if ((await planning.getAttribute("data-collapsed")) === "true") {
			await click(
				button(await t("tasks", "kanban.expandColumn"), planning),
				"Reveal Planning column ordinary add entry",
			);
		}
		const beforeTasks = await page.evaluate(
			(id) => window.electronAPI.getTasks(id),
			projectId,
		);
		assert.ok(beforeTasks.success);
		await click(
			button(await t("tasks", "kanban.addTaskAriaLabel"), planning),
			"Open task creation from Planning column add button",
		);
		await expect(page.locator("#create-title")).toBeVisible();
		await click(
			button(await t("common", "buttons.cancel"), dialog()),
			"Cancel Planning column task creation without execution",
		);
		const afterTasks = await page.evaluate(
			(id) => window.electronAPI.getTasks(id),
			projectId,
		);
		assert.ok(afterTasks.success);
		assert.deepEqual(
			afterTasks.data.map((task) => task.id).sort(),
			beforeTasks.data.map((task) => task.id).sort(),
		);
		const fixtures = [
			await createTaskFixture("Conditional ordinary backlog menu fixture", {
				status: "backlog",
				xstateState: "backlog",
				executionPhase: "idle",
				subtaskStatus: "pending",
			}),
			await createTaskFixture("Conditional ordinary completed menu fixture", {
				status: "done",
				xstateState: "done",
				executionPhase: "complete",
				subtaskStatus: "completed",
			}),
		];
		await refreshTasks();
		const menus = [];
		for (const task of fixtures) {
			assert.ok(path.resolve(task.specDir).startsWith(fixturePath + path.sep));
			const card = cardFor(task);
			await expect(card).toHaveCount(1);
			await click(
				button(await t("tasks", "actions.taskActions"), card),
				`Open ordinary Task actions menu ${task.title}`,
			);
			const menu = page.getByRole("menu");
			await expect(menu).toBeVisible();
			const items = (await menu.getByRole("menuitem").allInnerTexts()).map(
				(name) => name.trim(),
			);
			assert.equal(
				items.length,
				5,
				"Task actions currently contains only five Move to choices",
			);
			assert.ok(
				!items.includes(await t("tasks", "edit.title")),
				"Do not claim an Edit item exists in the Move to menu",
			);
			menus.push({
				taskId: task.id,
				observedMenuItems: items,
				menuEntryOnly: true,
			});
			for (const target of ["queue", "in_progress", "ai_review"]) {
				const label = await t("tasks", `columns.${target}`);
				if (items.includes(label))
					await blocked(
						`Task actions Move to ${label}`,
						"This status can schedule or launch execution; only the actual menu entry is covered by the no-model ordinary fixture",
					);
			}
			await press("Escape", `Dismiss ordinary Task actions menu ${task.title}`);
			await expect(menu).toHaveCount(0);
		}
		const editable = fixtures[0];
		const planBefore = await readFile(editable.planPath, "utf8");
		await click(
			button(editable.title, cardFor(editable)),
			"Open ordinary backlog task detail for actual Edit entry",
		);
		await click(
			button(await t("tasks", "kanban.editTask"), dialog()),
			"Open actual task Edit dialog",
		);
		await expect(
			dialog().getByRole("heading", {
				name: await t("tasks", "edit.title"),
				exact: true,
			}),
		).toBeVisible();
		await click(
			button(await t("common", "buttons.cancel"), dialog()),
			"Cancel actual Edit dialog without saving",
		);
		await click(
			button(await t("common", "buttons.close"), dialog()).last(),
			"Close ordinary task detail after Edit cancel",
		);
		assert.equal(
			await readFile(editable.planPath, "utf8"),
			planBefore,
			"Edit cancel must preserve the fixture plan",
		);
		const done = fixtures[1];
		const completedPlan = await readFile(done.planPath, "utf8");
		await click(
			button(await t("tasks", "tooltips.archiveTask"), cardFor(done)),
			"Archive own completed fixture from actual separate card action",
		);
		await expect
			.poll(
				async () =>
					JSON.parse(
						await readFile(
							path.join(done.specDir, "task_metadata.json"),
							"utf8",
						),
					).archivedAt,
			)
			.toBeTruthy();
		assert.equal(
			await readFile(done.planPath, "utf8"),
			completedPlan,
			"Archive must preserve the explicit completed fixture plan",
		);
		await noAccounts();
		report.ordinaryGlobalEntries = {
			menus,
			editedTaskId: editable.id,
			archivedTaskId: done.id,
			modelCalls: 0,
			menuEditItemExists: false,
			archiveIsSeparateCardAction: true,
			taskCreateCancelled: true,
		};
		await shot("ordinary-global-and-board-entries");
	});

	async function openOwnProjectDirectory(projectPath, label) {
		assert.ok(isInside(projectPath));
		assert.equal(
			await realpath(projectPath),
			path.resolve(
				canonicalDataPath,
				path.relative(dataPath, path.resolve(projectPath)),
			),
			"Reject symlinked chooser fixture directories",
		);
		const guardId = randomUUID();
		await app.evaluate(
			({ dialog: nativeDialog }, payload) => {
				if (globalThis.__ordinaryDirectoryPickerQA)
					throw new Error("Directory picker fixture already owned");
				const original = nativeDialog.showOpenDialog;
				const state = {
					id: payload.id,
					original,
					calls: 0,
					unexpected: 0,
					wrapper: undefined,
				};
				state.wrapper = async (...args) => {
					const options = args.at(-1);
					if (
						state.calls !== 0 ||
						!options?.properties?.includes("openDirectory")
					) {
						state.unexpected++;
						throw new Error(
							"Unexpected directory picker invocation refused before native picker",
						);
					}
					state.calls++;
					return { canceled: false, filePaths: [payload.path], bookmarks: [] };
				};
				globalThis.__ordinaryDirectoryPickerQA = state;
				nativeDialog.showOpenDialog = state.wrapper;
			},
			{ id: guardId, path: projectPath },
		);
		let restored;
		try {
			await click(
				button(
					await t("common", "projectTab.addProjectAriaLabel"),
					page.locator(".forge-glass-project-tabs"),
				),
				`${label} Add project entry`,
			);
			await click(
				button(
					await t("dialogs", "addProject.openExistingAriaLabel"),
					dialog(),
				),
				`${label} Open existing project folder entry`,
			);
			await expect(dialog()).toHaveCount(0);
			await expect(
				page.getByRole("tab", {
					name: path.basename(projectPath),
					exact: true,
				}),
			).toBeVisible();
			await click(
				page.getByRole("tab", {
					name: path.basename(projectPath),
					exact: true,
				}),
				`${label} actual project tab selection`,
			);
		} finally {
			restored = await app.evaluate(({ dialog: nativeDialog }, id) => {
				const state = globalThis.__ordinaryDirectoryPickerQA;
				if (!state || state.id !== id)
					throw new Error("Directory picker fixture ownership lost");
				const stillOwned = nativeDialog.showOpenDialog === state.wrapper;
				nativeDialog.showOpenDialog = state.original;
				const identityRestored = nativeDialog.showOpenDialog === state.original;
				const result = {
					calls: state.calls,
					unexpected: state.unexpected,
					stillOwned,
					identityRestored,
				};
				delete globalThis.__ordinaryDirectoryPickerQA;
				return result;
			}, guardId);
			report.fixtureSetup.push({
				kind: "one-use-native-directory-chooser-transport",
				path: projectPath,
				nativePickerUIProof: false,
				productData: false,
				...restored,
			});
			assert.ok(
				restored.stillOwned && restored.identityRestored,
				"Native chooser identity must be restored",
			);
			assert.equal(restored.calls, 1);
			assert.equal(restored.unexpected, 0);
		}
	}

	await segment("conditional-ordinary-project-tab-close-reopen", async () => {
		await nav("kanban");
		const primaryReadme = await readFile(
			path.join(fixturePath, "README.md"),
			"utf8",
		);
		const secondary = await mkdtemp(
			path.join(dataPath, "ordinary-project-tab-"),
		);
		assert.ok(isInside(secondary) && path.resolve(secondary) !== fixturePath);
		assert.equal(
			await realpath(secondary),
			path.join(canonicalDataPath, path.basename(secondary)),
		);
		const readmePath = path.join(secondary, "README.md");
		await writeFile(
			readmePath,
			"# ORDINARY PROJECT TAB UI FIXTURE\nDisposable local project removal/reopen inputs. No task or model ran.\n",
		);
		const git = (args) =>
			execFileSync(
				"git",
				[
					"-c",
					"core.hooksPath=/dev/null",
					"-c",
					"commit.gpgSign=false",
					"-c",
					"user.name=Forge Ordinary UI QA",
					"-c",
					"user.email=ui-qa@example.invalid",
					...args,
				],
				{
					cwd: secondary,
					stdio: "pipe",
					env: {
						...process.env,
						HOME: directories.home,
						GIT_CONFIG_NOSYSTEM: "1",
						GIT_CONFIG_GLOBAL: "/dev/null",
						GIT_TERMINAL_PROMPT: "0",
					},
				},
			);
		git(["init", "-b", "main"]);
		git(["add", "README.md"]);
		git(["commit", "-m", "Initialize disposable ordinary UI fixture"]);
		assert.equal(git(["remote"]).toString().trim(), "");
		const setup = await page.evaluate(async (ownPath) => {
			const added = await window.electronAPI.addProject(ownPath);
			if (!added.success || !added.data)
				throw new Error(added.error || "Own project add failed");
			const initialized = await window.electronAPI.initializeProject(
				added.data.id,
			);
			if (!initialized.success)
				throw new Error(
					initialized.error || "Own project initialization failed",
				);
			const task = await window.electronAPI.createTask(
				added.data.id,
				"Conditional ordinary reopen preservation task",
				"Explicit disposable UI fixture; no model or executor ran.",
				{ sourceType: "manual", pushNewBranches: false },
			);
			if (!task.success || !task.data)
				throw new Error(task.error || "Own preservation task failed");
			return { project: added.data, task: task.data };
		}, secondary);
		assert.equal(path.resolve(setup.project.path), secondary);
		const specDir = path.resolve(setup.task.specsPath);
		assert.ok(specDir.startsWith(secondary + path.sep));
		const preserved = [
			readmePath,
			path.join(specDir, "implementation_plan.json"),
			path.join(specDir, "task_metadata.json"),
			path.join(specDir, "requirements.json"),
		];
		const beforeFiles = await Promise.all(
			preserved.map((filename) => readFile(filename, "utf8")),
		);
		const plan = JSON.parse(beforeFiles[1]);
		assert.ok(["pending", "backlog"].includes(plan.status));
		assert.equal(plan.phases.length, 0);
		report.fixtureSetup.push({
			kind: "actual-main-initialized-secondary-project",
			path: secondary,
			projectId: setup.project.id,
			taskId: setup.task.id,
			productData: false,
			modelCalls: 0,
			hasRemote: false,
		});
		try {
			await openOwnProjectDirectory(
				secondary,
				"Open secondary disposable project",
			);
			const primaryTab = page.getByRole("tab", {
				name: primary.name,
				exact: true,
			});
			const secondaryTab = page.getByRole("tab", {
				name: path.basename(secondary),
				exact: true,
			});
			await expect(secondaryTab).toHaveAttribute("aria-selected", "true");
			await expect(primaryTab).toBeVisible();
			assert.equal(
				typeof action,
				"function",
				"Project reorder requires the normal action trace helper",
			);
			{
				const tabs = page.locator(".forge-glass-project-tab-list");
				const order = () => tabs.getByRole("tab").allInnerTexts();
				const beforeOrder = await order();
				const secondaryName = path.basename(secondary);
				const sourceIndex = beforeOrder.indexOf(secondaryName);
				const targetIndex = beforeOrder.indexOf(primary.name);
				assert.ok(
					sourceIndex >= 0 &&
						targetIndex >= 0 &&
						Math.abs(sourceIndex - targetIndex) === 1,
					"Keyboard reorder needs adjacent independently disposable project tabs",
				);
				const handle = button(
					await t("common", "projectTab.reorderProjectAriaLabel", {
						name: secondaryName,
					}),
					tabs,
				);
				await action(
					handle,
					"Focus actual secondary project keyboard reorder handle",
					async () => {
						await handle.focus();
					},
					"other",
				);
				await expect(handle).toBeFocused();
				await press(
					"Space",
					"Lift secondary disposable project from actual keyboard handle",
				);
				await expect(handle).toHaveAttribute("aria-pressed", "true");
				const direction =
					sourceIndex > targetIndex ? "ArrowLeft" : "ArrowRight";
				await press(
					direction,
					`Keyboard reorder secondary disposable project ${direction}`,
				);
				await press(
					"Space",
					"Drop keyboard reordered secondary disposable project",
				);
				// dnd-kit removes aria-pressed for an idle draggable rather than
				// rendering the literal string "false". Require the actual lifted
				// state to clear while retaining the focus and persisted-order checks.
				await expect(handle).not.toHaveAttribute("aria-pressed", "true");
				await expect(handle).toBeFocused();
				await expect.poll(order).not.toEqual(beforeOrder);
				const afterOrder = await order();
				const idsForOrder = (names) =>
					names
						.filter((name) => [primary.name, secondaryName].includes(name))
						.map((name) =>
							name === primary.name ? projectId : setup.project.id,
						);
				const persistedOrder = async () => {
					const result = await page.evaluate(() =>
						window.electronAPI.getTabState(),
					);
					assert.ok(result.success && result.data);
					return result.data.tabOrder.filter((id) =>
						[projectId, setup.project.id].includes(id),
					);
				};
				await expect.poll(persistedOrder).toEqual(idsForOrder(afterOrder));
				const reorder = async (sourceName, targetName, label) => {
					const source = button(
						await t("common", "projectTab.reorderProjectAriaLabel", {
							name: sourceName,
						}),
						tabs,
					);
					const target = button(
						await t("common", "projectTab.reorderProjectAriaLabel", {
							name: targetName,
						}),
						tabs,
					);
					await source.scrollIntoViewIfNeeded();
					const from = await source.boundingBox(),
						to = await target.boundingBox();
					assert.ok(from && to, "Real reorder handle bounds must exist");
					await action(
						source,
						label,
						async () => {
							await page.mouse.move(
								from.x + from.width / 2,
								from.y + from.height / 2,
							);
							await page.mouse.down();
							try {
								await page.mouse.move(
									to.x + to.width / 2,
									to.y + to.height / 2,
									{ steps: 18 },
								);
							} finally {
								await page.mouse.up();
							}
						},
						"other",
					);
				};
				await reorder(
					path.basename(secondary),
					primary.name,
					"Restore original project order through actual pointer handle",
				);
				await expect.poll(order).toEqual(beforeOrder);
				await expect.poll(persistedOrder).toEqual(idsForOrder(beforeOrder));
				await action(
					handle,
					"Focus actual secondary project handle after original order restoration",
					async () => {
						await handle.focus();
					},
					"other",
				);
				await expect(handle).toBeFocused();
				report.ordinaryProjectReorder = {
					projectIds: [projectId, setup.project.id],
					beforeOrder,
					afterOrder,
					originalOrderRestored: true,
					pointerSensor: true,
					keyboardSensor: true,
					keyboardDirection: direction,
					keyboardDropFocusPreserved: true,
					changedOrderPersisted: true,
				};
			}
			const tabScope = page
				.locator(".forge-glass-project-tab")
				.filter({ has: secondaryTab });
			const close = button(
				await t("common", "projectTab.closeTabAriaLabel"),
				tabScope,
			);
			await click(
				close,
				"Close secondary project tab to open actual removal confirmation",
			);
			await expect(
				dialog().getByRole("heading", {
					name: await t("dialogs", "removeProject.title"),
					exact: true,
				}),
			).toBeVisible();
			await click(
				button(await t("dialogs", "removeProject.cancel"), dialog()),
				"Cancel removal of disposable secondary project",
			);
			assert.ok(
				(await getProjects()).some(
					(project) => project.id === setup.project.id,
				),
			);
			await click(
				close,
				"Reopen actual secondary project removal confirmation",
			);
			await click(
				button(await t("dialogs", "removeProject.remove"), dialog()),
				"Confirm registry-only removal of disposable secondary project",
			);
			await expect
				.poll(async () =>
					(await getProjects()).some(
						(project) => project.id === setup.project.id,
					),
				)
				.toBe(false);
			await expect(secondaryTab).toHaveCount(0);
			assert.ok((await stat(secondary)).isDirectory());
			for (const [index, filename] of preserved.entries())
				assert.equal(
					await readFile(filename, "utf8"),
					beforeFiles[index],
					"Project removal must preserve every own file",
				);
			assert.equal(
				await readFile(path.join(fixturePath, "README.md"), "utf8"),
				primaryReadme,
			);
			assert.ok(
				(await getProjects()).some(
					(project) =>
						project.id === projectId &&
						path.resolve(project.path) === fixturePath,
				),
				"Primary project must remain registered",
			);
			await openOwnProjectDirectory(
				secondary,
				"Reopen removed secondary disposable project",
			);
			const reopened = (await getProjects()).find(
				(project) => path.resolve(project.path) === secondary,
			);
			assert.ok(reopened?.autoBuildPath === ".forge-glass-preview");
			assert.notEqual(
				reopened.id,
				setup.project.id,
				"Registry removal followed by add creates a new project identity",
			);
			const tasks = await page.evaluate(
				(id) => window.electronAPI.getTasks(id),
				reopened.id,
			);
			assert.ok(
				tasks.success &&
					tasks.data.some(
						(task) => task.id === setup.task.id && task.status === "backlog",
					),
			);
			for (const [index, filename] of preserved.entries())
				assert.equal(await readFile(filename, "utf8"), beforeFiles[index]);
			report.ordinaryProjectCloseReopen = {
				path: secondary,
				removedProjectId: setup.project.id,
				reopenedProjectId: reopened.id,
				preservedTaskId: setup.task.id,
				filesPreserved: preserved.length,
				primaryProjectPreserved: true,
				nativePickerUIProof: false,
				registryOnlyRemoval: true,
				modelCalls: 0,
			};
			await shot("ordinary-secondary-project-reopened");
		} finally {
			await closeLayers();
			const primaryTab = page.getByRole("tab", {
				name: primary.name,
				exact: true,
			});
			await expect(primaryTab).toBeVisible();
			await click(
				primaryTab,
				"Return to primary disposable project after secondary tab controls",
			);
			await expect(primaryTab).toHaveAttribute("aria-selected", "true");
			await noAccounts();
		}
	});
}
