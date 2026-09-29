/** @vitest-environment jsdom */
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import enCommon from '../../../shared/i18n/locales/en/common.json';
import type { Project } from '../../../shared/types';
import { TooltipProvider } from '../ui/tooltip';
import { ProjectTabBar } from '../ProjectTabBar';
import { useProjectTabSensors } from '../SortableProjectTab';
import { useProjectStore } from '../../stores/project-store';

vi.mock('../AuthStatusIndicator', () => ({ AuthStatusIndicator: () => null }));
vi.mock('../UsageIndicator', () => ({ UsageIndicator: () => null }));
const i18n = createInstance();
beforeEach(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { common: enCommon } }, interpolation: { escapeValue: false }, react: { useSuspense: false } });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useProjectStore.setState({ projects: [], openProjectIds: [], tabOrder: [], activeProjectId: null, selectedProjectId: null });
});

const projects = ['Alpha', 'Beta'].map((name, index) => ({ id: `project-${index}`, name, path: `/projects/${name}`, autoBuildPath: '', createdAt: new Date(), updatedAt: new Date(), settings: { model: 'test-model', memoryBackend: 'file', linearSync: false, notifications: { onTaskComplete: false, onTaskFailed: false, onReviewNeeded: false, sound: false } } }) as Project);

function show(isSettingsActive = false) {
  const callbacks = { onProjectSelect: vi.fn(), onProjectClose: vi.fn(), onAddProject: vi.fn(), onSettingsClick: vi.fn() };
  function Tabs() {
    const [selected, setSelected] = useState(projects[0].id);
    return <ProjectTabBar projects={projects} activeProjectId={selected} {...callbacks} isSettingsActive={isSettingsActive} onProjectSelect={(id) => { setSelected(id); callbacks.onProjectSelect(id); }} />;
  }
  render(<I18nextProvider i18n={i18n}><TooltipProvider><DndContext><SortableContext items={projects.map((project) => project.id)} strategy={horizontalListSortingStrategy}><Tabs /></SortableContext></DndContext></TooltipProvider></I18nextProvider>);
  return callbacks;
}

function showSortableStoreTabs() {
  const ids = projects.map((project) => project.id);
  useProjectStore.setState({ projects, openProjectIds: ids, tabOrder: ids, activeProjectId: ids[0], selectedProjectId: ids[0] });
  const saveTabState = vi.spyOn(window.electronAPI, 'saveTabState').mockResolvedValue({ success: true });
  const onProjectSelect = vi.fn();
  const onDragStart = vi.fn();
  const onDragEnd = vi.fn();
  const onDragCancel = vi.fn();
  const onDragOver = vi.fn();
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    if (this.classList.contains('forge-glass-project-tab')) {
      const projectName = this.querySelector('[role="tab"]')?.textContent;
      return new DOMRect(projectName === 'Beta' ? 180 : 0, 0, 160, 36);
    }
    return originalRect.call(this);
  });
  function StoreTabs() {
    const state = useProjectStore();
    const tabs = state.getProjectTabs();
    const sensors = useProjectTabSensors();
    const handleDragEnd = (event: DragEndEvent) => {
      onDragEnd(event);
      if (!event.over) return;
      const oldIndex = tabs.findIndex((project) => project.id === event.active.id);
      const newIndex = tabs.findIndex((project) => project.id === event.over?.id);
      if (oldIndex !== newIndex && oldIndex !== -1 && newIndex !== -1) state.reorderTabs(oldIndex, newIndex);
    };
    return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={handleDragEnd} onDragCancel={onDragCancel} onDragOver={onDragOver}>
      <SortableContext items={tabs.map((project) => project.id)} strategy={horizontalListSortingStrategy}>
        <ProjectTabBar projects={tabs} activeProjectId={state.activeProjectId} onProjectSelect={onProjectSelect} onProjectClose={vi.fn()} onAddProject={vi.fn()} />
      </SortableContext>
    </DndContext>;
  }
  render(<I18nextProvider i18n={i18n}><TooltipProvider><StoreTabs /></TooltipProvider></I18nextProvider>);
  return { saveTabState, onProjectSelect, onDragStart, onDragEnd, onDragCancel, onDragOver };
}

