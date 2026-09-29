/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { createInstance, type i18n } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../shared/i18n/locales/en/uiProjectSettings.json';
import zh from '../../../shared/i18n/locales/zh-CN/uiProjectSettings.json';
import { AutoBuildIntegration } from './AutoBuildIntegration';
import { ConnectionStatus } from './ConnectionStatus';
import { PasswordInput } from './PasswordInput';

let language: i18n;
beforeEach(async () => {
  language = createInstance();
  await language.use(initReactI18next).init({
    lng: 'zh-CN',
    fallbackLng: 'en',
    resources: { en: { uiProjectSettings: en }, 'zh-CN': { uiProjectSettings: zh } },
    interpolation: { escapeValue: false },
    react: { useSuspense: false }
  });
});
afterEach(cleanup);

describe('Project settings localization', () => {
  it('updates the visible initialization action when language changes', async () => {
    const onInitialize = vi.fn();
    render(<I18nextProvider i18n={language}><AutoBuildIntegration autoBuildPath={null} versionInfo={null} isCheckingVersion={false} isUpdating={false} onInitialize={onInitialize} onUpdate={vi.fn()} /></I18nextProvider>);
    fireEvent.click(screen.getByRole('button', { name: '初始化自动构建' }));
    expect(onInitialize).toHaveBeenCalledOnce();
    await act(async () => { await language.changeLanguage('en'); });
    expect(screen.getByRole('button', { name: 'Initialize Auto-Build' })).toBeInTheDocument();
    expect(screen.queryByText('尚未初始化')).not.toBeInTheDocument();
  });

  it('localizes password visibility labels without altering the secret', async () => {
    render(<I18nextProvider i18n={language}><PasswordInput value="test-secret" onChange={vi.fn()} /></I18nextProvider>);
    fireEvent.click(screen.getByRole('button', { name: '显示密码' }));
    expect(screen.getByDisplayValue('test-secret')).toHaveAttribute('type', 'text');
    await act(async () => { await language.changeLanguage('en'); });
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByDisplayValue('test-secret')).toHaveAttribute('type', 'password');
  });

  it('translates pending connection feedback and preserves actual service messages', async () => {
    render(<I18nextProvider i18n={language}><ConnectionStatus isChecking isConnected={false} title="Linear" /></I18nextProvider>);
    expect(screen.getByText('正在检查…')).toBeInTheDocument();
    await act(async () => { await language.changeLanguage('en'); });
    expect(screen.getByText('Checking...')).toBeInTheDocument();
  });
});
