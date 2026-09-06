/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import enWelcome from '../../../shared/i18n/locales/en/welcome.json';
import zhWelcome from '../../../shared/i18n/locales/zh-CN/welcome.json';
import enDialogs from '../../../shared/i18n/locales/en/dialogs.json';
import enShell from '../../../shared/i18n/locales/en/uiShell.json';
import zhShell from '../../../shared/i18n/locales/zh-CN/uiShell.json';
import { AddProjectModal } from '../AddProjectModal';
import { WelcomeScreen } from '../WelcomeScreen';

vi.mock('../../stores/project-store', () => ({ addProject: vi.fn() }));

async function createLocale(language: string) {
  const locale = createInstance();
  await locale.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    resources: {
      en: { welcome: enWelcome, dialogs: enDialogs, uiShell: enShell },
      'zh-CN': { welcome: zhWelcome, uiShell: zhShell }
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false }
  });
  return locale;
}

afterEach(cleanup);

describe('desktop shell localization', () => {
  it('switches welcome actions and empty state without remounting', async () => {
    const locale = await createLocale('en');
    const onOpenProject = vi.fn();
    render(
      <I18nextProvider i18n={locale}>
        <WelcomeScreen projects={[]} onNewProject={vi.fn()} onOpenProject={onOpenProject} onSelectProject={vi.fn()} />
      </I18nextProvider>
    );
    expect(screen.getByRole('button', { name: enWelcome.actions.openProject })).toBeInTheDocument();
    await locale.changeLanguage('zh-CN');
    await waitFor(() => expect(screen.getByText(zhWelcome.recentProjects.empty)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: zhWelcome.actions.openProject }));
    expect(onOpenProject).toHaveBeenCalledOnce();
    expect(screen.queryByText(enWelcome.recentProjects.empty)).not.toBeInTheDocument();
  });

  it('localizes project creation fallback while leaving user input untouched', async () => {
    const locale = await createLocale('zh-CN');
    Object.assign(window.electronAPI, {
      getDefaultProjectLocation: vi.fn().mockResolvedValue('/preview/projects'),
      createProjectFolder: vi.fn().mockResolvedValue({ success: false })
    });
    render(<I18nextProvider i18n={locale}><AddProjectModal open onOpenChange={vi.fn()} /></I18nextProvider>);
    fireEvent.click(screen.getByRole('button', { name: enDialogs.addProject.createNewAriaLabel }));
    const projectName = screen.getByLabelText(enDialogs.addProject.projectName);
    fireEvent.change(projectName, { target: { value: 'My App 中文' } });
    await waitFor(() => expect(screen.getByLabelText(enDialogs.addProject.location)).toHaveValue('/preview/projects'));
    fireEvent.click(screen.getByRole('button', { name: enDialogs.addProject.createProject }));
    expect(await screen.findByRole('alert')).toHaveTextContent(zhShell.project.createFolderFailed);
    expect(projectName).toHaveValue('My App 中文');
    expect(window.electronAPI.createProjectFolder).toHaveBeenCalledWith('/preview/projects', 'My App 中文', true);
  });
});
