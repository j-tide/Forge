/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enCommon from '../../../shared/i18n/locales/en/common.json';
import enTasks from '../../../shared/i18n/locales/en/tasks.json';
import enUiTasks from '../../../shared/i18n/locales/en/uiTasks.json';
import zhCommon from '../../../shared/i18n/locales/zh-CN/common.json';
import zhTasks from '../../../shared/i18n/locales/zh-CN/tasks.json';
import zhUiTasks from '../../../shared/i18n/locales/zh-CN/uiTasks.json';
import type { IPCResult, Task } from '../../../shared/types';
import { TooltipProvider } from '../ui/tooltip';
import { TaskFiles } from './TaskFiles';

vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: () => ({
    settings: { preferredIDE: 'vscode', customIDEPath: '/fixture/editor' },
  }),
}));

const listDirectory = vi.fn<typeof window.electronAPI.listDirectory>();
const readFile = vi.fn<typeof window.electronAPI.readFile>();
const openInIDE = vi.fn<typeof window.electronAPI.worktreeOpenInIDE>();
const originalListDirectory = window.electronAPI.listDirectory;
const originalReadFile = window.electronAPI.readFile;
const originalOpenInIDE = window.electronAPI.worktreeOpenInIDE;
const task: Task = {
  id: 'task-files-ide', specId: 'spec-files-ide', projectId: 'project',
  title: 'Open task files in IDE', description: 'Fixture', status: 'backlog',
  specsPath: '/fixture/specs/task-files-ide', subtasks: [], logs: [],
  createdAt: new Date('2026-09-28T00:00:00Z'), updatedAt: new Date('2026-09-28T00:00:00Z'),
};

type IDEOpenResult = IPCResult<{ opened: boolean }>;
type IDEFailure = {
  label: string;
  expectedError?: string;
} & (
  | { outcome: 'returned'; result: IDEOpenResult }
  | { outcome: 'rejected'; reason: unknown }
);
const failures: IDEFailure[] = [
  { label: 'a returned error', outcome: 'returned', result: { success: false, error: 'The configured IDE was not found' }, expectedError: 'The configured IDE was not found' },
  { label: 'a returned failure without details', outcome: 'returned', result: { success: false } },
  { label: 'a successful IPC response that did not open the IDE', outcome: 'returned', result: { success: true, data: { opened: false } } },
  { label: 'a successful IPC response without an open result', outcome: 'returned', result: { success: true } },
  { label: 'a transport Error', outcome: 'rejected', reason: new Error('IDE launch transport interrupted'), expectedError: 'IDE launch transport interrupted' },
  { label: 'an unknown rejection', outcome: 'rejected', reason: null },
];

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
      en: { common: enCommon, tasks: enTasks, uiTasks: enUiTasks },
      'zh-CN': { common: zhCommon, tasks: zhTasks, uiTasks: zhUiTasks },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  render(<I18nextProvider i18n={i18n}><TooltipProvider><TaskFiles task={task} /></TooltipProvider></I18nextProvider>);
  await screen.findByText('# Specification fixture');
}

beforeEach(() => {
  listDirectory.mockReset().mockResolvedValue({
    success: true,
    data: [{ name: 'spec.md', path: `${task.specsPath}/spec.md`, isDirectory: false }],
  });
  readFile.mockReset().mockResolvedValue({ success: true, data: '# Specification fixture' });
  openInIDE.mockReset().mockResolvedValue({ success: true, data: { opened: true } });
  window.electronAPI.listDirectory = listDirectory;
  window.electronAPI.readFile = readFile;
  window.electronAPI.worktreeOpenInIDE = openInIDE;
});

afterEach(() => {
  cleanup();
  window.electronAPI.listDirectory = originalListDirectory;
  window.electronAPI.readFile = originalReadFile;
  window.electronAPI.worktreeOpenInIDE = originalOpenInIDE;
});

describe.each([
  { language: 'en', openLabel: 'Open in IDE', fallbackError: 'Failed to open in IDE' },
  { language: 'zh-CN', openLabel: '在 IDE 中打开', fallbackError: '无法在 IDE 中打开' },
])('Task file IDE action in $language', ({ language, openLabel, fallbackError }) => {
  it.each(failures)('reports $label and permits a successful retry without duplicate launches', async (failure) => {
    if (failure.outcome === 'returned') openInIDE.mockResolvedValueOnce(failure.result);
    else openInIDE.mockRejectedValueOnce(failure.reason);
    await mount(language);
    const open = screen.getByRole('button', { name: openLabel });
    fireEvent.click(open);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(failure.expectedError ?? fallbackError);
    expect(openInIDE).toHaveBeenCalledExactlyOnceWith(task.specsPath, 'vscode', '/fixture/editor');
    expect(open).toBeEnabled();
    expect(screen.getByRole('option', { name: 'spec.md' })).toBeInTheDocument();
    expect(screen.getByText('# Specification fixture')).toBeInTheDocument();

    const retry = deferred<IDEOpenResult>();
    openInIDE.mockReturnValueOnce(retry.promise);
    fireEvent.click(open);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(open).toBeDisabled();
    expect(open).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(open);
    expect(openInIDE).toHaveBeenCalledTimes(2);

    await act(async () => { retry.resolve({ success: true, data: { opened: true } }); });
    expect(open).toBeEnabled();
    expect(open).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(openInIDE).toHaveBeenLastCalledWith(task.specsPath, 'vscode', '/fixture/editor');
    expect(screen.getByText('# Specification fixture')).toBeInTheDocument();
  });
});
