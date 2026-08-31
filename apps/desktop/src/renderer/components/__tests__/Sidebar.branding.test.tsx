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

const sidebarState = vi.hoisted(() => ({ collapsed: false }));

vi.mock('../../stores/project-store', () => ({
  useProjectStore: (selector: (state: object) => unknown) => selector({ projects: [], selectedProjectId: null }),
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
  await i18n.use(initReactI18next).init({
    lng: 'en', fallbackLng: 'en',
    resources: { en: { navigation: enNavigation, dialogs: enDialogs, common: enCommon, welcome: enWelcome, uiShell: enShell } },
    interpolation: { escapeValue: false }, react: { useSuspense: false },
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
