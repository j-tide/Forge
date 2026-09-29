/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '../../shared/i18n/locales/en/uiShellAuth.json';
import zhCN from '../../shared/i18n/locales/zh-CN/uiShellAuth.json';
import { AuthFailureModal } from './AuthFailureModal';

const store = vi.hoisted(() => ({
  isModalOpen: true,
  authFailureInfo: {
    failureType: 'expired',
    profileName: 'Work Account',
    taskId: 'task-42',
    originalError: 'Provider 401',
  },
  hideAuthFailureModal: vi.fn(),
  clearAuthFailure: vi.fn(),
}));

vi.mock('../stores/auth-failure-store', () => ({
  useAuthFailureStore: () => store,
}));

async function mount(language: string) {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    fallbackLng: 'en',
    defaultNS: 'common',
    resources: {
      en: { uiShellAuth: en, common: { labels: { dismiss: 'Dismiss' } } },
      'zh-CN': { uiShellAuth: zhCN, common: { labels: { dismiss: '关闭' } } },
    },
    interpolation: { escapeValue: false },
  });
  const onOpenSettings = vi.fn();
  render(<I18nextProvider i18n={i18n}><AuthFailureModal onOpenSettings={onOpenSettings} /></I18nextProvider>);
  return { i18n, onOpenSettings };
}

describe('authentication dialog localization', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows Chinese authentication guidance without changing account or provider error text', async () => {
    const { onOpenSettings } = await mount('zh-CN');
    expect(screen.getByRole('heading', { name: '需要登录' })).toBeInTheDocument();
    expect(screen.getByText('你的认证令牌已过期。')).toBeInTheDocument();
    expect(screen.getByText(/Work Account/)).toBeInTheDocument();
    expect(screen.getByText('Provider 401')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '打开设置' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(store.hideAuthFailureModal).toHaveBeenCalledOnce();
  });

  it('updates an open dialog after changing the language', async () => {
    const { i18n } = await mount('en');
    expect(screen.getByRole('heading', { name: 'Authentication required' })).toBeInTheDocument();
    await act(() => i18n.changeLanguage('zh-CN'));
    expect(screen.getByRole('heading', { name: '需要登录' })).toBeInTheDocument();
    expect(screen.queryByText('Your authentication token has expired.')).not.toBeInTheDocument();
    expect(screen.getByText(/Work Account/)).toBeInTheDocument();
  });
});
