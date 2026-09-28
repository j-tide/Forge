/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ImageUpload } from '../ImageUpload';
import { ReferencedFilesSection } from '../ReferencedFilesSection';
import { FileAutocomplete } from '../FileAutocomplete';
import { useFileExplorerStore } from '../../stores/file-explorer-store';
import en from '../../../shared/i18n/locales/en/uiTools.json';
import zh from '../../../shared/i18n/locales/zh-CN/uiTools.json';

async function renderInLanguage(language: string, children: React.ReactNode) {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    fallbackLng: 'en',
    ns: ['uiTools'],
    defaultNS: 'uiTools',
    resources: { en: { uiTools: en }, 'zh-CN': { uiTools: zh } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>);
}

afterEach(cleanup);

describe('file and image tool localization', () => {
  it('renders image upload guidance in both languages', async () => {
    const view = <ImageUpload images={[]} onImagesChange={() => undefined} />;
    const chinese = await renderInLanguage('zh-CN', view);
    const english = await renderInLanguage('en', view);
    expect(chinese).toContain('将图片拖到这里，或点击选择');
    expect(chinese).toContain('每张不超过 10 MB');
    expect(chinese).not.toContain('Drop images here');
    expect(english).toContain('Drop images here or click to browse');
  });

  it('translates reference labels without changing filenames or paths', async () => {
    const view = <ReferencedFilesSection
      files={[{ id: 'reference-1', name: 'MyProject', path: '/projects/MyProject', isDirectory: true, addedAt: new Date('2026-09-28T00:00:00Z') }]}
      onRemove={() => undefined} maxFiles={10} />;
    const chinese = await renderInLanguage('zh-CN', view);
    const english = await renderInLanguage('en', view);
    expect(chinese).toContain('引用的文件');
    expect(chinese).toContain('文件夹');
    expect(chinese).toContain('移除对 MyProject 的引用');
    expect(chinese).toContain('/projects/MyProject');
    expect(english).toContain('Referenced Files');
    expect(english).toContain('MyProject');
  });

  it('localizes the autocomplete empty state', async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: 'zh-CN', fallbackLng: 'en', ns: ['uiTools'], defaultNS: 'uiTools',
      resources: { en: { uiTools: en }, 'zh-CN': { uiTools: zh } },
      interpolation: { escapeValue: false },
    });
    useFileExplorerStore.setState({ files: new Map([['/not-loaded', []]]) });
    const view = <FileAutocomplete query="missing-file" projectPath="/not-loaded" position={{ top: 0, left: 0 }} onSelect={() => undefined} onClose={() => undefined} />;
    // Portals render on the client. Assert the real floating content rather
    // than the empty server markup returned by Radix Portal.
    const { unmount } = render(<I18nextProvider i18n={i18n}>{view}</I18nextProvider>);
    expect(screen.getByText('没有找到文件')).toBeInTheDocument();
    unmount();
    await i18n.changeLanguage('en');
    render(<I18nextProvider i18n={i18n}>{view}</I18nextProvider>);
    expect(screen.getByText('No files found')).toBeInTheDocument();
  });
});
