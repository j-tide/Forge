/** Final macOS package QA; all writes and native probes use one owned HOME. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFile } from "@electron/asar";
import { _electron as electron, expect } from "@playwright/test";

assert.equal(process.platform, "darwin");
assert.equal(process.arch, "arm64");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(
	await readFile(path.join(root, "apps/desktop/package.json"), "utf8"),
);
const packageRoot = await realpath(
	process.env.FORGE_PACKAGED_APP
		? path.resolve(process.env.FORGE_PACKAGED_APP)
		: path.join(
				root,
				"apps/desktop/dist",
				metadata.version,
				"mac-arm64",
				`${metadata.build.productName}.app`,
			),
);
const resources = path.join(packageRoot, "Contents/Resources");
const archive = path.join(resources, "app.asar");
const output = process.env.FORGE_QA_OUTPUT_DIR
	? path.resolve(process.env.FORGE_QA_OUTPUT_DIR)
	: path.join(root, "output/playwright/localization");
await mkdir(output, { recursive: true });
const evidence = {
	valid: false,
	scope:
		"Actual packaged app, isolated preferences, native in-memory libsql and one bounded shell PTY; no provider/model/login/clipboard or Forge Host acceptance.",
	recordedAt: new Date().toISOString(),
	version: metadata.version,
	packageRoot,
	appAsarSha256: createHash("sha256")
		.update(await readFile(archive))
		.digest("hex"),
	checkedBuiltFiles: 0,
	checkedNativeIcons: 4,
	checkedNotices: 2,
	checkedPrompts: 0,
	operations: [],
	screenshots: [],
	launches: [],
	cleanupErrors: [],
	modelCalls: 0,
};
async function verifyBuiltDirectory(directory) {
	for (const file of await readdir(path.join(root, "apps/desktop", directory), {
		withFileTypes: true,
	})) {
		const entry = `${directory}/${file.name}`;
		if (file.isDirectory()) await verifyBuiltDirectory(entry);
		else if (
			file.isFile() &&
			/\.(js|mjs|css|png|svg|woff2?)$/.test(file.name)
		) {
			assert.deepEqual(
				extractFile(archive, entry),
				await readFile(path.join(root, "apps/desktop", entry)),
				`Packaged source differs: ${entry}`,
			);
			evidence.checkedBuiltFiles++;
		}
	}
}
for (const directory of ["out/main", "out/preload", "out/renderer/assets"])
	await verifyBuiltDirectory(directory);
assert.deepEqual(
	extractFile(archive, "out/renderer/index.html"),
	await readFile(path.join(root, "apps/desktop/out/renderer/index.html")),
);
evidence.checkedBuiltFiles++;
for (const file of ["icon.png", "icon-256.png", "icon.ico", "icon.icns"]) {
	assert.deepEqual(
		await readFile(path.join(resources, file)),
		await readFile(path.join(root, "apps/desktop/resources", file)),
		`Packaged icon differs: ${file}`,
	);
}
for (const file of ["LICENSE", "UPSTREAM.md"]) {
	assert.deepEqual(
		await readFile(path.join(resources, file)),
		await readFile(path.join(root, file)),
		`Packaged notice differs: ${file}`,
	);
}
async function promptFiles(directory, prefix = "") {
	const entries = [];
	for (const file of await readdir(directory, { withFileTypes: true })) {
		const relative = path.join(prefix, file.name);
		assert.ok(
			file.isDirectory() || file.isFile(),
			`Unexpected prompt symlink or special file: ${relative}`,
		);
		if (file.isDirectory())
			entries.push(
				...(await promptFiles(path.join(directory, file.name), relative)),
			);
		else entries.push(relative);
	}
	return entries.sort();
}
const sourcePrompts = path.join(root, "apps/desktop/prompts");
const packagedPrompts = path.join(resources, "prompts");
const prompts = await promptFiles(sourcePrompts);
assert.deepEqual(
	await promptFiles(packagedPrompts),
	prompts,
	"Packaged prompt inventory differs",
);
for (const file of prompts)
	assert.deepEqual(
		await readFile(path.join(packagedPrompts, file)),
		await readFile(path.join(sourcePrompts, file)),
		`Packaged prompt differs: ${file}`,
	);
evidence.checkedPrompts = prompts.length;
assert.ok(prompts.length > 0);

const hostProfile = path.join(
	userInfo().homedir,
	"Library/Application Support/Forge Glass Preview",
);
const originalFiles = [
	"settings.json",
	"store/projects.json",
	"projects.json",
	"forge/profiles.json",
	"aperant/profiles.json",
	"auto-claude/profiles.json",
];
async function userSnapshot() {
	const result = {};
	for (const file of originalFiles) {
		try {
			result[file] = createHash("sha256")
				.update(await readFile(path.join(hostProfile, file)))
				.digest("hex");
		} catch (error) {
			assert.equal(error.code, "ENOENT");
			result[file] = null;
		}
	}
	return result;
}
const before = await userSnapshot();
const owned = await mkdtemp(path.join(tmpdir(), "forge-packaged-preferences-"));
const taskHome = path.join(owned, "home");
const isolatedTmp = path.join(owned, "tmp");
const profile = path.join(
	taskHome,
	"Library/Application Support/Forge Glass Preview",
);
await Promise.all(
	[profile, isolatedTmp].map((directory) =>
		mkdir(directory, { recursive: true }),
	),
);
assert.ok(
	!output.startsWith(`${owned}${path.sep}`),
	"Evidence must survive owned temporary cleanup",
);
const settingsFile = path.join(profile, "settings.json");
await writeFile(
	settingsFile,
	JSON.stringify({
		onboardingCompleted: true,
		language: "zh-CN",
		theme: "light",
		colorTheme: "forge-glass",
		reduceMotion: true,
		sentryEnabled: false,
		autoUpdateEnabled: false,
		autoNameTerminals: false,
	}),
);
// Use an allowlist, not inherited credentials, proxies, loaders, shell config or SDK flags.
const env = {
	HOME: taskHome,
	CFFIXED_USER_HOME: taskHome,
	TMPDIR: `${isolatedTmp}${path.sep}`,
	PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
	LANG: "en_US.UTF-8",
	LC_ALL: "en_US.UTF-8",
	XDG_CONFIG_HOME: path.join(taskHome, ".config"),
	NODE_ENV: "production",
	FORGE_GLASS_PREVIEW_PTY_USER_DATA_DIR: profile,
};
evidence.environment = {
	isolatedHome: taskHome,
	isolatedProfile: profile,
	allowlistedKeys: Object.keys(env),
	inheritedCredentials: false,
	packageWorkingDirectory: taskHome,
};
const owner = randomUUID();
const nativeKey = "__forgePackagedNativeSmoke";
const marker = `FORGE_PACKAGED_PTY_${owner.replaceAll("-", "")}`;
let app, page, currentRuntime, ownedPtyPid, failure;
const locales = {};
async function text(language, namespace, key) {
	const id = `${language}/${namespace}`;
	locales[id] ??= JSON.parse(
		await readFile(
			path.join(
				root,
				"apps/desktop/src/shared/i18n/locales",
				language,
				`${namespace}.json`,
			),
			"utf8",
		),
	);
	const value = key
		.split(".")
		.reduce((entry, part) => entry?.[part], locales[id]);
	assert.equal(typeof value, "string");
	return value;
}
const alive = (pid) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		assert.equal(error.code, "ESRCH");
		return false;
	}
};
async function screenshot(name) {
	await page.screenshot({
		path: path.join(output, name),
		animations: "disabled",
	});
	evidence.screenshots.push(name);
}
async function click(locator, label) {
	await expect(locator).toBeVisible();
	await expect(locator).toBeEnabled();
	await locator.click();
	evidence.operations.push({
		label,
		interaction: "click",
		actualPackagedUI: true,
	});
}
async function launch(label) {
	app = await electron.launch({
		executablePath: path.join(
			packageRoot,
			"Contents/MacOS",
			metadata.build.productName,
		),
		cwd: taskHome,
		env,
	});
	currentRuntime = { label, applicationClosed: false };
	evidence.launches.push(currentRuntime);
	const identity = await app.evaluate(
		({ app: application, nativeImage, BrowserWindow }) => {
			const icon = nativeImage.createFromPath(
				`${process.resourcesPath}/icon-256.png`,
			);
			application.focus({ steal: true });
			const window = BrowserWindow.getAllWindows().find(
				(candidate) =>
					!candidate.webContents.getURL().startsWith("devtools://"),
			);
			window?.show();
			window?.focus();
			return {
				processId: process.pid,
				name: application.getName(),
				version: application.getVersion(),
				packaged: application.isPackaged,
				resources: process.resourcesPath,
				iconSize: icon.getSize(),
				iconEmpty: icon.isEmpty(),
				home: application.getPath("home"),
				appData: application.getPath("appData"),
				userData: application.getPath("userData"),
			};
		},
	);
	Object.assign(currentRuntime, identity);
	assert.equal(identity.name, "Forge");
	assert.equal(identity.version, metadata.version);
	assert.equal(identity.packaged, true);
	assert.equal(await realpath(identity.home), await realpath(taskHome));
	assert.equal(await realpath(identity.userData), await realpath(profile));
	assert.ok(
		(await realpath(identity.appData)).startsWith(
			`${await realpath(taskHome)}${path.sep}`,
		),
	);
	assert.equal(await realpath(identity.resources), resources);
	assert.equal(identity.iconEmpty, false);
	assert.deepEqual(identity.iconSize, { width: 256, height: 256 });
	await app.firstWindow();
	page = app
		.windows()
		.find((window) => window.url().includes("/out/renderer/index.html"));
	assert.ok(page, "Actual packaged renderer window missing");
	page.setDefaultTimeout(15000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.locator('.forge-glass-welcome[data-empty="true"]').waitFor();
	assert.ok((await page.locator(".forge-brand-mark").count()) > 0);
	evidence.operations.push({
		label,
		interaction: "launch",
		actualPackagedUI: true,
	});
}
async function closeApp() {
	if (!app) return;
	const closing = app;
	try {
		const native = await closing.evaluate(
			async (_, config) => {
				const state = globalThis[config.key];
				if (!state) return { noNativePtyInThisLaunch: true };
				if (state.owner !== config.owner)
					throw new Error("Native probe ownership changed");
				if (!state.exited) {
					state.pty.kill("SIGKILL");
					for (let retry = 0; retry < 100 && !state.exited; retry++)
						await new Promise((resolve) => setTimeout(resolve, 20));
				}
				state.dataSubscription?.dispose();
				state.exitSubscription?.dispose();
				if (state.timer) clearTimeout(state.timer);
				return {
					pid: state.pid,
					exited: state.exited,
					exitCode: state.exitCode,
				};
			},
			{ key: nativeKey, owner },
		);
		if (native.pid) {
			assert.equal(
				native.exited,
				true,
				"Owned native PTY exit acknowledgement missing",
			);
			await expect.poll(() => alive(native.pid), { timeout: 5000 }).toBe(false);
			evidence.nativePtyCleanup = { ...native, processGone: true };
		}
	} catch (error) {
		evidence.cleanupErrors.push(`Native cleanup: ${String(error)}`);
	}
	try {
		await closing.close();
		if (currentRuntime?.processId)
			await expect
				.poll(() => alive(currentRuntime.processId), { timeout: 5000 })
				.toBe(false);
		currentRuntime.applicationClosed = true;
		evidence.operations.push({
			label: `Exit ${currentRuntime.label}`,
			interaction: "exit",
			actualPackagedUI: true,
			processGone: true,
		});
	} finally {
		app = undefined;
		page = undefined;
	}
}
async function nativeProbes() {
	evidence.nativeLibsql = await app.evaluate(async () => {
		const req = globalThis.require;
		if (typeof req !== "function")
			throw new Error("Packaged Main CJS loader missing");
		const modulePath = req.resolve("@libsql/client/sqlite3");
		if (!modulePath.startsWith(`${process.resourcesPath}/`))
			throw new Error("libsql resolved outside the packaged resources");
		const client = req("@libsql/client/sqlite3").createClient({
			url: ":memory:",
		});
		let result;
		try {
			result = await client.execute("SELECT 1 AS packaged_native_probe");
		} finally {
			client.close();
		}
		return {
			modulePath,
			url: ":memory:",
			selectResult: Number(result.rows[0].packaged_native_probe),
			closed: client.closed,
			realNativeModule: true,
		};
	});
	assert.equal(evidence.nativeLibsql.selectResult, 1);
	assert.equal(evidence.nativeLibsql.closed, true);
	const started = await app.evaluate(
		(_, config) => {
			const req = globalThis.require;
			if (globalThis[config.key])
				throw new Error("Native PTY probe already exists");
			const modulePath = req.resolve("@lydell/node-pty");
			if (!modulePath.startsWith(`${process.resourcesPath}/`))
				throw new Error("PTY resolved outside the packaged resources");
			const pty = req("@lydell/node-pty").spawn(
				"/bin/sh",
				["-c", `printf '${config.marker}\\n'; exit 0`],
				{
					name: "xterm-256color",
					cols: 80,
					rows: 24,
					cwd: config.home,
					env: { HOME: config.home, PATH: "/usr/bin:/bin", LANG: "C" },
				},
			);
			const state = {
				owner: config.owner,
				pty,
				pid: pty.pid,
				output: "",
				exited: false,
				timedOut: false,
				modulePath,
			};
			state.done = new Promise((resolve) => {
				state.dataSubscription = pty.onData((data) => {
					state.output = `${state.output}${data}`.slice(-4096);
				});
				state.exitSubscription = pty.onExit((event) => {
					state.exited = true;
					state.exitCode = event.exitCode;
					state.signal = event.signal;
					clearTimeout(state.timer);
					resolve();
				});
				state.timer = setTimeout(() => {
					state.timedOut = true;
					try {
						pty.kill("SIGKILL");
					} finally {
						resolve();
					}
				}, 8000);
			});
			globalThis[config.key] = state;
			return {
				pid: state.pid,
				modulePath,
				command: "/bin/sh",
				inIsolatedHome: true,
			};
		},
		{ key: nativeKey, owner, marker, home: taskHome },
	);
	ownedPtyPid = started.pid;
	const finished = await app.evaluate(
		async (_, config) => {
			const state = globalThis[config.key];
			if (state?.owner !== config.owner)
				throw new Error("Native PTY probe ownership changed");
			await state.done;
			return {
				exited: state.exited,
				exitCode: state.exitCode,
				signal: state.signal,
				timedOut: state.timedOut,
				markerObserved: state.output.includes(config.marker),
			};
		},
		{ key: nativeKey, owner, marker },
	);
	assert.equal(finished.timedOut, false);
	assert.equal(finished.exited, true);
	assert.equal(finished.exitCode, 0);
	assert.equal(finished.markerObserved, true);
	await expect.poll(() => alive(ownedPtyPid), { timeout: 5000 }).toBe(false);
	evidence.nativePty = {
		...started,
		...finished,
		processGone: true,
		realNativeModule: true,
	};
}
async function verifyPreferences(language, theme, label) {
	await expect(page.locator("html")).toHaveAttribute("lang", language);
	await expect
		.poll(() =>
			page.locator("html").evaluate((node) => node.classList.contains("dark")),
		)
		.toBe(theme === "dark");
	const saved = JSON.parse(await readFile(settingsFile, "utf8"));
	assert.equal(saved.language, language);
	assert.equal(saved.theme, theme);
	evidence.operations.push({
		label,
		interaction: "verify",
		language,
		theme,
		diskVerified: true,
		actualPackagedUI: true,
	});
}
async function changePreferences(from, to, theme) {
	await click(
		page.locator(".forge-glass-sidebar").getByRole("button", {
			name: await text(from, "navigation", "actions.settings"),
			exact: true,
		}),
		`Open ${from} application settings`,
	);
	const settings = page.locator(".forge-settings-page");
	await click(
		settings.getByRole("button", {
			name: await text(from, "settings", "sections.language.title"),
			exact: true,
		}),
		`Open ${from} language page`,
	);
	const languageButton = settings.getByRole("button", {
		name: to === "en" ? "English English" : "中文 简体中文",
		exact: true,
	});
	await click(languageButton, `Switch actual package language to ${to}`);
	await expect(languageButton).toHaveAttribute("aria-pressed", "true");
	await expect(page.locator("html")).toHaveAttribute("lang", to);
	await expect
		.poll(async () => JSON.parse(await readFile(settingsFile, "utf8")).language)
		.toBe(to);
	await screenshot(`packaged-language-${to}.png`);
	await click(
		settings.getByRole("button", {
			name: await text(to, "settings", "sections.appearance.title"),
			exact: true,
		}),
		`Open ${to} appearance page`,
	);
	const themeButton = settings.getByRole("button", {
		name: await text(to, "uiSettings", `mode.${theme}`),
		exact: true,
	});
	await click(themeButton, `Preview actual package ${theme} theme`);
	await expect(themeButton).toHaveAttribute("aria-pressed", "true");
	await click(
		settings.getByRole("button", {
			name: await text(to, "settings", "actions.save"),
			exact: true,
		}),
		`Save ${to}/${theme} preferences through normal UI`,
	);
	await expect(settings).toHaveCount(0);
	await expect(
		page.locator('.forge-glass-welcome[data-empty="true"]'),
	).toBeVisible();
	await verifyPreferences(to, theme, `Actual Main/disk save ${to}/${theme}`);
}
try {
	await launch("Chinese/light initial package");
	await verifyPreferences(
		"zh-CN",
		"light",
		"Seeded isolated Chinese/light preferences rendered",
	);
	await screenshot("package-startup-1440.png");
	await nativeProbes();
	await changePreferences("zh-CN", "en", "dark");
	await closeApp();
	await launch("English/dark package restart");
	await verifyPreferences(
		"en",
		"dark",
		"English/dark persisted across actual process exit/restart",
	);
	await screenshot("packaged-restart-en-dark.png");
	await changePreferences("en", "zh-CN", "light");
	await closeApp();
	await launch("Chinese/light restored package restart");
	await verifyPreferences(
		"zh-CN",
		"light",
		"Chinese/light restoration persisted across actual exit/restart",
	);
	await screenshot("packaged-restart-zh-light.png");
} catch (error) {
	failure = error;
	evidence.failure = String(error);
} finally {
	try {
		await closeApp();
	} catch (error) {
		evidence.cleanupErrors.push(`Electron cleanup: ${String(error)}`);
	}
	if (ownedPtyPid && alive(ownedPtyPid)) {
		// Only terminate the owned exact marker command; never a recycled PID.
		try {
			const command = execFileSync(
				"/bin/ps",
				["-p", String(ownedPtyPid), "-o", "command="],
				{ encoding: "utf8" },
			);
			assert.ok(
				command.includes("/bin/sh") && command.includes(marker),
				"Cannot identify an owned PTY; refuse unrelated PID termination",
			);
			process.kill(ownedPtyPid, "SIGKILL");
			await expect
				.poll(() => alive(ownedPtyPid), { timeout: 5000 })
				.toBe(false);
			evidence.nativePtyEmergencyCleanup = {
				pid: ownedPtyPid,
				exactMarkerMatched: true,
				processGone: true,
			};
		} catch (error) {
			evidence.cleanupErrors.push(`Owned PTY cleanup: ${String(error)}`);
		}
	}
	try {
		const after = await userSnapshot();
		evidence.userDataPreservation = {
			before,
			after,
			changed: originalFiles.filter((file) => before[file] !== after[file]),
			contentsLogged: false,
		};
		assert.deepEqual(
			after,
			before,
			"Original user preferences or profiles changed",
		);
	} catch (error) {
		evidence.cleanupErrors.push(`User data preservation: ${String(error)}`);
	}
	if (
		evidence.launches.every((runtime) => runtime.applicationClosed) &&
		(!ownedPtyPid || !alive(ownedPtyPid))
	) {
		try {
			await rm(owned, { recursive: true });
			evidence.ownedTemporaryHomeRemoved = true;
		} catch (error) {
			evidence.cleanupErrors.push(`Owned HOME cleanup: ${String(error)}`);
		}
	}
	evidence.applicationClosed = evidence.launches.every(
		(runtime) => runtime.applicationClosed,
	);
	evidence.valid =
		!failure &&
		evidence.cleanupErrors.length === 0 &&
		evidence.applicationClosed &&
		evidence.ownedTemporaryHomeRemoved === true;
	await writeFile(
		path.join(output, "packaged-evidence.json"),
		`${JSON.stringify(evidence, null, 2)}\n`,
	);
	console.log(
		JSON.stringify({
			valid: evidence.valid,
			checkedBuiltFiles: evidence.checkedBuiltFiles,
			checkedPrompts: evidence.checkedPrompts,
			nativeLibsql: evidence.nativeLibsql,
			nativePty: evidence.nativePty,
			operations: evidence.operations.length,
			applicationClosed: evidence.applicationClosed,
			ownedTemporaryHomeRemoved: evidence.ownedTemporaryHomeRemoved,
			evidence: path.join(output, "packaged-evidence.json"),
		}),
	);
}
if (failure) throw failure;
assert.deepEqual(
	evidence.cleanupErrors,
	[],
	"Packaged smoke cleanup or original user data check failed",
);
assert.equal(evidence.valid, true);
