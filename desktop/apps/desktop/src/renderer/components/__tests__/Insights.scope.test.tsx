/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InsightsSession, InsightsStreamChunk } from '../../../shared/types';
import { Insights } from '../Insights';
import { TooltipProvider } from '../ui/tooltip';
import { useInsightsStore } from '../../stores/insights-store';

const session = (projectId: string): InsightsSession => ({
  id: `${projectId}-session`, projectId, messages: [], createdAt: new Date(), updatedAt: new Date()
});
let stream: (projectId: string, chunk: InsightsStreamChunk) => void;
const unsubscribes = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
const api = {
  getInsightsSession: vi.fn(), listInsightsSessions: vi.fn(), newInsightsSession: vi.fn(),
  sendInsightsMessage: vi.fn(),
  onInsightsStreamChunk: vi.fn((callback: typeof stream) => { stream = callback; return unsubscribes[0]; }),
  onInsightsStatus: vi.fn(() => unsubscribes[1]),
  onInsightsError: vi.fn(() => unsubscribes[2]),
  onInsightsSessionUpdated: vi.fn(() => unsubscribes[3])
};
let previousAPI: typeof window.electronAPI;

beforeEach(() => {
  previousAPI = window.electronAPI;
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: api });
  Object.values(api).forEach((mock) => mock.mockReset());
  unsubscribes.forEach((mock) => mock.mockReset());
  api.onInsightsStreamChunk.mockImplementation((callback) => { stream = callback; return unsubscribes[0]; });
  api.onInsightsStatus.mockReturnValue(unsubscribes[1]);
  api.onInsightsError.mockReturnValue(unsubscribes[2]);
  api.onInsightsSessionUpdated.mockReturnValue(unsubscribes[3]);
  api.listInsightsSessions.mockResolvedValue({ success: true, data: [] });
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
});
afterEach(() => {
  cleanup();
  useInsightsStore.getState().clearSession();
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: previousAPI });
  vi.unstubAllGlobals();
});

describe('Insights project navigation UX', () => {
  it('clears the composer and blocks sends until the selected project session is loaded', async () => {
    let resolveB!: (result: { success: boolean; data: InsightsSession }) => void;
    api.getInsightsSession.mockResolvedValueOnce({ success: true, data: session('A') })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveB = resolve; }));
    const view = render(<Insights projectId="A" />, { wrapper: TooltipProvider });
    const composer = screen.getByRole('textbox') as HTMLTextAreaElement;
    await waitFor(() => expect(composer.disabled).toBe(false));
    fireEvent.change(composer, { target: { value: 'Private A draft' } });
    view.rerender(<Insights projectId="B" />);
    expect(composer.value).toBe('');
    expect(composer.disabled).toBe(true);
    act(() => stream('A', { type: 'text', content: 'Private A response', sessionId: 'A-session' }));
    expect(screen.queryByText('Private A response')).toBeNull();
    await act(async () => resolveB({ success: true, data: session('B') }));
    await waitFor(() => expect(composer.disabled).toBe(false));
    fireEvent.change(composer, { target: { value: 'Explain B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(api.sendInsightsMessage).toHaveBeenCalledWith('B', 'Explain B', expect.any(Object), undefined));
    expect(api.sendInsightsMessage).toHaveBeenCalledTimes(1);
    expect(useInsightsStore.getState().session?.projectId).toBe('B');
    expect(useInsightsStore.getState().session?.messages[0].content).toBe('Explain B');
  });

  it('keeps the input and displays a first-session failure instead of silently discarding it', async () => {
    api.getInsightsSession.mockResolvedValueOnce({ success: true, data: null });
    api.newInsightsSession.mockRejectedValueOnce(new Error('Session storage unavailable'));
    render(<Insights projectId="empty" />, { wrapper: TooltipProvider });
    const composer = screen.getByRole('textbox') as HTMLTextAreaElement;
    await waitFor(() => expect(composer.disabled).toBe(false));
    fireEvent.change(composer, { target: { value: 'Keep this request' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Session storage unavailable'));
    expect(composer.value).toBe('Keep this request');
    expect(api.sendInsightsMessage).not.toHaveBeenCalled();
  });

  it('unsubscribes all project listeners when the page is left', () => {
    api.getInsightsSession.mockResolvedValue({ success: true, data: session('A') });
    const view = render(<Insights projectId="A" />, { wrapper: TooltipProvider });
    view.unmount();
    unsubscribes.forEach((unsubscribe) => expect(unsubscribe).toHaveBeenCalledTimes(1));
    expect(useInsightsStore.getState().projectId).toBeNull();
  });
});
