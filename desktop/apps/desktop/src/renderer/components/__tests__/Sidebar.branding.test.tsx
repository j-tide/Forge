/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import enNavigation from '../../../shared/i18n/locales/en/navigation.json';
import enDialogs from '../../../shared/i18n/locales/en/dialogs.json';
import enCommon from '../../../shared/i18n/locales/en/common.json';
import enWelcome from '../../../shared/i18n/locales/en/welcome.json';
import enShell from '../../../shared/i18n/locales/en/uiShell.json';
import { Sidebar } from '../Sidebar';

const sidebarState = vi.hoisted(() => ({ collapsed: false, selected: false }));

vi.mock('../../stores/project-store', () => ({
  useProjectStore: (selector: (state: object) => unknown) => selector({ projects: [], selectedProjectId: sidebarState.selected ? 'project-1' : null }),
  initializeProject: vi.fn(), removeProject: vi.fn(),
}));
vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: (selector: (state: object) => unknown) => selector({ settings: { sidebarCollapsed: sidebarState.collapsed } }),
  saveSettings: vi.fn(),
}));
vi.mock('../../stores/project-env-store', () => ({
  useProjectEnvStore: (selector: (state: object) => unknown) => selector({ envConfig: null }),
  loadProjectEnvConfig: vi.fn(), clearProjectEnvConfig: vi.fn(),
}));
vi.mock('../AddProjectModal', () => ({ AddProjectModal: () => null }));
vi.mock('../GitSetupModal', () => ({ GitSetupModal: () => null }));
vi.mock('../RateLimitIndicator', () => ({ RateLimitIndicator: () => null }));
vi.mock('../UpdateBanner', () => ({ UpdateBanner: () => null }));

const i18n = createInstance();
beforeEach(async () => {
  sidebarState.collapsed = false;
  sidebarState.selected = false;
  await i18n.use(initReactI18next).init({
    lng: 'en', fallbackLng: 'en',
    resources: { en: { navigation: enNavigation, dialogs: enDialogs, common: enCommon, welcome: enWelcome, uiShell: enShell } },
    interpolation: { escapeValue: false }, react: { useSuspense: false },
  });
});

describe('Sidebar shortcut scope', () => {
  const mount = (isSettingsActive = false) => {
    sidebarState.selected = true;
    const onViewChange = vi.fn();
    render(<I18nextProvider i18n={i18n}><Sidebar onSettingsClick={vi.fn()} onNewTaskClick={vi.fn()} onViewChange={onViewChange} isSettingsActive={isSettingsActive} /></I18nextProvider>);
    return onViewChange;
  };

  it('keeps plain-key navigation available in the main workspace', () => {
    const onViewChange = mount();
    fireEvent.keyDown(window, { key: 'c' });
    expect(onViewChange).toHaveBeenCalledWith('context');
  });

  it('does not navigate away from settings and discard the draft', () => {
    const onViewChange = mount(true);
    fireEvent.keyDown(window, { key: 'c' });
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it('blocks project settings shortcuts without marking app settings as selected', () => {
    sidebarState.selected = true;
    const onViewChange = vi.fn();
    render(<I18nextProvider i18n={i18n}><Sidebar onSettingsClick={vi.fn()} onNewTaskClick={vi.fn()} onViewChange={onViewChange} isNavigationBlocked /></I18nextProvider>);
    fireEvent.keyDown(window, { key: 'c' });
    expect(onViewChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: enNavigation.actions.settings }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: enNavigation.items.kanban }).getAttribute('aria-current')).toBeNull();
  });

  it.each(['dialog', 'alertdialog'])('does not switch the background view while a %s is open', (role) => {
    const onViewChange = mount();
    const modal = document.createElement('section');
    modal.setAttribute('role', role);
    modal.innerHTML = '<button>Confirm</button>';
    document.body.append(modal);
    try {
      (modal.firstElementChild as HTMLButtonElement).focus();
      fireEvent.keyDown(modal.firstElementChild as Element, { key: 'c' });
      fireEvent.keyDown(window, { key: 'c' });
      expect(onViewChange).not.toHaveBeenCalled();
    } finally {
      modal.remove();
    }
  });

  it.each(['button', 'a', 'select', 'textarea', 'input'])('does not consume keys from an interactive %s', (tag) => {
    const onViewChange = mount();
    const target = document.createElement(tag);
    document.body.append(target);
    try {
      fireEvent.keyDown(target, { key: 'c' });
      expect(onViewChange).not.toHaveBeenCalled();
    } finally {
      target.remove();
    }
  });

  it('does not consume keys from a nested contenteditable surface', () => {
    const onViewChange = mount();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const text = document.createElement('span');
    editor.append(text);
    document.body.append(editor);
    try {
      fireEvent.keyDown(text, { key: 'c' });
      expect(onViewChange).not.toHaveBeenCalled();
    } finally {
      editor.remove();
    }
  });

  it('does not consume keys from a custom combobox', () => {
    const onViewChange = mount();
    const control = document.createElement('div');
    control.setAttribute('role', 'combobox');
    document.body.append(control);
    try {
      fireEvent.keyDown(control, { key: 'c' });
      expect(onViewChange).not.toHaveBeenCalled();
    } finally {
      control.remove();
    }
  });
});
afterEach(cleanup);

