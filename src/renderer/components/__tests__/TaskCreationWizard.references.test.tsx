/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskCreationWizard } from '../TaskCreationWizard';
import { DEFAULT_APP_SETTINGS } from '../../../shared/constants';
import { useProjectStore } from '../../stores/project-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useFileExplorerStore } from '../../stores/file-explorer-store';
import type { Project } from '../../../shared/types';

vi.mock('../AgentProfileSelector', () => ({
  AgentProfileSelector: () => <span>Fixture agent configuration</span>,
}));

const projectPath = '/fixture/project';
const projectId = 'reference-fixture';
const createTask = vi.fn();
beforeEach(() => {
  useProjectStore.setState({ projects: [{ id: projectId, name: 'Reference fixture', path: projectPath } as Project] });
  useSettingsStore.setState({ settings: DEFAULT_APP_SETTINGS, providerAccounts: [] });
  useFileExplorerStore.setState({ files: new Map([
    [projectPath, [
      { name: 'src', path: `${projectPath}/src`, isDirectory: true },
      { name: 'tests', path: `${projectPath}/tests`, isDirectory: true },
      { name: '中文 文件.ts', path: `${projectPath}/中文 文件.ts`, isDirectory: false },
    ]],
    [`${projectPath}/src`, [{ name: 'same.ts', path: `${projectPath}/src/same.ts`, isDirectory: false }]],
    [`${projectPath}/tests`, [{ name: 'same.ts', path: `${projectPath}/tests/same.ts`, isDirectory: false }]],
  ]) });
  Object.assign(window.electronAPI, {
    getGitBranchesWithInfo: vi.fn().mockResolvedValue({ success: true, data: [{ name: 'main', displayName: 'main', type: 'local' }] }),
    getProjectEnv: vi.fn().mockResolvedValue({ success: true, data: { defaultBranch: 'main' } }),
    detectMainBranch: vi.fn().mockResolvedValue({ success: true, data: 'main' }),
    createTask,
  });
  createTask.mockReset();
  createTask.mockResolvedValue({ success: false, error: 'Local fixture only' });
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1200);
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(900);
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.tagName === 'TEXTAREA' ? new DOMRect(100, 100, 600, 240) : originalRect.call(this);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function openWizard() {
  render(<TaskCreationWizard projectId={projectId} open onOpenChange={vi.fn()} />);
  return screen.getByRole('textbox', { name: /Description/ }) as HTMLTextAreaElement;
}

function enterMention(textarea: HTMLTextAreaElement, value: string) {
  textarea.focus();
  fireEvent.change(textarea, { target: { value, selectionStart: value.length, selectionEnd: value.length } });
}

describe('TaskCreationWizard selected file identity', () => {
  it('preserves distinct project-relative paths for files with the same name', async () => {
    const textarea = openWizard();
    enterMention(textarea, 'Read @same');
    fireEvent.click(await screen.findByRole('option', { name: /same.ts src\/same.ts/ }));
    await waitFor(() => expect(textarea).toHaveValue('Read @same.ts'));
    enterMention(textarea, `${textarea.value} and @same`);
    fireEvent.click(await screen.findByRole('option', { name: /same.ts tests\/same.ts/ }));
    expect(screen.getByText('src/same.ts')).toBeInTheDocument();
    expect(screen.getByText('tests/same.ts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    await waitFor(() => expect(createTask).toHaveBeenCalled());
    expect(createTask.mock.calls[0][3].referencedFiles).toEqual([
      expect.objectContaining({ name: 'same.ts', path: 'src/same.ts' }),
      expect.objectContaining({ name: 'same.ts', path: 'tests/same.ts' }),
    ]);
  });

  it('keeps Unicode and spaced file references and removes them without re-adding a guessed path', async () => {
    const textarea = openWizard();
    enterMention(textarea, '查看 @中文');
    fireEvent.click(await screen.findByRole('option', { name: /中文 文件.ts/ }));
    expect(screen.getByRole('button', { name: 'Remove reference to 中文 文件.ts' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove reference to 中文 文件.ts' }));
    expect(textarea).toHaveValue('查看 中文 文件.ts');
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    await waitFor(() => expect(createTask).toHaveBeenCalled());
    expect(createTask.mock.calls[0][3].referencedFiles).toBeUndefined();
  });

  it('saves a selected Unicode path rather than relying on the text mention parser', async () => {
    const textarea = openWizard();
    enterMention(textarea, '查看 @中文');
    fireEvent.click(await screen.findByRole('option', { name: /中文 文件.ts/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    await waitFor(() => expect(createTask).toHaveBeenCalled());
    expect(createTask.mock.calls[0][3].referencedFiles).toEqual([
      expect.objectContaining({ name: '中文 文件.ts', path: '中文 文件.ts' }),
    ]);
  });

  it('does not re-add a removed ASCII reference or mistake email and traversal text for files', async () => {
    const textarea = openWizard();
    enterMention(textarea, 'Read @same');
    fireEvent.click(await screen.findByRole('option', { name: /same.ts src\/same.ts/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove reference to same.ts' }));
    expect(textarea).toHaveValue('Read same.ts');
    fireEvent.change(textarea, { target: { value: 'Read same.ts; ask hello@example.com about @../secret.ts and @/root.ts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    await waitFor(() => expect(createTask).toHaveBeenCalled());
    expect(createTask.mock.calls[0][3].referencedFiles).toBeUndefined();
  });

  it('rejects a candidate outside the current project without inserting text or a reference', async () => {
    useFileExplorerStore.setState({ files: new Map([[projectPath, [{ name: 'outside.ts', path: '/other/outside.ts', isDirectory: false }]]]) });
    const textarea = openWizard();
    enterMention(textarea, 'Read @outside');
    fireEvent.click(await screen.findByRole('option', { name: /outside.ts/ }));
    expect(textarea).toHaveValue('Read @outside');
    expect(screen.getByRole('alert')).toHaveTextContent('This file is no longer available inside the project');
    expect(screen.queryByRole('button', { name: 'Remove reference to outside.ts' })).not.toBeInTheDocument();
    expect(createTask).not.toHaveBeenCalled();
  });
});
