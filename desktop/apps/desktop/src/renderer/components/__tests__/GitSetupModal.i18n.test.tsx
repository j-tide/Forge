/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import enDialogs from '../../../shared/i18n/locales/en/dialogs.json';
import enIntegrations from '../../../shared/i18n/locales/en/uiIntegrations.json';
import zhIntegrations from '../../../shared/i18n/locales/zh-CN/uiIntegrations.json';
import type { Project } from '../../../shared/types';
import { GitSetupModal } from '../GitSetupModal';

const project: Project = {
  id: 'localization-project',
  name: 'Project 名称',
  path: '/example/Project 名称',
  autoBuildPath: '/example/Project 名称/.forge-glass-preview',
  settings: {
    model: 'example-model',
    memoryBackend: 'file',
    linearSync: false,
    notifications: {
      onTaskComplete: false,
      onTaskFailed: false,
      onReviewNeeded: false,
      sound: false
    }
  },
  createdAt: new Date(0),
  updatedAt: new Date(0)
};

async function mount(language: 'en' | 'zh-CN') {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    resources: {
      en: { dialogs: enDialogs, uiIntegrations: enIntegrations },
      'zh-CN': { uiIntegrations: zhIntegrations }
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false }
  });
  const onSkip = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <GitSetupModal
        open
        onOpenChange={onOpenChange}
        onSkip={onSkip}
        project={project}
        gitStatus={{ isGitRepo: false, hasCommits: false, currentBranch: null }}
        onGitInitialized={vi.fn()}
      />
    </I18nextProvider>
  );
  return { i18n, onSkip, onOpenChange };
}

afterEach(cleanup);

describe('Git setup localization', () => {
  it('keeps Git initialization open until the running operation returns', async () => {
    type InitializationResponse = Awaited<ReturnType<typeof window.electronAPI.initializeGit>>;
    let resolveInitialization!: (value: InitializationResponse) => void;
    window.electronAPI.initializeGit = vi.fn(() => new Promise<InitializationResponse>(resolve => { resolveInitialization = resolve; }));
    const { onOpenChange } = await mount('en');
    fireEvent.click(screen.getByRole('button', { name: 'Initialize Git' }));
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onOpenChange).not.toHaveBeenCalled();
    await act(async () => resolveInitialization({ success: false }));
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it('switches the visible actions without translating executable Git commands', async () => {
    const { i18n } = await mount('en');
    expect(screen.getByRole('button', { name: 'Initialize Git' })).toBeVisible();
    expect(screen.getByText('git add .')).toBeInTheDocument();
    await act(async () => { await i18n.changeLanguage('zh-CN'); });
    expect(screen.getByRole('button', { name: '初始化 Git' })).toBeVisible();
    expect(screen.getByRole('button', { name: '暂时跳过' })).toBeVisible();
    expect(screen.getByText('git add .')).toBeInTheDocument();
    expect(screen.getByText('git commit -m "Initial commit"')).toBeInTheDocument();
  });

  it('keeps the skip action equivalent in Chinese', async () => {
    const { onSkip, onOpenChange } = await mount('zh-CN');
    fireEvent.click(screen.getByRole('button', { name: '暂时跳过' }));
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a localized fallback on initialization failure while sending the original path', async () => {
    const initializeGit = vi.fn().mockResolvedValue({ success: false });
    window.electronAPI.initializeGit = initializeGit;
    await mount('zh-CN');
    fireEvent.click(screen.getByRole('button', { name: '初始化 Git' }));
    expect(await screen.findByText('无法初始化 Git')).toBeVisible();
    expect(initializeGit).toHaveBeenCalledWith(project.path);
  });
});
