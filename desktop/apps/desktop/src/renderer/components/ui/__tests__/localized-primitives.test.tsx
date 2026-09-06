/** @vitest-environment jsdom */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import english from '../../../../shared/i18n/locales/en/uiShellShared.json';
import chinese from '../../../../shared/i18n/locales/zh-CN/uiShellShared.json';
import { Combobox } from '../combobox';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog';
import { FullScreenDialog, FullScreenDialogContent, FullScreenDialogDescription, FullScreenDialogTitle } from '../full-screen-dialog';
import { ErrorBoundary } from '../error-boundary';
import { ToastProvider, Toast, ToastClose, ToastTitle, ToastViewport } from '../toast';

vi.mock('../../../lib/sentry', () => ({ captureException: vi.fn() }));

const i18n = createInstance();
await i18n.use(initReactI18next).init({
  lng: 'zh-CN',
  fallbackLng: 'en',
  resources: { en: { uiShellShared: english }, 'zh-CN': { uiShellShared: chinese } },
  interpolation: { escapeValue: false },
  react: { useSuspense: false }
});

function localized(children: React.ReactNode) {
  return render(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>);
}

beforeEach(async () => {
  cleanup();
  await i18n.changeLanguage('zh-CN');
});

describe('localized UI primitives', () => {
  it('translates combobox defaults and updates them on language change', async () => {
    localized(<Combobox value="" options={[]} onValueChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('请选择…');
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', '搜索…');
    expect(screen.getByText('未找到结果')).toBeInTheDocument();
    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', 'Search...');
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('preserves caller-supplied combobox labels', () => {
    localized(<Combobox value="" options={[]} onValueChange={vi.fn()} placeholder="My project" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('My project');
  });

  it('updates dialog close accessible name while open', async () => {
    localized(<Dialog open><DialogContent><DialogTitle>Title</DialogTitle><DialogDescription>Description</DialogDescription></DialogContent></Dialog>);
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument();
    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('translates full-screen dialog close accessible name', () => {
    localized(<FullScreenDialog open><FullScreenDialogContent><FullScreenDialogTitle>Title</FullScreenDialogTitle><FullScreenDialogDescription>Description</FullScreenDialogDescription></FullScreenDialogContent></FullScreenDialog>);
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument();
  });

  it('translates toast notifications and close accessible names', () => {
    localized(<ToastProvider><Toast open><ToastTitle>Fixture</ToastTitle><ToastClose /></Toast><ToastViewport /></ToastProvider>);
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument();
    expect(screen.getByRole('region')).toHaveAttribute('aria-label', '通知（F8）');
  });

  it('translates a real render-error fallback and its retry action', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => { /* Expected fixture failure is asserted below. */ });
    const BrokenContent = () => { throw new Error('fixture render failure'); };
    try {
      localized(<ErrorBoundary><BrokenContent /></ErrorBoundary>);
      expect(screen.getByText('出现了问题')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
      await act(() => i18n.changeLanguage('en'));
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    } finally {
      errorLog.mockRestore();
    }
  });
});
