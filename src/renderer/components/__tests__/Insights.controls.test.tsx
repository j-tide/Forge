/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  InsightsCancellationResult, InsightsChatMessage, InsightsGenerationResult,
  InsightsIPCResult, InsightsSession, InsightsStreamChunk
} from '../../../shared/types';
import i18n from '../../../shared/i18n';
import english from '../../../shared/i18n/locales/en/uiKnowledgeContext.json';
import chinese from '../../../shared/i18n/locales/zh-CN/uiKnowledgeContext.json';
import englishCommon from '../../../shared/i18n/locales/en/common.json';
import chineseCommon from '../../../shared/i18n/locales/zh-CN/common.json';
import { Insights } from '../Insights';
import { TooltipProvider } from '../ui/tooltip';
import { useInsightsStore } from '../../stores/insights-store';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('../../hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const message = (id: string, role: InsightsChatMessage['role'], content: string): InsightsChatMessage => ({
  id, role, content, timestamp: new Date('2026-09-28T00:00:00Z')
});
const conversation = (messages: InsightsChatMessage[] = []): InsightsSession => ({
  id: 'A-session', projectId: 'A', messages,
  createdAt: new Date('2026-09-28T00:00:00Z'), updatedAt: new Date('2026-09-28T00:00:00Z')
});

let persistedSession: InsightsSession;
let stream: (projectId: string, chunk: InsightsStreamChunk) => void;
const unsubscribes = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
const api = {
  getInsightsSession: vi.fn(), listInsightsSessions: vi.fn(), getInsightsActiveRequest: vi.fn(),
  sendInsightsMessage: vi.fn(), regenerateInsightsMessage: vi.fn(), cancelInsightsMessage: vi.fn(),
  createTaskFromInsights: vi.fn(),
  onInsightsStreamChunk: vi.fn((callback: typeof stream) => { stream = callback; return unsubscribes[0]; }),
  onInsightsStatus: vi.fn(() => unsubscribes[1]),
  onInsightsError: vi.fn(() => unsubscribes[2]),
  onInsightsSessionUpdated: vi.fn(() => unsubscribes[3])
};
const clipboardWrite = vi.fn();
let previousAPI: typeof window.electronAPI;
let previousClipboard: PropertyDescriptor | undefined;

beforeEach(() => {
  previousAPI = window.electronAPI;
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: api });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboardWrite } });
  Object.values(api).forEach((mock) => mock.mockReset());
  toast.mockReset();
  clipboardWrite.mockReset().mockResolvedValue(undefined);
  unsubscribes.forEach((mock) => mock.mockReset());
  api.onInsightsStreamChunk.mockImplementation((callback) => { stream = callback; return unsubscribes[0]; });
  api.onInsightsStatus.mockReturnValue(unsubscribes[1]);
  api.onInsightsError.mockReturnValue(unsubscribes[2]);
  api.onInsightsSessionUpdated.mockReturnValue(unsubscribes[3]);
  api.getInsightsSession.mockImplementation(async () => ({ success: true, data: persistedSession }));
  api.listInsightsSessions.mockResolvedValue({ success: true, data: [] });
  api.getInsightsActiveRequest.mockResolvedValue({ success: true, data: null });
  persistedSession = conversation();
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
  if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
  vi.unstubAllGlobals();
});

async function openConversation(messages: InsightsChatMessage[], onOpenAccountSettings?: () => void) {
  persistedSession = conversation(messages);
  const view = render(<Insights projectId="A" onOpenAccountSettings={onOpenAccountSettings} />, { wrapper: TooltipProvider });
  await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled());
  return view;
}