describe('Forge sidebar product identity', () => {
  it('shows Forge navigation without a sponsor or upstream marketing action', () => {
    render(<I18nextProvider i18n={i18n}><Sidebar onSettingsClick={vi.fn()} onNewTaskClick={vi.fn()} /></I18nextProvider>);
    expect(screen.getByText('Forge')).toBeDefined();
    expect(document.querySelector('.forge-glass-sidebar-header .forge-brand-mark')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /sponsor|project support|aperant/i })).toBeNull();
    expect(screen.queryByText(/aperant/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'New Task' }).getAttribute('disabled')).not.toBeNull();
  });

  it('shows the Forge mark when the sidebar is collapsed', () => {
    sidebarState.collapsed = true;
    render(<I18nextProvider i18n={i18n}><Sidebar onSettingsClick={vi.fn()} onNewTaskClick={vi.fn()} /></I18nextProvider>);
    expect(screen.getByRole('img', { name: 'Forge' })).not.toBeNull();
    expect(document.querySelector('.forge-glass-sidebar-header .forge-brand-name')).toBeNull();
    expect(screen.queryByRole('button', { name: /sponsor|project support|aperant/i })).toBeNull();
  });

  it('keeps the primary action above grouped navigation and settings below it', () => {
    render(<I18nextProvider i18n={i18n}><Sidebar onSettingsClick={vi.fn()} onNewTaskClick={vi.fn()} /></I18nextProvider>);
    const create = screen.getByRole('button', { name: 'New Task' });
    const board = screen.getByRole('button', { name: enNavigation.items.kanban });
    const settings = screen.getByRole('button', { name: enNavigation.actions.settings });
    expect(create.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(board.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(Array.from(document.querySelectorAll('.forge-glass-sidebar-group h3')).map((heading) => heading.textContent))
      .toEqual([enNavigation.sections.work, enNavigation.sections.explore, enNavigation.sections.project]);
    expect(document.querySelectorAll('.forge-glass-sidebar-header button')).toHaveLength(1);
  });

  it('gives every collapsed navigation action an accessible name', () => {
    sidebarState.collapsed = true;
    render(<I18nextProvider i18n={i18n}><Sidebar onSettingsClick={vi.fn()} onNewTaskClick={vi.fn()} /></I18nextProvider>);
    for (const label of [enNavigation.items.kanban, enNavigation.items.worktrees, enNavigation.items.context, enNavigation.items.agentTools]) {
      expect(screen.getByRole('button', { name: label })).not.toBeNull();
    }
    expect(screen.getByRole('button', { name: enNavigation.actions.expandSidebar })).not.toBeNull();
  });

  it('marks settings as the current page without leaving a board item selected', () => {
    render(<I18nextProvider i18n={i18n}><Sidebar onSettingsClick={vi.fn()} onNewTaskClick={vi.fn()} isSettingsActive /></I18nextProvider>);
    expect(screen.getByRole('button', { name: enNavigation.actions.settings }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: enNavigation.items.kanban }).getAttribute('aria-current')).toBeNull();
  });

  it('keeps the source and license notice available in the application information dialog', () => {
    render(<I18nextProvider i18n={i18n}><Sidebar onSettingsClick={vi.fn()} onNewTaskClick={vi.fn()} /></I18nextProvider>);
    fireEvent.click(screen.getByRole('button', { name: enNavigation.tooltips.help }));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Forge' })).toBeDefined();
    expect(screen.getByText(/Aperant v2\.8\.0-beta\.6/)).toBeDefined();
    expect(screen.getByText(/AGPL-3\.0/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: enCommon.buttons.close }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
