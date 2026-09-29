/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../shared/i18n';
import { GitHubOAuthFlow } from './GitHubOAuthFlow';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('../../hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

type AuthResult = Awaited<ReturnType<typeof window.electronAPI.startGitHubAuth>>;
type DeviceEvent = Parameters<Parameters<typeof window.electronAPI.onGitHubAuthDeviceCode>[0]>[0];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

let deviceListener: ((data: DeviceEvent) => void) | null;
let authAttempts: ReturnType<typeof deferred<AuthResult>>[];
let writeText: ReturnType<typeof vi.fn>;
let originalClipboard: PropertyDescriptor | undefined;
const authUrl = 'https://github.com/login/device';

beforeEach(() => {
  toast.mockClear();
  deviceListener = null;
  authAttempts = [];
  writeText = vi.fn().mockResolvedValue(undefined);
  originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  Object.assign(window.electronAPI, {
    checkGitHubCli: vi.fn().mockResolvedValue({ success: true, data: { installed: true } }),
    checkGitHubAuth: vi.fn().mockResolvedValue({ success: true, data: { authenticated: false } }),
    startGitHubAuth: vi.fn(() => {
      const request = deferred<AuthResult>();
      authAttempts.push(request);
      return request.promise;
    }),
    onGitHubAuthDeviceCode: vi.fn((listener: (data: DeviceEvent) => void) => {
      deviceListener = listener;
      return () => { if (deviceListener === listener) deviceListener = null; };
    })
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

function emitCode(code = 'ABCD-1234') {
  act(() => { deviceListener?.({ deviceCode: code, authUrl, browserOpened: false }); });
}

async function startFlow(language = 'en') {
  await i18n.changeLanguage(language);
  const view = render(<GitHubOAuthFlow onSuccess={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: language === 'en' ? 'Authenticate with GitHub' : '登录 GitHub' }));
  emitCode();
  return view;
}

async function showFallback() {
  await startFlow();
  await act(async () => {
    authAttempts[0].resolve({ success: false, error: 'Browser unavailable', data: { success: false, fallbackUrl: authUrl } });
  });
}

async function settleCopy(request: ReturnType<typeof deferred<void>>, result: 'success' | 'failure') {
  await act(async () => {
    if (result === 'success') request.resolve(undefined);
    else request.reject(new Error('Clipboard rejected with private details'));
  });
}

describe('GitHub authorization clipboard feedback', () => {
  it.each([
    ['code', 'Copy one-time code', 'ABCD-1234', 'One-time code copied'],
    ['url', 'Copy authentication URL', authUrl, 'Authentication URL copied']
  ] as const)('awaits %s copies, prevents repeat clicks and resets successful feedback', async (target, name, value, title) => {
    if (target === 'code') await startFlow();
    else await showFallback();
    const request = deferred<void>();
    writeText.mockReturnValue(request.promise);
    vi.useFakeTimers();
    const button = screen.getByRole('button', { name });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(value);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Copying…');
    expect(toast).not.toHaveBeenCalled();
    await settleCopy(request, 'success');
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Copied');
    expect(toast).toHaveBeenCalledExactlyOnceWith({ title });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(button).toHaveTextContent('Copy');
    expect(button).not.toHaveTextContent('Copied');
  });

  it.each(['code', 'url'] as const)('reports %s rejection safely and allows another attempt', async (target) => {
    if (target === 'code') await startFlow();
    else await showFallback();
    const request = deferred<void>();
    writeText.mockReturnValueOnce(request.promise);
    const button = screen.getByRole('button', { name: target === 'code' ? 'Copy one-time code' : 'Copy authentication URL' });
    fireEvent.click(button);
    await settleCopy(request, 'failure');
    expect(button).toBeEnabled();
    expect(button).not.toHaveTextContent('Copied');
    expect(toast).toHaveBeenCalledExactlyOnceWith({
      variant: 'destructive', title: 'Could not copy', description: 'Copy the displayed text manually, or try again.'
    });
    await act(async () => { fireEvent.click(button); });
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(button).toHaveTextContent('Copied');
  });

  it.each(['success', 'failure'] as const)('ignores old device-code %s when a new code arrives', async (result) => {
    await startFlow();
    const oldCopy = deferred<void>();
    writeText.mockReturnValueOnce(oldCopy.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Copy one-time code' }));
    emitCode('EFGH-5678');
    const newButton = screen.getByRole('button', { name: 'Copy one-time code' });
    expect(newButton).toBeDisabled();
    fireEvent.click(newButton);
    expect(writeText).toHaveBeenCalledTimes(1);
    await settleCopy(oldCopy, result);
    expect(newButton).toBeEnabled();
    expect(newButton).not.toHaveTextContent('Copied');
    expect(toast).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(newButton); });
    expect(writeText).toHaveBeenLastCalledWith('EFGH-5678');
    expect(newButton).toHaveTextContent('Copied');
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'failure'] as const)('ignores device-copy %s after authentication enters an error view', async (result) => {
    await startFlow();
    const request = deferred<void>();
    writeText.mockReturnValue(request.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Copy one-time code' }));
    await act(async () => {
      authAttempts[0].resolve({ success: false, error: 'Browser unavailable', data: { success: false, fallbackUrl: authUrl } });
    });
    expect(screen.getByRole('button', { name: 'Copy authentication URL' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy authentication URL' }));
    expect(writeText).toHaveBeenCalledTimes(1);
    await settleCopy(request, result);
    const urlButton = screen.getByRole('button', { name: 'Copy authentication URL' });
    expect(urlButton).toBeEnabled();
    expect(urlButton).not.toHaveTextContent('Copied');
    expect(toast).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'] as const)('ignores old URL-copy %s after retry returns the same URL', async (result) => {
    await showFallback();
    const request = deferred<void>();
    writeText.mockReturnValue(request.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Copy authentication URL' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    emitCode();
    await act(async () => {
      authAttempts[1].resolve({ success: false, error: 'Browser unavailable again', data: { success: false, fallbackUrl: authUrl } });
    });
    expect(screen.getByRole('button', { name: 'Copy authentication URL' })).toBeDisabled();
    await settleCopy(request, result);
    const button = screen.getByRole('button', { name: 'Copy authentication URL' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveTextContent('Copied');
    expect(toast).not.toHaveBeenCalled();
  });

  it.each([
    ['code', 'success'], ['code', 'failure'], ['url', 'success'], ['url', 'failure']
  ] as const)('ignores %s-copy %s after unmount without creating feedback timers', async (target, result) => {
    const view = target === 'code' ? await startFlow() : undefined;
    if (target === 'url') await showFallback();
    const request = deferred<void>();
    writeText.mockReturnValue(request.promise);
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: target === 'code' ? 'Copy one-time code' : 'Copy authentication URL' }));
    if (view) view.unmount();
    else cleanup();
    expect(vi.getTimerCount()).toBe(0);
    await settleCopy(request, result);
    expect(vi.getTimerCount()).toBe(0);
    expect(toast).not.toHaveBeenCalled();
  });

  it('localizes copying, failure and success in Chinese', async () => {
    await startFlow('zh-CN');
    const request = deferred<void>();
    writeText.mockReturnValueOnce(request.promise);
    const button = screen.getByRole('button', { name: '复制一次性验证码' });
    fireEvent.click(button);
    expect(button).toHaveTextContent('正在复制…');
    await settleCopy(request, 'failure');
    expect(toast).toHaveBeenLastCalledWith({ variant: 'destructive', title: '复制失败', description: '请手动复制显示的文本，或重试。' });
    await act(async () => { fireEvent.click(button); });
    expect(button).toHaveTextContent('已复制');
    expect(toast).toHaveBeenLastCalledWith({ title: '已复制一次性验证码' });
  });
});