describe('Insights reply controls', () => {
  it('copies the original Markdown content and confirms only that reply was copied', async () => {
    await openConversation([
      message('question', 'user', 'Explain the module'),
      message('first', 'assistant', '**First reply**'),
      message('second', 'assistant', 'Second reply')
    ]);
    fireEvent.click(screen.getAllByRole('button', { name: english.copyResponse })[0]);
    await screen.findByRole('button', { name: english.copiedResponse });
    expect(clipboardWrite).toHaveBeenCalledExactlyOnceWith('**First reply**');
    expect(screen.getAllByRole('button', { name: english.copyResponse })).toHaveLength(1);
    expect(api.regenerateInsightsMessage).not.toHaveBeenCalled();
  });

  it('keeps copy available and gives recovery guidance when browser clipboard access fails', async () => {
    clipboardWrite.mockRejectedValue(new Error('Clipboard permission denied'));
    await openConversation([message('answer', 'assistant', 'Keep this answer')]);
    fireEvent.click(screen.getByRole('button', { name: english.copyResponse }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith({
      title: english.copyFailed, description: english.copyFailedHint, variant: 'destructive'
    }));
    expect(screen.getByRole('button', { name: english.copyResponse })).toBeEnabled();
    expect(screen.queryByRole('button', { name: english.copiedResponse })).toBeNull();
    expect(screen.getByText('Keep this answer')).toBeInTheDocument();
  });

  it('regenerates only the latest reply and preserves it while pending and after failure', async () => {
    const pending = deferred<InsightsIPCResult<InsightsGenerationResult>>();
    api.regenerateInsightsMessage.mockReturnValue(pending.promise);
    await openConversation([
      message('question-1', 'user', 'First question'), message('answer-1', 'assistant', 'First answer'),
      message('question-2', 'user', 'Latest question'), message('answer-2', 'assistant', 'Original latest answer')
    ]);
    const regenerate = screen.getByRole('button', { name: english.regenerateResponse });
    expect(screen.getAllByRole('button', { name: english.regenerateResponse })).toHaveLength(1);
    fireEvent.click(regenerate);
    expect(api.regenerateInsightsMessage).toHaveBeenCalledExactlyOnceWith('A', {
      sessionId: 'A-session', requestId: expect.any(String), targetMessageId: 'answer-2', images: undefined
    }, expect.any(Object));
    expect(screen.getByText('Original latest answer')).toBeInTheDocument();
    expect(regenerate).toBeDisabled();
    expect(screen.getByRole('textbox')).toBeDisabled();
    await act(async () => pending.resolve({ success: false, code: 'request-failed', error: 'Provider response body with private details' }));
    await waitFor(() => expect(regenerate).toBeEnabled());
    expect(screen.getByText('Original latest answer')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(english.generationErrors['request-failed']);
    expect(screen.queryByText('Provider response body with private details')).toBeNull();
    expect(useInsightsStore.getState().session?.messages.filter((entry) => entry.role === 'user')).toHaveLength(2);
  });

  it('retries the latest unanswered user using its persisted ID without adding the user again', async () => {
    const question = message('unanswered', 'user', 'Retry this question');
    api.regenerateInsightsMessage.mockImplementation(async (_projectId, request) => {
      persistedSession = conversation([question, message('recovered-answer', 'assistant', 'Recovered answer')]);
      return { success: true, data: { sessionId: request.sessionId, requestId: request.requestId, outcome: 'complete' } };
    });
    await openConversation([question]);
    fireEvent.click(screen.getByRole('button', { name: english.retryResponse }));
    await screen.findByText('Recovered answer');
    expect(api.regenerateInsightsMessage).toHaveBeenCalledExactlyOnceWith('A', {
      sessionId: 'A-session', requestId: expect.any(String), targetMessageId: 'unanswered', images: undefined
    }, expect.any(Object));
    expect(api.sendInsightsMessage).not.toHaveBeenCalled();
    expect(screen.getAllByText('Retry this question')).toHaveLength(1);
    expect(useInsightsStore.getState().session?.messages.filter((entry) => entry.role === 'user')).toHaveLength(1);
  });

  it('keeps the composer locked until Stop is acknowledged and ignores late cancelled stream chunks', async () => {
    const generating = deferred<InsightsIPCResult<InsightsGenerationResult>>();
    const stopping = deferred<InsightsIPCResult<InsightsCancellationResult>>();
    api.sendInsightsMessage.mockImplementation((_projectId, content) => {
      persistedSession = conversation([message('persisted-question', 'user', content)]);
      return generating.promise;
    });
    api.cancelInsightsMessage.mockReturnValue(stopping.promise);
    await openConversation([]);
    const composer = screen.getByRole('textbox');
    fireEvent.change(composer, { target: { value: 'A running question' } });
    fireEvent.click(screen.getByRole('button', { name: english.send }));
    const request = api.sendInsightsMessage.mock.calls[0][4];
    act(() => stream('A', { ...request, type: 'text', content: 'Before stop' }));
    expect(screen.getByText('Before stop')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: english.stopResponse }));
    expect(api.cancelInsightsMessage).toHaveBeenCalledExactlyOnceWith('A', 'A-session', request.requestId);
    expect(screen.getByRole('button', { name: english.stoppingResponse })).toBeDisabled();
    expect(composer).toBeDisabled();
    act(() => stream('A', { ...request, type: 'text', content: 'Late cancelled content' }));
    expect(screen.queryByText(/Late cancelled content/)).toBeNull();
    await act(async () => stopping.resolve({ success: true, data: { ...request, cancelled: true } }));
    await waitFor(() => expect(composer).toBeEnabled());
    expect(screen.getByRole('status')).toHaveTextContent(english.responseStopped);
    act(() => stream('A', { ...request, type: 'text', content: 'Even later content' }));
    expect(screen.queryByText(/Even later content/)).toBeNull();
    await act(async () => generating.resolve({ success: true, data: { ...request, outcome: 'cancelled' } }));
    expect(useInsightsStore.getState().session?.messages).toEqual(persistedSession.messages);
  });

  it.each([
    { language: 'en', labels: english },
    { language: 'zh-CN', labels: chinese }
  ])('shows localized authentication guidance and opens account setup in $language', async ({ language, labels }) => {
    await i18n.changeLanguage(language);
    const openSettings = vi.fn();
    api.sendInsightsMessage.mockImplementation(async (_projectId, content) => {
      persistedSession = conversation([message('needs-auth', 'user', content)]);
      return { success: false, code: 'auth-required', error: 'Raw SDK credentials missing at private/path' };
    });
    await openConversation([], openSettings);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Explain the project' } });
    fireEvent.click(screen.getByRole('button', { name: labels.send }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(labels.generationErrors['auth-required']));
    fireEvent.click(screen.getByRole('button', { name: labels.configureAccount }));
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Raw SDK credentials missing at private/path')).toBeNull();
    expect(screen.getByRole('textbox')).toHaveValue('Explain the project');
    expect(screen.getByRole('button', { name: labels.retryResponse })).toBeEnabled();
  });

  it.each([
    { language: 'en', labels: english, common: englishCommon, failure: 'response' },
    { language: 'en', labels: english, common: englishCommon, failure: 'transport' },
    { language: 'zh-CN', labels: chinese, common: chineseCommon, failure: 'response' },
    { language: 'zh-CN', labels: chinese, common: chineseCommon, failure: 'transport' }
  ])('keeps suggested task creation retryable after $failure failure in $language', async ({ language, labels, common, failure }) => {
    await i18n.changeLanguage(language);
    const rawError = 'Private task executor details must not appear';
    if (failure === 'response') api.createTaskFromInsights.mockResolvedValue({ success: false, error: rawError });
    else api.createTaskFromInsights.mockRejectedValue(new Error(rawError));
    await openConversation([{
      ...message('task-suggestion', 'assistant', 'Suggested improvement'),
      suggestedTasks: [{ title: 'Add keyboard support', description: 'Support keyboard navigation in the dialog.' }]
    }]);
    const create = screen.getByRole('button', { name: common.insights.createTask });
    fireEvent.click(create);
    await waitFor(() => expect(toast).toHaveBeenCalledExactlyOnceWith({
      title: labels.createTaskFailed, description: labels.createTaskFailedHint, variant: 'destructive'
    }));
    expect(create).toBeEnabled();
    expect(api.createTaskFromInsights).toHaveBeenCalledExactlyOnceWith(
      'A', 'Add keyboard support', 'Support keyboard navigation in the dialog.', undefined,
      { sessionId: 'A-session', messageId: 'task-suggestion', suggestionIndex: 0 }
    );
    expect(screen.queryByText(rawError)).toBeNull();
    expect(screen.queryByRole('button', { name: common.insights.taskCreated })).toBeNull();
    fireEvent.click(create);
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
    expect(api.createTaskFromInsights).toHaveBeenCalledTimes(2);
    expect(create).toBeEnabled();
  });

  it('hydrates an already created suggestion as disabled after unmount and reload', async () => {
    const savedSuggestion = {
      ...message('saved-suggestion', 'assistant', 'An improvement was already created.'),
      suggestedTasks: [{
        title: 'Existing keyboard task', description: 'This task already exists.', createdTaskId: 'existing-task-id'
      }]
    };
    const firstView = await openConversation([savedSuggestion]);
    expect(screen.getByRole('button', { name: englishCommon.insights.taskCreated })).toBeDisabled();
    expect(screen.queryByRole('button', { name: englishCommon.insights.createTask })).toBeNull();
    firstView.unmount();
    await openConversation([savedSuggestion]);
    expect(api.getInsightsSession).toHaveBeenCalledTimes(2);
    const alreadyCreated = screen.getByRole('button', { name: englishCommon.insights.taskCreated });
    expect(alreadyCreated).toBeDisabled();
    fireEvent.click(alreadyCreated);
    expect(api.createTaskFromInsights).not.toHaveBeenCalled();
  });

  it('clears a matched Retry composer and attachments only after the successful terminal response', async () => {
    const pending = deferred<InsightsIPCResult<InsightsGenerationResult>>();
    api.regenerateInsightsMessage.mockReturnValue(pending.promise);
    const question = message('retry-pending-user', 'user', 'Retry this pending request');
    await openConversation([question]);
    const attachment = { id: 'original-image', filename: 'original.png', mimeType: 'image/png', size: 5, data: 'image-original' };
    act(() => useInsightsStore.getState().setPendingImages([attachment]));
    const composer = screen.getByRole('textbox');
    fireEvent.change(composer, { target: { value: question.content } });
    fireEvent.click(screen.getByRole('button', { name: english.retryResponse }));
    expect(composer).toBeDisabled();
    expect(composer).toHaveValue(question.content);
    expect(screen.getByAltText(attachment.filename)).toBeInTheDocument();
    expect(useInsightsStore.getState().pendingImages).toEqual([attachment]);
    const request = api.regenerateInsightsMessage.mock.calls[0][1];
    expect(request.images).toEqual([attachment]);
    persistedSession = conversation([question, message('retry-success', 'assistant', 'The retry completed.')]);
    await act(async () => pending.resolve({ success: true, data: { ...request, outcome: 'complete' } }));
    await waitFor(() => expect(composer).toHaveValue(''));
    expect(composer).toBeEnabled();
    expect(screen.queryByAltText(attachment.filename)).toBeNull();
    expect(useInsightsStore.getState().pendingImages).toEqual([]);
    expect(api.sendInsightsMessage).not.toHaveBeenCalled();
  });

  it('preserves an unrelated composer draft and its attachments after assistant regeneration succeeds', async () => {
    const pending = deferred<InsightsIPCResult<InsightsGenerationResult>>();
    api.regenerateInsightsMessage.mockReturnValue(pending.promise);
    const question = message('previous-question', 'user', 'Previous question');
    await openConversation([question, message('previous-answer', 'assistant', 'Previous answer')]);
    const attachment = { id: 'future-image', filename: 'future.png', mimeType: 'image/png', size: 5, data: 'image-future' };
    act(() => useInsightsStore.getState().setPendingImages([attachment]));
    const composer = screen.getByRole('textbox');
    fireEvent.change(composer, { target: { value: 'Unrelated future question' } });
    fireEvent.click(screen.getByRole('button', { name: english.regenerateResponse }));
    const request = api.regenerateInsightsMessage.mock.calls[0][1];
    expect(request.images).toBeUndefined();
    persistedSession = conversation([question, message('replacement-answer', 'assistant', 'Replacement answer')]);
    await act(async () => pending.resolve({ success: true, data: { ...request, outcome: 'complete' } }));
    await waitFor(() => expect(composer).toBeEnabled());
    expect(composer).toHaveValue('Unrelated future question');
    expect(screen.getByAltText(attachment.filename)).toBeInTheDocument();
    expect(useInsightsStore.getState().pendingImages).toEqual([attachment]);
  });

  it('exposes expanded state and the controlled tool history while toggling it', async () => {
    await openConversation([{
      ...message('tool-answer', 'assistant', 'I checked two files.'),
      toolsUsed: [
        { name: 'Read', input: 'README.md', timestamp: new Date() },
        { name: 'Grep', input: 'search for setup', timestamp: new Date() }
      ]
    }]);
    const toggle = screen.getByRole('button', { name: '2 tools used' });
    const contentId = toggle.getAttribute('aria-controls');
    expect(contentId).toBeTruthy();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(contentId ?? '')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const details = document.getElementById(contentId ?? '');
    expect(details).toHaveTextContent('README.md');
    expect(details).toHaveTextContent('search for setup');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(contentId ?? '')).toBeNull();
  });
});
