import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AVAILABLE_LANGUAGES,
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  normalizeLanguage
} from '../../constants/i18n';
import i18n, { resources } from '../index';

const localesDirectory = fileURLToPath(new URL('../locales/', import.meta.url));
const checker = fileURLToPath(new URL('../../../../../../scripts/check-localization.mjs', import.meta.url));

interface LocalizationIssue {
  code: string;
  severity: 'error' | 'warning';
  file: string;
  path: string;
  message: string;
}
interface LocalizationReport {
  valid: boolean;
  namespaces: number;
  checkedStrings: number;
  checkedFiles: string[];
  checkedSourceFiles: string[];
  checkedReferences: number;
  dynamicReferences: number;
  errors: LocalizationIssue[];
  warnings: LocalizationIssue[];
}

function runChecker(directory?: string, sourceDirectory?: string) {
  const arguments_ = [checker, '--reporter=json'];
  if (directory) arguments_.push('--locales-dir', directory);
  if (sourceDirectory) arguments_.push('--source-dir', sourceDirectory);
  const result = spawnSync(process.execPath, arguments_, {
    encoding: 'utf8',
    timeout: 15_000
  });
  if (result.error) throw result.error;
  return { status: result.status, report: JSON.parse(result.stdout) as LocalizationReport };
}

function withFixture(english: Record<string, unknown>, chinese: Record<string, unknown>, action: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'forge-localization-'));
  try {
    for (const [language, content] of [['en', english], ['zh-CN', chinese]] as const) {
      mkdirSync(join(directory, language));
      writeFileSync(join(directory, language, 'fixture.json'), JSON.stringify(content));
    }
    action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('translation resource completeness', () => {
  it('passes the default product quality gate, including statically declared translation references', () => {
    const result = runChecker();
    expect(result.report.errors, JSON.stringify(result.report.errors, null, 2)).toEqual([]);
    expect(result.report.valid).toBe(true);
    expect(result.status).toBe(0);
    expect(result.report.checkedSourceFiles.length).toBeGreaterThan(0);
    expect(result.report.checkedReferences).toBeGreaterThan(0);
  });

  it('validates every English and Chinese namespace, key tree, string, variable and HTML tag', () => {
    const result = runChecker(localesDirectory);
    expect(result.report.errors, JSON.stringify(result.report.errors, null, 2)).toEqual([]);
    expect(result.report.valid).toBe(true);
    expect(result.status).toBe(0);
    const namespaces = readdirSync(join(localesDirectory, 'en')).filter((file) => file.endsWith('.json'));
    expect(result.report.namespaces).toBe(namespaces.length);
    expect(result.report.checkedFiles).toHaveLength(namespaces.length * 2);
    expect(result.report.checkedStrings).toBeGreaterThan(0);
  });

  it('bundles all source namespaces for both visible application languages', () => {
    const namespaces = readdirSync(join(localesDirectory, 'en'))
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.slice(0, -5))
      .sort();
    expect(Object.keys(resources.en).sort()).toEqual(namespaces);
    expect(Object.keys(resources['zh-CN']).sort()).toEqual(namespaces);
    expect([...(i18n.options.ns as string[])].sort()).toEqual(namespaces);
  });

  it('defaults new profiles to Chinese without relying on the test setup current language', () => {
    expect(DEFAULT_LANGUAGE).toBe('zh-CN');
    expect(i18n.options.lng).toBe(DEFAULT_LANGUAGE);
    expect(i18n.options.supportedLngs).toEqual(expect.arrayContaining(['zh-CN', 'en', 'fr']));
    expect(AVAILABLE_LANGUAGES.map((language) => language.value)).toEqual(['zh-CN', 'en']);
  });

  it('retains French resources and saved French preferences', () => {
    expect(resources.fr.common).toBeDefined();
    expect(isSupportedLanguage('fr')).toBe(true);
    expect(normalizeLanguage('fr')).toBe('fr');
    expect(normalizeLanguage('fr-FR')).toBe('fr');
  });

  it.each(['zh', 'zh-cn', 'zh-Hans', 'zh-Hans-CN', 'zh_CN', 'zh-TW'])('normalizes Chinese regional preference %s', (language) => {
    expect(normalizeLanguage(language)).toBe('zh-CN');
  });

  it.each(['en', 'en-US', 'en_GB', 'EN-us'])('normalizes English regional preference %s', (language) => {
    expect(normalizeLanguage(language)).toBe('en');
  });

  it.each([undefined, null, '', 'de', 'unknown', 42, {}])('uses a supported default for unknown preference %j', (language) => {
    expect(normalizeLanguage(language)).toBe(DEFAULT_LANGUAGE);
    expect(isSupportedLanguage(language)).toBe(false);
  });
});

