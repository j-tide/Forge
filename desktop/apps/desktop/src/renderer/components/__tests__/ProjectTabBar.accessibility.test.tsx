/** @vitest-environment jsdom */
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import enCommon from '../../../shared/i18n/locales/en/common.json';
import type { Project } from '../../../shared/types';
import { TooltipProvider } from '../ui/tooltip';
import { ProjectTabBar } from '../ProjectTabBar';

vi.mock('../AuthStatusIndicator', () => ({ AuthStatusIndicator: () => null }));
vi.mock('../UsageIndicator', () => ({ UsageIndicator: () => null }));
const i18n = createInstance();
beforeEach(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { common: enCommon } }, interpolation: { escapeValue: false }, react: { useSuspense: false } });
});
afterEach(cleanup);

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
});
