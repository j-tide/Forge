/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import enWelcome from '../../../shared/i18n/locales/en/welcome.json';
import enCommon from '../../../shared/i18n/locales/en/common.json';
import enDialogs from '../../../shared/i18n/locales/en/dialogs.json';
import type { Project } from '../../../shared/types';
import { WelcomeScreen } from '../WelcomeScreen';

const i18n = createInstance();
beforeEach(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { welcome: enWelcome, common: enCommon, dialogs: enDialogs } }, interpolation: { escapeValue: false }, react: { useSuspense: false } });
});
afterEach(cleanup);

function project(id: string, updatedAt: Date): Project {
  return { id, name: `Project ${id}`, path: `/projects/${id}`, autoBuildPath: '', createdAt: updatedAt, updatedAt, settings: { model: 'test-model', memoryBackend: 'file', linearSync: false, notifications: { onTaskComplete: false, onTaskFailed: false, onReviewNeeded: false, sound: false } } };
}

function show(projects: Project[] = []) {
  const callbacks = { onNewProject: vi.fn(), onOpenProject: vi.fn(), onSelectProject: vi.fn() };
  render(<I18nextProvider i18n={i18n}><WelcomeScreen projects={projects} {...callbacks} /></I18nextProvider>);
  return callbacks;
}

describe('Welcome project entry', () => {
  it('presents one open-project action before the secondary create action', () => {
    const callbacks = show();
    const open = screen.getByRole('button', { name: enWelcome.actions.openProject });
    const create = screen.getByRole('button', { name: enWelcome.actions.newProject });
    expect(open.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(open);
    fireEvent.click(create);
    expect(callbacks.onOpenProject).toHaveBeenCalledOnce();
    expect(callbacks.onNewProject).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: enWelcome.recentProjects.empty })).not.toBeNull();
    expect(document.querySelector('.forge-glass-welcome')?.getAttribute('data-empty')).toBe('true');
  });

  it('renders saved projects in recency order with their real paths and selected IDs', () => {
    const callbacks = show([project('old', new Date('2026-01-01')), project('recent', new Date('2026-09-25'))]);
    const rows = screen.getAllByRole('button', { name: /Open project Project/ });
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining('Project recent'), expect.stringContaining('Project old')]);
    expect(screen.getByText('/projects/recent')).not.toBeNull();
    fireEvent.click(rows[0]);
    expect(callbacks.onSelectProject).toHaveBeenCalledWith('recent');
    expect(screen.getByRole('heading', { name: enWelcome.hero.returningTitle })).not.toBeNull();
  });

  it('shows only the ten most recently used projects without changing the supplied array', () => {
    const projects = Array.from({ length: 12 }, (_, index) => project(String(index), new Date(2026, 0, index + 1)));
    const originalOrder = projects.map((item) => item.id);
    show(projects);
    expect(screen.getAllByRole('button', { name: /Open project Project/ })).toHaveLength(10);
    expect(screen.queryByRole('button', { name: 'Open project Project 0' })).toBeNull();
    expect(projects.map((item) => item.id)).toEqual(originalOrder);
  });
});
