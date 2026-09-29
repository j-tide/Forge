/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enCommon from '../../../shared/i18n/locales/en/common.json';
import enTasks from '../../../shared/i18n/locales/en/tasks.json';
import zhCommon from '../../../shared/i18n/locales/zh-CN/common.json';
import zhTasks from '../../../shared/i18n/locales/zh-CN/tasks.json';
import type { IPCResult, Task } from '../../../shared/types';
import type { FileNode } from '../../../shared/types/project';
import { TaskFiles } from './TaskFiles';

vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: () => ({ settings: { preferredIDE: null } }),
}));

const listDirectory = vi.fn<typeof window.electronAPI.listDirectory>();
const readFile = vi.fn<typeof window.electronAPI.readFile>();
const originalListDirectory = window.electronAPI.listDirectory;
const originalReadFile = window.electronAPI.readFile;
const task: Task = {
  id: 'task-files-refresh', specId: 'spec-files-refresh', projectId: 'project',
  title: 'Refresh task files', description: 'Fixture', status: 'backlog',
  specsPath: '/fixture/specs/task-files-refresh', subtasks: [], logs: [],
  createdAt: new Date('2026-09-28T00:00:00Z'), updatedAt: new Date('2026-09-28T00:00:00Z'),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function mount(language: string) {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    resources: {
      en: { common: enCommon, tasks: enTasks },
      'zh-CN': { common: zhCommon, tasks: zhTasks },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  render(<I18nextProvider i18n={i18n}><TaskFiles task={task} /></I18nextProvider>);
}

beforeEach(() => {
  listDirectory.mockReset().mockResolvedValue({ success: true, data: [] });
  readFile.mockReset().mockResolvedValue({ success: true, data: '# Refreshed specification' });
  window.electronAPI.listDirectory = listDirectory;
  window.electronAPI.readFile = readFile;
});

afterEach(() => {
  cleanup();
  window.electronAPI.listDirectory = originalListDirectory;
  window.electronAPI.readFile = originalReadFile;
});

describe('Task file refresh accessibility', () => {
  it.each([
    { language: 'en', refreshLabel: 'Refresh' },
    { language: 'zh-CN', refreshLabel: '刷新' },
  ])('exposes the $language refresh action and prevents duplicate directory reloads while pending', async ({ language, refreshLabel }) => {
    await mount(language);
    const refresh = screen.getByRole('button', { name: refreshLabel });
    await waitFor(() => expect(refresh).toBeEnabled());
    expect(listDirectory).toHaveBeenCalledExactlyOnceWith(task.specsPath);

    const pending = deferred<IPCResult<FileNode[]>>();
    listDirectory.mockReturnValueOnce(pending.promise);
    fireEvent.click(refresh);
    expect(listDirectory).toHaveBeenCalledTimes(2);
    expect(listDirectory).toHaveBeenLastCalledWith(task.specsPath);
    expect(refresh).toBeDisabled();
    fireEvent.click(refresh);
    expect(listDirectory).toHaveBeenCalledTimes(2);

    await act(async () => {
      pending.resolve({
        success: true,
        data: [{ name: 'spec.md', path: `${task.specsPath}/spec.md`, isDirectory: false }],
      });
    });
    expect(screen.getByRole('option', { name: 'spec.md' })).toBeInTheDocument();
    expect(screen.getByText('# Refreshed specification')).toBeInTheDocument();
    expect(readFile).toHaveBeenCalledExactlyOnceWith(`${task.specsPath}/spec.md`);
    expect(refresh).toBeEnabled();
  });
});
