/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InsightsSession, InsightsStreamChunk } from '../../../shared/types';
import knowledgeContext from '../../../shared/i18n/locales/en/uiKnowledgeContext.json';
import { Insights } from '../Insights';
import { TooltipProvider } from '../ui/tooltip';
import { useInsightsStore } from '../../stores/insights-store';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('../../hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const session = (projectId: string): InsightsSession => ({
  id: `${projectId}-session`, projectId, messages: [], createdAt: new Date(), updatedAt: new Date()
});
let stream: (projectId: string, chunk: InsightsStreamChunk) => void;
const unsubscribes = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
const api = {
  getInsightsSession: vi.fn(), listInsightsSessions: vi.fn(), newInsightsSession: vi.fn(),
  getInsightsActiveRequest: vi.fn(),
  sendInsightsMessage: vi.fn(),
  deleteInsightsSessions: vi.fn(), archiveInsightsSessions: vi.fn(),
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
  toast.mockReset();
  unsubscribes.forEach((mock) => mock.mockReset());
  api.onInsightsStreamChunk.mockImplementation((callback) => { stream = callback; return unsubscribes[0]; });
  api.onInsightsStatus.mockReturnValue(unsubscribes[1]);
  api.onInsightsError.mockReturnValue(unsubscribes[2]);
  api.onInsightsSessionUpdated.mockReturnValue(unsubscribes[3]);
  api.listInsightsSessions.mockResolvedValue({ success: true, data: [] });
  api.getInsightsActiveRequest.mockResolvedValue({ success: true, data: null });
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
});

describe('Insights bulk conversation failures', () => {
  const summaries = ['first', 'second'].map(id => ({
    ...session('A'), id, title: id, messageCount: 0,
  }));
  const scenarios = [
    { method: 'deleteInsightsSessions' as const, toolbar: 'Delete Selected', confirm: 'Delete', failureTitle: 'Some conversations could not be deleted' },
    { method: 'archiveInsightsSessions' as const, toolbar: 'Archive Selected', confirm: 'Archive', failureTitle: 'Some conversations could not be archived' },
  ];

  async function selectBoth() {
    api.getInsightsSession.mockResolvedValue({ success: true, data: session('A') });
    api.listInsightsSessions.mockResolvedValue({ success: true, data: summaries });
    render(<Insights projectId="A" />, { wrapper: TooltipProvider });
    await screen.findByText('first');
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
  }

  it.each(scenarios)('keeps only failed $confirm conversations selected and retries those IDs', async ({ method, toolbar, confirm, failureTitle }) => {
    api[method].mockResolvedValueOnce({ success: true, data: { failedIds: ['second'] } })
      .mockResolvedValueOnce({ success: true, data: { failedIds: [] } });
    await selectBoth();
    fireEvent.click(screen.getByRole('button', { name: `${toolbar} (2)` }));
    fireEvent.click(screen.getByRole('button', { name: `${confirm} 2 Conversation(s)` }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({
      title: failureTitle,
      description: 'Completed 1; failed 1. Failed conversations remain selected for retry.',
      variant: 'destructive',
    }));
    expect(api[method]).toHaveBeenCalledWith('A', ['first', 'second']);
    await screen.findByRole('button', { name: `${toolbar} (1)` });
    expect(screen.getByRole('checkbox', { name: /second/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: /first/ })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('button', { name: `${toolbar} (1)` }));
    fireEvent.click(screen.getByRole('button', { name: `${confirm} 1 Conversation(s)` }));
    await waitFor(() => expect(api[method]).toHaveBeenLastCalledWith('A', ['second']));
    await waitFor(() => expect(screen.queryByRole('button', { name: `${toolbar} (1)` })).toBeNull());
  });

  it.each(scenarios)('shows $confirm transport failure and keeps every conversation selected', async ({ method, toolbar, confirm, failureTitle }) => {
    api[method].mockRejectedValue(new Error('IPC unavailable'));
    await selectBoth();
    fireEvent.click(screen.getByRole('button', { name: `${toolbar} (2)` }));
    fireEvent.click(screen.getByRole('button', { name: `${confirm} 2 Conversation(s)` }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({
      title: failureTitle,
      description: 'Completed 0; failed 2. Failed conversations remain selected for retry.',
      variant: 'destructive',
    }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('button', { name: `${toolbar} (2)` })).toBeEnabled();
    expect(api[method]).toHaveBeenCalledTimes(1);
  });

  it('does not clear selection or allow another confirmation while a bulk request is pending', async () => {
    let resolve!: (response: { success: boolean; data: { failedIds: string[] } }) => void;
    api.deleteInsightsSessions.mockImplementation(() => new Promise(done => { resolve = done; }));
    await selectBoth();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Selected (2)' }));
    const confirm = screen.getByRole('button', { name: 'Delete 2 Conversation(s)' });
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(confirm);
    expect(api.deleteInsightsSessions).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ success: true, data: { failedIds: ['first'] } }));
    await screen.findByRole('button', { name: 'Delete Selected (1)' });
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
    api.sendInsightsMessage.mockImplementation(async (projectId, message, _modelConfig, _images, request) => {
      api.getInsightsSession.mockResolvedValue({ success: true, data: {
        ...session(projectId), messages: [{ id: 'persisted-user-B', role: 'user', content: message, timestamp: new Date() }],
      } });
      return { success: true, data: { ...request, outcome: 'complete' } };
    });
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
    await waitFor(() => expect(api.sendInsightsMessage).toHaveBeenCalledWith('B', 'Explain B', expect.any(Object), undefined, {
      sessionId: 'B-session', requestId: expect.any(String),
    }));
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
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(knowledgeContext.generationErrors['persistence-failed']));
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
