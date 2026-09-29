/** Real task creation and metadata persistence; execution is refused in Main. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";

export async function walkConditionalTaskWizardPush(ctx) {
	const {
		app,
		page,
		projectId,
		fixture,
		profile,
		report,
		t,
		button,
		dialog,
		click,
		fill,
		action,
		segment,
		shot,
		nav,
	} = ctx;
	let requiresElectronClose = false;
	await segment(
		"conditional-task-wizard-push-preference-persistence",
		async () => {
			const key = "__forgeConditionalTaskWizardPush";
			const startChannel = "task:start";
			const statusChannel = "task:updateStatus";
			const branchChannels = [
				"git:getBranchesWithInfo",
				"git:getBranches",
				"git:detectMainBranch",
			];
			const owner = randomUUID();
			const record = {
				scope:
					"Normal New Task UI to real Main task creation and persisted task metadata. No task execution, push, or Forge Host acceptance.",
				tasks: [],
				guardsRestored: false,
				realExecution: false,
			};
			report.taskWizardPush = record;
			const dirs = await app.evaluate(({ app: application }) => ({
				home: application.getPath("home"),
				userData: application.getPath("userData"),
				envHome: process.env.HOME,
			}));
			assert.equal(path.resolve(dirs.userData), path.resolve(profile));
			assert.equal(dirs.home, dirs.envHome);
			assert.ok(
				path
					.resolve(dirs.home)
					.startsWith(path.dirname(path.resolve(profile)) + path.sep),
			);
			assert.match(
				await readFile(path.join(fixture, "README.md"), "utf8"),
				/CONDITIONAL UI FIXTURE/,
			);
			assert.doesNotMatch(
				await readFile(path.join(fixture, ".git", "config"), "utf8"),
				/\[remote\s/,
			);
			const projectResult = await page.evaluate(() =>
				window.electronAPI.getProjects(),
			);
			assert.ok(projectResult.success && projectResult.data.length === 1);
			const project = projectResult.data[0];
			assert.equal(project.id, projectId);
			assert.equal(project.path, fixture);
			assert.equal(project.autoBuildPath, ".forge-glass-preview");
			const originalPush = project.settings.pushNewBranches;
			const getTasks = async () => {
				const result = await page.evaluate(
					(id) => window.electronAPI.getTasks(id, { forceRefresh: true }),
					projectId,
				);
				assert.ok(result.success && Array.isArray(result.data));
				return result.data;
			};
			assert.equal(
				(await getTasks()).length,
				0,
				"Run this isolated two-task scope before other task fixtures",
			);
			const accounts = await page.evaluate(() =>
				window.electronAPI.getProviderAccounts(),
			);
			assert.ok(accounts.success && accounts.data.accounts.length === 0);
			const support = await app.evaluate(
				({ ipcMain }, config) => ({
					mapPresent: ipcMain._invokeHandlers instanceof Map,
					handlersPresent: [
						config.statusChannel,
						...config.branchChannels,
					].every(
						(channel) =>
							typeof ipcMain._invokeHandlers?.get?.(channel) === "function",
					),
					startListeners: ipcMain.rawListeners(config.startChannel).length,
				}),
				{ startChannel, statusChannel, branchChannels },
			);
			assert.ok(
				support.mapPresent &&
					support.handlersPresent &&
					support.startListeners === 1,
				"Exact original handlers must be captured before opening the task wizard",
			);
			record.privateHandlerMapLimitation =
				"Feature-detected private Map captures originals; public handler/listener APIs replace and restore exact references.";
			let installed = false;
			let preferenceChanged = false;
			let primaryError;
			let cleanupError;
			try {
				installed = true;
				try {
					const installation = await app.evaluate(
						({ ipcMain, BrowserWindow }, config) => {
							if (globalThis[config.key])
								throw new Error(
									"A task wizard execution guard is already installed",
								);
							const windows = BrowserWindow.getAllWindows().filter(
								(window) => window.webContents.getURL() === config.url,
							);
							if (windows.length !== 1)
								throw new Error("Require the exact wizard caller");
							const senderId = windows[0].webContents.id;
							const handlers = ipcMain._invokeHandlers;
							const originals = new Map(
								[config.statusChannel, ...config.branchChannels].map(
									(channel) => [channel, handlers.get(channel)],
								),
							);
							const starts = ipcMain.rawListeners(config.startChannel);
							if (
								![...originals.values()].every(
									(handler) => typeof handler === "function",
								) ||
								starts.length !== 1
							)
								throw new Error(
									"Execution handlers changed before installation",
								);
							const state = {
								owner: config.owner,
								originals,
								starts,
								wrappers: new Map(),
								executionRefusals: [],
								branchCalls: [],
								unexpected: [],
							};
							for (const channel of originals.keys()) {
								const wrapper = (event, ...args) => {
									if (channel === config.statusChannel) {
										state.executionRefusals.push({
											channel,
											status: args[1],
											sameCaller: event?.sender?.id === senderId,
										});
										return {
											success: false,
											error:
												"QA execution boundary: no original task status or execution handler was called.",
										};
									}
									if (
										event?.sender?.id !== senderId ||
										args.length !== 1 ||
										args[0] !== config.fixture ||
										state.branchCalls.filter((call) => call.channel === channel)
											.length >= 2
									) {
										state.unexpected.push({
											channel,
											argumentCount: args.length,
										});
										return {
											success: false,
											error:
												"QA branch lookup refused an unexpected call before Git/CLI access.",
										};
									}
									state.branchCalls.push({
										channel,
										originalHandlerInvoked: false,
									});
									return {
										success: true,
										data:
											channel === "git:detectMainBranch"
												? "main"
												: channel === "git:getBranches"
													? ["main"]
													: [
															{
																name: "main",
																type: "local",
																displayName: "main",
																isCurrent: true,
															},
														],
									};
								};
								state.wrappers.set(channel, wrapper);
							}
							state.startGuard = (event, ...args) => {
								state.executionRefusals.push({
									channel: config.startChannel,
									sameCaller: event?.sender?.id === senderId,
									argumentCount: args.length,
								});
							};
							globalThis[config.key] = state;
							for (const [channel, wrapper] of state.wrappers) {
								ipcMain.removeHandler(channel);
								ipcMain.handle(channel, wrapper);
							}
							ipcMain.removeAllListeners(config.startChannel);
							ipcMain.on(config.startChannel, state.startGuard);
							return {
								invokeIdentity: [...state.wrappers].every(
									([channel, wrapper]) => handlers.get(channel) === wrapper,
								),
								startIdentity:
									ipcMain.rawListeners(config.startChannel)[0] ===
									state.startGuard,
							};
						},
						{
							key,
							owner,
							fixture,
							statusChannel,
							startChannel,
							branchChannels,
							url: page.url(),
						},
					);
					assert.ok(installation.invokeIdentity && installation.startIdentity);
				} catch (error) {
					requiresElectronClose = true;
					throw error;
				}
				preferenceChanged = true;
				const changed = await page.evaluate(
					(id) =>
						window.electronAPI.updateProjectSettings(id, {
							pushNewBranches: false,
						}),
					projectId,
				);
				assert.ok(changed.success);
				report.fixtureSetup.push({
					kind: "task-wizard-project-push-default",
					desired: false,
					realMainPreferenceWrite: true,
					branchLookupSynthetic: true,
					executionGuards: ["task:start send", "task:updateStatus invoke"],
					noRemote: true,
				});
				await action(
					page.locator("body"),
					"Reload disposable project after real project push preference setup",
					() => page.reload(),
					"other",
				);
				await page.locator(".forge-glass-board").waitFor();
				await nav("kanban");
				for (const desired of [true, false]) {
					const title = `Conditional real wizard push ${desired ? "On" : "Off"}`;
					await click(
						button(
							await t("navigation", "actions.newTask"),
							page.locator(".forge-glass-sidebar"),
						),
						`Open normal New Task for push ${desired}`,
					);
					const scope = dialog();
					await scope.waitFor();
					await fill(
						scope.locator("#create-description"),
						"Disposable task creation QA only. Keep this task in backlog; do not execute any agent or push any Git branch.",
						`Enter description for push ${desired}`,
					);
					await fill(
						scope.locator("#create-title"),
						title,
						`Enter title for push ${desired}`,
					);
					const options = scope.locator(
						'button[aria-controls="git-options-section"]',
					);
					if ((await options.getAttribute("aria-expanded")) !== "true")
						await click(
							options,
							`Expand normal Git options for push ${desired}`,
						);
					const off = button("Off", scope.locator("#git-options-section"));
					await expect(off).toBeVisible();
					// Both tasks begin with the actual project Off default; the second task
					// also explicitly round-trips On then Off before creation.
					await click(
						off,
						`Select task-level On with project default Off (${desired})`,
					);
					await expect(
						button("On", scope.locator("#git-options-section")),
					).toBeVisible();
					if (!desired)
						await click(
							button("On", scope.locator("#git-options-section")),
							"Select explicit task-level Off before normal creation",
						);
					await click(
						button(await t("tasks", "wizard.createTask"), scope),
						`Create real backlog task with push ${desired}; never Start`,
					);
					await expect(scope).toHaveCount(0);
					const task = (await getTasks()).find(
						(candidate) => candidate.title === title,
					);
					assert.ok(
						task && task.status === "backlog",
						"Normal Create must persist a backlog task",
					);
					assert.equal(task.metadata?.pushNewBranches, desired);
					assert.ok(
						task.specsPath &&
							path
								.resolve(task.specsPath)
								.startsWith(path.resolve(fixture) + path.sep),
					);
					const metadataPath = path.join(task.specsPath, "task_metadata.json");
					const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
					const plan = JSON.parse(
						await readFile(
							path.join(task.specsPath, "implementation_plan.json"),
							"utf8",
						),
					);
					assert.equal(
						metadata.pushNewBranches,
						desired,
						"The disk metadata must preserve the explicitly selected boolean",
					);
					assert.ok(["pending", "backlog"].includes(plan.status));
					assert.ok(
						!plan.phases?.length,
						"No planning/execution phase may have started",
					);
					record.tasks.push({
						id: task.id,
						title,
						pushNewBranches: desired,
						status: task.status,
						metadataPath,
						actualUICreate: true,
						actualMainAndDiskVerified: true,
						realExecution: false,
					});
					await shot(`task-wizard-persisted-push-${desired}`);
				}
				assert.equal((await getTasks()).length, 2);
			} catch (error) {
				primaryError = error;
			} finally {
				try {
					if (preferenceChanged) {
						const result = await page.evaluate(
							({ id, value }) =>
								window.electronAPI.updateProjectSettings(id, {
									pushNewBranches: value,
								}),
							{ id: projectId, value: originalPush },
						);
						assert.ok(result.success);
						const projects = await page.evaluate(() =>
							window.electronAPI.getProjects(),
						);
						assert.equal(
							projects.data.find((candidate) => candidate.id === projectId)
								?.settings.pushNewBranches,
							originalPush,
						);
						record.projectPreferenceRestored = true;
					}
					const tasks = await getTasks();
					assert.ok(
						tasks.every((task) => task.status === "backlog"),
						"No pending queue or executing task may remain before restoration",
					);
				} catch (error) {
					requiresElectronClose = true;
					cleanupError = error;
				} finally {
					if (installed && !requiresElectronClose) {
						try {
							const restored = await app.evaluate(
								({ ipcMain }, config) => {
									const state = globalThis[config.key];
									if (!state || state.owner !== config.owner)
										throw new Error("Task wizard guard ownership changed");
									const handlers = ipcMain._invokeHandlers;
									for (const [channel, original] of state.originals) {
										const current = handlers.get(channel);
										if (
											current !== original &&
											current !== state.wrappers.get(channel)
										)
											throw new Error("Task wizard invoke identity changed");
										if (current !== original) {
											ipcMain.removeHandler(channel);
											ipcMain.handle(channel, original);
										}
									}
									const starts = ipcMain.rawListeners(config.startChannel);
									const alreadyOriginal =
										starts.length === state.starts.length &&
										starts.every(
											(listener, index) => listener === state.starts[index],
										);
									if (!alreadyOriginal) {
										if (starts.length !== 1 || starts[0] !== state.startGuard)
											throw new Error("Task wizard start identity changed");
										ipcMain.removeAllListeners(config.startChannel);
										for (const listener of state.starts)
											ipcMain.on(config.startChannel, listener);
									}
									const result = {
										invokeRefsRestored: [...state.originals].every(
											([channel, original]) =>
												handlers.get(channel) === original,
										),
										startRefsRestored:
											ipcMain.rawListeners(config.startChannel).length ===
												state.starts.length &&
											ipcMain
												.rawListeners(config.startChannel)
												.every(
													(listener, index) => listener === state.starts[index],
												),
										executionRefusals: state.executionRefusals,
										branchCalls: state.branchCalls,
										unexpected: state.unexpected,
										originalExecutionHandlersInvoked: false,
										originalGitLookupHandlersInvoked: false,
									};
									delete globalThis[config.key];
									return result;
								},
								{ key, owner, startChannel },
							);
							assert.ok(
								restored.invokeRefsRestored && restored.startRefsRestored,
							);
							record.guardsRestored = true;
							record.guardEvidence = restored;
							assert.equal(
								restored.executionRefusals.length,
								0,
								"Create must not even request task execution",
							);
							assert.equal(restored.unexpected.length, 0);
						} catch (error) {
							requiresElectronClose = true;
							cleanupError ??= error;
						}
					} else if (installed) {
						// Keep execution refused if installation or backlog proof is uncertain.
						// The runner must terminate Electron, never release the real handlers.
						record.guardRestorationDeferredUntilElectronClose = true;
					}
				}
			}
			if (primaryError) throw primaryError;
			if (cleanupError) throw cleanupError;
		},
	);
	if (requiresElectronClose)
		throw new Error(
			"Task wizard boundary could not prove safe cleanup; close Electron before continuing.",
		);
}
