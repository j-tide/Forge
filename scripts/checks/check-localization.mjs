#!/usr/bin/env node
/** Read-only English / Simplified Chinese translation quality gate. */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTranslationReferences } from './localization-references.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
let localesDirectory = join(repositoryRoot, 'src/shared/i18n/locales');
let customLocales = false;
let sourceDirectory;
let reporter = 'human';
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--locales-dir' && args[index + 1]) {
    localesDirectory = resolve(args[++index]);
    customLocales = true;
  } else if (argument === '--source-dir' && args[index + 1]) {
    sourceDirectory = resolve(args[++index]);
  } else if (argument === '--reporter=json') {
    reporter = 'json';
  } else {
    console.error(`Unknown argument: ${argument}. Use --locales-dir <directory>, --source-dir <directory> or --reporter=json.`);
    process.exit(2);
  }
}

const errors = [];
const warnings = [];
const checkedFiles = [];
let checkedStrings = 0;
const issue = (severity, code, file, path, message) => {
  (severity === 'error' ? errors : warnings).push({ code, severity, file, path, message });
};
const nodeType = (value) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const variables = (value) => [...value.matchAll(/{{[^{}]+}}/g)].map((match) => match[0]).sort();
// Complete tagged spans may move when the sentence is translated; the tags themselves must remain.
const htmlTags = (value) => [...value.matchAll(/<\/?[a-zA-Z][^>]*>/g)].map((match) => match[0]).sort();
const sameList = (left, right) => JSON.stringify(left) === JSON.stringify(right);