async function startKeyboardReorder(handle: HTMLElement) {
  handle.focus();
  fireEvent.keyDown(handle, { key: ' ', code: 'Space' });
  // KeyboardSensor attaches its document listener in the next task.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe('Project tabs keyboard and actions', () => {
  it('exposes project tabs with selected state and separate drag handles', () => {
    show();
    expect(screen.getByRole('tablist', { name: enCommon.projectTab.projectsAriaLabel })).not.toBeNull();
    expect(screen.getByRole('tab', { name: 'Alpha' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Beta' }).getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('button', { name: 'Reorder project Alpha' })).not.toBeNull();
    expect(screen.getByRole('button', { name: enCommon.projectTab.settings })).not.toBeNull();
  });

  it('selects and focuses adjacent tabs with arrow keys and wraps at either end', () => {
    const callbacks = show();
    const alpha = screen.getByRole('tab', { name: 'Alpha' });
    alpha.focus();
    fireEvent.keyDown(alpha, { key: 'ArrowRight' });
    const beta = screen.getByRole('tab', { name: 'Beta' });
    expect(callbacks.onProjectSelect).toHaveBeenLastCalledWith(projects[1].id);
    expect(document.activeElement).toBe(beta);
    expect(beta.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(beta, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(alpha);
    expect(callbacks.onProjectSelect).toHaveBeenLastCalledWith(projects[0].id);
    fireEvent.keyDown(alpha, { key: 'End' });
    expect(document.activeElement).toBe(beta);
    fireEvent.keyDown(beta, { key: 'Home' });
    expect(document.activeElement).toBe(alpha);
  });

  it('keeps settings, close and add actions distinct from selecting a project', () => {
    const callbacks = show();
    fireEvent.click(screen.getByRole('button', { name: enCommon.projectTab.settings }));
    expect(callbacks.onSettingsClick).toHaveBeenCalledOnce();
    expect(callbacks.onProjectSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: enCommon.projectTab.closeTabAriaLabel })[0]);
    expect(callbacks.onProjectClose).toHaveBeenCalledWith(projects[0].id);
    expect(callbacks.onProjectSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: enCommon.projectTab.addProjectAriaLabel }));
    expect(callbacks.onAddProject).toHaveBeenCalledOnce();
  });

  it('retains Cmd/Ctrl project selection shortcuts', () => {
    const callbacks = show();
    fireEvent.keyDown(window, { key: '2', ctrlKey: true });
    expect(callbacks.onProjectSelect).toHaveBeenLastCalledWith(projects[1].id);
    expect(screen.getByRole('tab', { name: 'Beta' }).getAttribute('aria-selected')).toBe('true');
  });

  it('keeps modifier shortcuts available when a workspace tab has focus', () => {
    const callbacks = show();
    const tab = screen.getByRole('tab', { name: 'Alpha' });
    tab.focus();
    fireEvent.keyDown(tab, { key: '2', ctrlKey: true });
    expect(callbacks.onProjectSelect).toHaveBeenLastCalledWith(projects[1].id);
  });

  it('does not switch or close projects while editing app or project settings', () => {
    const callbacks = show(true);
    fireEvent.keyDown(window, { key: '2', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Tab', metaKey: true });
    fireEvent.keyDown(window, { key: 'w', metaKey: true });
    expect(callbacks.onProjectSelect).not.toHaveBeenCalled();
    expect(callbacks.onProjectClose).not.toHaveBeenCalled();
  });

  it.each(['dialog', 'alertdialog'])('keeps project shortcuts out of an open %s', (role) => {
    const callbacks = show();
    const modal = document.createElement('section');
    modal.setAttribute('role', role);
    document.body.append(modal);
    try {
      fireEvent.keyDown(window, { key: '2', ctrlKey: true });
      fireEvent.keyDown(window, { key: 'w', ctrlKey: true });
      expect(callbacks.onProjectSelect).not.toHaveBeenCalled();
      expect(callbacks.onProjectClose).not.toHaveBeenCalled();
    } finally { modal.remove(); }
  });

  it('preserves the terminal modifier shortcut passthrough', () => {
    const callbacks = show();
    const terminal = document.createElement('textarea');
    terminal.classList.add('xterm-helper-textarea');
    document.body.append(terminal);
    try {
      fireEvent.keyDown(terminal, { key: '2', ctrlKey: true });
      expect(callbacks.onProjectSelect).toHaveBeenLastCalledWith(projects[1].id);
    } finally { terminal.remove(); }
  });

  it('reorders and persists project tabs with the production keyboard sensor while restoring handle focus', async () => {
    const callbacks = showSortableStoreTabs();
    const handle = screen.getByRole('button', { name: 'Reorder project Alpha' });
    await startKeyboardReorder(handle);
    expect(callbacks.onDragStart).toHaveBeenCalledOnce();
    expect(callbacks.onDragStart.mock.calls[0][0].active.id).toBe(projects[0].id);
    fireEvent.keyDown(handle, { key: 'ArrowRight', code: 'ArrowRight' });
    await waitFor(() => expect(callbacks.onDragOver.mock.calls.at(-1)?.[0].over?.id).toBe(projects[1].id));
    fireEvent.keyDown(handle, { key: ' ', code: 'Space' });
    await waitFor(() => expect(useProjectStore.getState().tabOrder).toEqual([projects[1].id, projects[0].id]));
    expect(callbacks.onDragEnd).toHaveBeenCalledOnce();
    expect(callbacks.onProjectSelect).not.toHaveBeenCalled();
    expect(callbacks.onDragCancel).not.toHaveBeenCalled();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Beta', 'Alpha']);
    await waitFor(() => expect(document.activeElement).toBe(handle));
    await waitFor(() => expect(callbacks.saveTabState).toHaveBeenCalledOnce());
    expect(callbacks.saveTabState).toHaveBeenCalledWith({
      openProjectIds: projects.map((project) => project.id), activeProjectId: projects[0].id,
      tabOrder: [projects[1].id, projects[0].id],
    });
  });

  it('cancels keyboard reordering with Escape without selection, store changes or persistence', async () => {
    const callbacks = showSortableStoreTabs();
    const handle = screen.getByRole('button', { name: 'Reorder project Alpha' });
    await startKeyboardReorder(handle);
    fireEvent.keyDown(handle, { key: 'ArrowRight', code: 'ArrowRight' });
    await waitFor(() => expect(callbacks.onDragOver.mock.calls.at(-1)?.[0].over?.id).toBe(projects[1].id));
    fireEvent.keyDown(handle, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(callbacks.onDragCancel).toHaveBeenCalledOnce());
    expect(callbacks.onDragEnd).not.toHaveBeenCalled();
    expect(callbacks.onProjectSelect).not.toHaveBeenCalled();
    expect(useProjectStore.getState().tabOrder).toEqual(projects.map((project) => project.id));
    await waitFor(() => expect(document.activeElement).toBe(handle));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 120)); });
    expect(callbacks.saveTabState).not.toHaveBeenCalled();
  });
});
