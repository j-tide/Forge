import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validateTranslationReferences } from "../../scripts/checks/localization-references.mjs";

function validate(source, namespaces) {
	const root = mkdtempSync(join(tmpdir(), "forge-localization-references-"));
	try {
		const sourceDirectory = join(root, "src");
		const localesDirectory = join(root, "locales");
		mkdirSync(sourceDirectory);
		mkdirSync(join(localesDirectory, "en"), { recursive: true });
		writeFileSync(join(sourceDirectory, "Example.tsx"), source);
		for (const [namespace, resource] of Object.entries(namespaces)) {
			writeFileSync(
				join(localesDirectory, "en", `${namespace}.json`),
				JSON.stringify(resource),
			);
		}
		return validateTranslationReferences({ sourceDirectory, localesDirectory });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test("missing source keys fail even with English defaultValue", () => {
	const report = validate(
		"const {t}=useTranslation('common'); t('missing', 'English fallback');",
		{ common: { save: "Save" } },
	);
	assert.equal(report.errors.length, 1);
	assert.equal(report.errors[0].code, "I18N-REFERENCE-MISSING");
	assert.equal(report.errors[0].relatedId, "missing");
});

test("namespace-qualified references cannot match another namespace", () => {
	const report = validate("t('common:save'); t('missing:save');", {
		common: { save: "Save" },
	});
	assert.equal(report.checkedReferences, 2);
	assert.equal(report.errors.length, 1);
	assert.equal(report.errors[0].relatedId, "missing:save");
});

test("hook aliases and nested lexical scopes resolve their own namespace", () => {
	const report = validate(
		"function A(){const {t:tr}=useTranslation('tasks'); tr('save'); function B(){const {t:tr}=useTranslation('common'); tr('save')}}",
		{ common: { save: "Save" }, tasks: { start: "Start" } },
	);
	assert.equal(report.checkedReferences, 2);
	assert.equal(report.errors.length, 1);
	assert.match(report.errors[0].message, /tasks/);
});

test("plural references resolve suffixes without requiring an unused unsuffixed key", () => {
	const report = validate(
		"const {t}=useTranslation('common'); t('count', {count: 2});",
		{ common: { count_one: "{{count}} item", count_other: "{{count}} items" } },
	);
	assert.deepEqual(report.errors, []);
	assert.equal(report.checkedReferences, 1);
});

test("options namespace and namespace fallback arrays remain explicit", () => {
	const report = validate(
		"const {t}=useTranslation(['common','tasks']); t('start'); i18n.t('start',{ns:'tasks'});",
		{ common: { save: "Save" }, tasks: { start: "Start" } },
	);
	assert.deepEqual(report.errors, []);
	assert.equal(report.checkedReferences, 2);
});

test("dynamic keys are tracked separately and do not pretend to be statically verified", () => {
	const report = validate(
		// biome-ignore lint/suspicious/noTemplateCurlyInString: This fixture tests parsing a literal dynamic translation key.
		"const {t}=useTranslation('common'); t(`status.${state}`); t(key); t('save');",
		{ common: { save: "Save" } },
	);
	assert.deepEqual(report.errors, []);
	assert.equal(report.checkedReferences, 1);
	assert.equal(report.dynamicReferences, 2);
});