// Product names, command literals and file paths are deliberately not translated.
const properNames = new Set([
  'Claude Code', 'Claude AI', 'Google AI', 'AWS Bedrock', 'Azure OpenAI',
  'Visual Studio Code', 'Forge Glass Preview', 'GitHub CLI', 'GitLab CLI',
  'OpenAI API', 'SF Mono', 'Segoe UI', 'ZHIPU AI', 'Claude Code CLI',
  'Gemini text-embedding-004'
]);
function unchangedEnglishSentence(english, chinese) {
  if (english !== chinese || /[\u3400-\u9fff]/u.test(chinese)) return false;
  if (properNames.has(english) || english.trim().length < 12) return false;
  if (!/\s/.test(english)) return false;
  if (/^(?:https?:\/\/|[.~]?\/|[A-Za-z]:\\|`[^`]+`$)/.test(english)) return false;
  if (/^(?:npm|npx|pnpm|yarn|bun|node|python3?|uv|git|claude|codex|curl|docker|cargo|pip|gh|glab)\s/.test(english)) return false;
  if (/^(?:\$|>|#)\s/.test(english)) return false;
  const withoutTokens = english.replace(/{{[^{}]+}}/g, '').replace(/<[^>]+>/g, '');
  return (withoutTokens.match(/[A-Za-z]{2,}/g) ?? []).length >= 3;
}

function compareNodes(english, chinese, englishFile, chineseFile, path = '$') {
  const englishType = nodeType(english);
  const chineseType = nodeType(chinese);
  if (englishType !== chineseType) {
    issue('error', 'I18N-TYPE-MISMATCH', chineseFile, path, `Expected ${englishType}; found ${chineseType}.`);
    return;
  }
  if (englishType === 'string') {
    checkedStrings += 1;
    if (!english.trim()) issue('error', 'I18N-EMPTY', englishFile, path, 'English source must not be empty.');
    if (!chinese.trim()) issue('error', 'I18N-EMPTY', chineseFile, path, 'Chinese translation must not be empty.');
    if (!sameList(variables(english), variables(chinese))) {
      issue('error', 'I18N-VARIABLES', chineseFile, path, `Preserve interpolation variables: ${variables(english).join(', ') || '(none)'}.`);
    }
    if (!sameList(htmlTags(english), htmlTags(chinese))) {
      issue('error', 'I18N-TAGS', chineseFile, path, `Preserve HTML tags: ${htmlTags(english).join(' ') || '(none)'}.`);
    }
    if (unchangedEnglishSentence(english, chinese)) {
      issue('warning', 'I18N-ENGLISH-REMAINS', chineseFile, path, `Review untranslated English text: ${JSON.stringify(chinese)}.`);
    }
    return;
  }
  if (englishType !== 'object' && englishType !== 'array') {
    issue('error', 'I18N-INVALID-LEAF', chineseFile, path, `Translation leaves must be strings; found ${chineseType}.`);
    return;
  }
  for (const key of Object.keys(english)) {
    const childPath = englishType === 'array' ? `${path}[${key}]` : `${path}.${key}`;
    if (!Object.hasOwn(chinese, key)) {
      issue('error', 'I18N-MISSING-KEY', chineseFile, childPath, 'Missing Chinese translation key.');
    } else {
      compareNodes(english[key], chinese[key], englishFile, chineseFile, childPath);
    }
  }
  for (const key of Object.keys(chinese)) {
    if (!Object.hasOwn(english, key)) {
      issue('error', 'I18N-EXTRA-KEY', chineseFile, `${path}.${key}`, 'Translation key does not exist in the English source.');
    }
  }
}

function namespaceFiles(language) {
  const directory = join(localesDirectory, language);
  try {
    return readdirSync(directory).filter((file) => file.endsWith('.json')).sort();
  } catch (error) {
    issue('error', 'I18N-LOCALE-DIRECTORY', directory, '$', `Cannot read ${language} locale directory (${error.code ?? 'read error'}).`);
    return [];
  }
}

function loadResource(language, namespace) {
  const file = join(localesDirectory, language, namespace);
  checkedFiles.push(file);
  try {
    const resource = JSON.parse(readFileSync(file, 'utf8'));
    if (nodeType(resource) !== 'object') {
      issue('error', 'I18N-RESOURCE-TYPE', file, '$', 'Namespace root must be an object.');
      return undefined;
    }
    return resource;
  } catch (error) {
    issue('error', 'I18N-JSON', file, '$', `Cannot parse translation JSON: ${error.message}.`);
    return undefined;
  }
}

const englishNamespaces = namespaceFiles('en');
const chineseNamespaces = namespaceFiles('zh-CN');
if (!englishNamespaces.length) {
  issue('error', 'I18N-NO-SOURCE', join(localesDirectory, 'en'), '$', 'At least one English namespace is required.');
}
for (const namespace of englishNamespaces) {
  const english = loadResource('en', namespace);
  if (!chineseNamespaces.includes(namespace)) {
    issue('error', 'I18N-MISSING-NAMESPACE', join(localesDirectory, 'zh-CN', namespace), '$', 'Missing Chinese namespace.');
    continue;
  }
  const chinese = loadResource('zh-CN', namespace);
  if (english !== undefined && chinese !== undefined) {
    compareNodes(english, chinese, join(localesDirectory, 'en', namespace), join(localesDirectory, 'zh-CN', namespace));
  }
}
for (const namespace of chineseNamespaces) {
  if (!englishNamespaces.includes(namespace)) {
    issue('error', 'I18N-EXTRA-NAMESPACE', join(localesDirectory, 'zh-CN', namespace), '$', 'Chinese namespace does not exist in the English source.');
  }
}

let checkedSourceFiles = [];
let checkedReferences = 0;
let dynamicReferences = 0;
// Fixture locales stay isolated from product references unless an explicit fixture source is supplied.
if (!sourceDirectory && !customLocales) sourceDirectory = join(repositoryRoot, 'src/renderer');
if (sourceDirectory && errors.length === 0) {
  try {
    const references = validateTranslationReferences({ sourceDirectory, localesDirectory });
    errors.push(...references.errors);
    checkedSourceFiles = references.checkedFiles;
    checkedReferences = references.checkedReferences;
    dynamicReferences = references.dynamicReferences;
  } catch (error) {
    issue('error', 'I18N-REFERENCE-SCAN', sourceDirectory, '$', `Cannot inspect translation references: ${error.message}.`);
  }
}

const report = {
  valid: errors.length === 0,
  namespaces: englishNamespaces.length,
  checkedStrings,
  checkedFiles,
  checkedSourceFiles,
  checkedReferences,
  dynamicReferences,
  errors,
  warnings
};
if (reporter === 'json') {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Localization ${report.valid ? 'PASS' : 'FAIL'}: ${report.namespaces} namespaces, ${checkedStrings} strings, ${errors.length} errors, ${warnings.length} warnings.`);
  if (sourceDirectory) {
    console.log(`Static references: ${checkedReferences} checked in ${checkedSourceFiles.length} source files; ${dynamicReferences} dynamic references require component / runtime tests.`);
  }
  for (const entry of [...errors, ...warnings]) {
    console.log(`${entry.severity.toUpperCase()} ${entry.code}\n  ${entry.file}\n  ${entry.path}: ${entry.message}`);
  }
}
process.exitCode = report.valid ? 0 : 1;