describe('localization CLI failure behavior', () => {
  it.each([
    { english: { nested: { required: 'Required text' } }, chinese: { nested: {} }, code: 'I18N-MISSING-KEY' },
    { english: { title: 'Title' }, chinese: { title: '标题', extra: '多余键' }, code: 'I18N-EXTRA-KEY' },
    { english: { title: 'Title' }, chinese: { title: { value: '标题' } }, code: 'I18N-TYPE-MISMATCH' },
    { english: { title: 'Title' }, chinese: { title: ' ' }, code: 'I18N-EMPTY' },
    { english: { title: 'Hello {{name}}' }, chinese: { title: '你好 {{other}}' }, code: 'I18N-VARIABLES' },
    { english: { title: '<strong>Hello</strong>' }, chinese: { title: '<em>你好</em>' }, code: 'I18N-TAGS' }
  ])('returns non-zero with actionable $code diagnostics', ({ english, chinese, code }) => {
    withFixture(english, chinese, (directory) => {
      const result = runChecker(directory);
      expect(result.status).toBe(1);
      expect(result.report.valid).toBe(false);
      expect(result.report.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ code, severity: 'error', file: expect.stringContaining('zh-CN'), path: expect.stringContaining('$') })
      ]));
    });
  });

  it('rejects a missing namespace instead of silently using English fallback', () => {
    withFixture({ title: 'Title' }, { title: '标题' }, (directory) => {
      rmSync(join(directory, 'zh-CN', 'fixture.json'));
      const result = runChecker(directory);
      expect(result.status).toBe(1);
      expect(result.report.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'I18N-MISSING-NAMESPACE' })]));
    });
  });

  it('rejects malformed JSON with a file-specific error', () => {
    withFixture({ title: 'Title' }, { title: '标题' }, (directory) => {
      writeFileSync(join(directory, 'zh-CN', 'fixture.json'), '{bad json');
      const result = runChecker(directory);
      expect(result.status).toBe(1);
      expect(result.report.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'I18N-JSON' })]));
    });
  });

  it('warns about unchanged English sentences without treating brands or commands as missing translations', () => {
    const content = {
      title: 'This sentence still needs translation.',
      brand: 'Forge Glass Preview',
      command: 'npm run build',
      provider: 'Azure OpenAI',
      path: './example project/README.md'
    };
    withFixture(content, content, (directory) => {
      const result = runChecker(directory);
      expect(result.status).toBe(0);
      expect(result.report.errors).toEqual([]);
      expect(result.report.warnings).toEqual([
        expect.objectContaining({ code: 'I18N-ENGLISH-REMAINS', path: '$.title' })
      ]);
    });
  });

  it('fails a source reference that is absent from both otherwise complete locales', () => {
    withFixture({ title: 'Title' }, { title: '标题' }, (directory) => {
      const sourceDirectory = join(directory, 'source');
      mkdirSync(sourceDirectory);
      writeFileSync(join(sourceDirectory, 'Example.tsx'), "const { t } = useTranslation('fixture'); t('missing');");
      const result = runChecker(directory, sourceDirectory);
      expect(result.status).toBe(1);
      expect(result.report.checkedReferences).toBe(1);
      expect(result.report.errors).toEqual([
        expect.objectContaining({ code: 'I18N-REFERENCE-MISSING', path: expect.stringMatching(/^1:/) })
      ]);
    });
  });

  it('reports dynamic keys separately instead of claiming they were statically verified', () => {
    withFixture({ title: 'Title' }, { title: '标题' }, (directory) => {
      const sourceDirectory = join(directory, 'source');
      mkdirSync(sourceDirectory);
      writeFileSync(join(sourceDirectory, 'Example.tsx'), "const { t } = useTranslation('fixture'); t('title'); t(key);");
      const result = runChecker(directory, sourceDirectory);
      expect(result.status).toBe(0);
      expect(result.report.checkedReferences).toBe(1);
      expect(result.report.dynamicReferences).toBe(1);
      expect(result.report.checkedFiles).toHaveLength(2);
      expect(result.report.checkedSourceFiles).toHaveLength(1);
    });
  });
});
