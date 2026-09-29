/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enTasks from '../../shared/i18n/locales/en/tasks.json';
import enCommon from '../../shared/i18n/locales/en/common.json';
import zhTasks from '../../shared/i18n/locales/zh-CN/tasks.json';
import zhCommon from '../../shared/i18n/locales/zh-CN/common.json';
import type { ScreenshotSource } from '../../shared/types/screenshot';
import { ScreenshotCapture } from './ScreenshotCapture';

const getSources = vi.fn();
const source: ScreenshotSource = { id: 'screen:fixture', name: 'Screen fixture', thumbnail: '' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function mount(language: 'en' | 'zh-CN') {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    fallbackLng: 'en',
    defaultNS: 'tasks',
    resources: {
      en: { tasks: enTasks, common: enCommon },
      'zh-CN': { tasks: zhTasks, common: zhCommon },
    },
    interpolation: { escapeValue: false },
  });
  const onOpenChange = vi.fn();
  const onCapture = vi.fn();
  render(<I18nextProvider i18n={i18n}><ScreenshotCapture open onOpenChange={onOpenChange} onCapture={onCapture} /></I18nextProvider>);
  return { i18n, onOpenChange, onCapture };
}

beforeEach(() => {
  getSources.mockReset();
  window.electronAPI.getSources = getSources;
});
afterEach(cleanup);

describe('Screenshot source retry accessibility', () => {
  it.each([
    { language: 'en', rejected: false, retryLabel: 'Retry' },
    { language: 'en', rejected: true, retryLabel: 'Retry' },
    { language: 'zh-CN', rejected: false, retryLabel: '重试' },
    { language: 'zh-CN', rejected: true, retryLabel: '重试' },
  ] as const)('exposes a named retry in $language after source lookup rejection: $rejected', async ({ language, rejected, retryLabel }) => {
    const failureMessage = 'Screen source permission is unavailable';
    const retry = deferred<{ success: true; data: ScreenshotSource[] }>();
    if (rejected) getSources.mockRejectedValueOnce(new Error(failureMessage));
    else getSources.mockResolvedValueOnce({ success: false, error: failureMessage });
    getSources.mockReturnValueOnce(retry.promise);
    const { i18n, onOpenChange, onCapture } = await mount(language);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(failureMessage);
    const retryButton = within(alert).getByRole('button', { name: retryLabel });
    expect(retryButton).toHaveAttribute('aria-label', retryLabel);
    expect(retryButton).toHaveAttribute('title', retryLabel);
    expect(retryButton).toBeEnabled();
    expect(screen.getByRole('button', { name: i18n.t('tasks:screenshot.capture') })).toBeDisabled();
    expect(getSources).toHaveBeenCalledTimes(1);

    fireEvent.click(retryButton);
    expect(getSources).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTitle(i18n.t('common:buttons.refresh'))).toBeDisabled();
    expect(screen.getByRole('button', { name: i18n.t('tasks:screenshot.capture') })).toBeDisabled();
    await act(async () => retry.resolve({ success: true, data: [source] }));

    fireEvent.click(await screen.findByRole('button', { name: source.name }));
    expect(screen.getByRole('button', { name: i18n.t('tasks:screenshot.capture') })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: retryLabel })).not.toBeInTheDocument();
    expect(getSources).toHaveBeenCalledTimes(2);
    expect(onCapture).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
