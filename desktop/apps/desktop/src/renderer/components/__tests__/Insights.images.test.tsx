/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageAttachment, InsightsSession } from '../../../shared/types';
import i18n from '../../../shared/i18n';
import common from '../../../shared/i18n/locales/en/common.json';
import tasks from '../../../shared/i18n/locales/en/tasks.json';
import { Insights } from '../Insights';
import { TooltipProvider } from '../ui/tooltip';
import { switchSession, useInsightsStore } from '../../stores/insights-store';

const { createThumbnail } = vi.hoisted(() => ({ createThumbnail: vi.fn() }));
vi.mock('../ImageUpload', async (importOriginal) => ({
  ...await importOriginal<typeof import('../ImageUpload')>(), createThumbnail
}));

// Real PNG, 64 by 64 pixels. Only canvas thumbnail conversion is mocked in jsdom.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAmElEQVR4nO3QMREAIBDAsJeCVCTiCGRkoEP2Xmftc382OkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAO0BJjDyO45DRFIAAAAASUVORK5CYII=';
const PNG_URL = `data:image/png;base64,${PNG}`;
const savedAttachment = (): ImageAttachment => ({
  id: 'original-image', filename: 'original.png', mimeType: 'image/png',
  data: PNG, thumbnail: PNG_URL, size: 209
});
const session = (projectId = 'A', id = `${projectId}-session`): InsightsSession => ({
  id, projectId, messages: [], createdAt: new Date(), updatedAt: new Date()
});
const api = {
  getInsightsSession: vi.fn(), listInsightsSessions: vi.fn(), getInsightsActiveRequest: vi.fn(),
  switchInsightsSession: vi.fn(), getSources: vi.fn(), capture: vi.fn(),
  onInsightsStreamChunk: vi.fn(), onInsightsStatus: vi.fn(),
  onInsightsError: vi.fn(), onInsightsSessionUpdated: vi.fn()
};
let previousAPI: typeof window.electronAPI;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  previousAPI = window.electronAPI;
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: api });
  Object.values(api).forEach((mock) => mock.mockReset());
  api.getInsightsSession.mockImplementation(async (projectId) => ({ success: true, data: session(projectId) }));
  api.listInsightsSessions.mockResolvedValue({ success: true, data: [] });
  api.getInsightsActiveRequest.mockResolvedValue({ success: true, data: null });
  api.switchInsightsSession.mockImplementation(async (projectId, id) => ({ success: true, data: session(projectId, id) }));
  api.getSources.mockResolvedValue({ success: true, data: [{ id: 'screen:fixture', name: 'Screen fixture', thumbnail: PNG_URL }] });
  api.onInsightsStreamChunk.mockReturnValue(vi.fn());
  api.onInsightsStatus.mockReturnValue(vi.fn());
  api.onInsightsError.mockReturnValue(vi.fn());
  api.onInsightsSessionUpdated.mockReturnValue(vi.fn());
  createThumbnail.mockReset().mockResolvedValue(PNG_URL);
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

async function openInsights(images: ImageAttachment[] = []) {
  const view = render(<Insights projectId="A" />, { wrapper: TooltipProvider });
  await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled());
  act(() => useInsightsStore.getState().setPendingImages(images));
  return view;
}

async function captureScreenshot(data: string) {
  api.capture.mockResolvedValue({ success: true, data });
  fireEvent.click(screen.getByTitle(common.insights.images.screenshotButton));
  const dialog = await screen.findByRole('dialog', { name: tasks.screenshot.title });
  fireEvent.click(await within(dialog).findByRole('button', { name: /Screen fixture/ }));
  fireEvent.click(within(dialog).getByRole('button', { name: tasks.screenshot.capture }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: tasks.screenshot.title })).toBeNull());
  expect(api.capture).toHaveBeenCalledExactlyOnceWith({ sourceId: 'screen:fixture' });
}

function previewButton(filename: string) {
  return screen.getByRole('button', { name: i18n.t('tasks:imagePreview.open', { filename }) });
}

describe('Insights screenshot attachment contract', () => {
  it.each([
    { format: 'complete Main data URL', data: PNG_URL },
    { format: 'legacy raw base64', data: PNG }
  ])('normalizes $format once and retains the original PNG transport payload', async ({ data }) => {
    const existing = savedAttachment();
    await openInsights([existing]);
    await captureScreenshot(data);
    await waitFor(() => expect(useInsightsStore.getState().pendingImages).toHaveLength(2));
    const [oldImage, captured] = useInsightsStore.getState().pendingImages;
    expect(oldImage).toEqual(existing);
    expect(captured.data).toBe(PNG);
    expect(captured.mimeType).toBe('image/png');
    expect(captured.thumbnail).toBe(PNG_URL);
    expect(createThumbnail).toHaveBeenCalledExactlyOnceWith(PNG_URL);
    expect((captured.thumbnail?.match(/data:image\/png;base64,/g) ?? [])).toHaveLength(1);
    expect(screen.getByAltText(captured.filename)).toHaveAttribute('src', PNG_URL);
  });

  it.each([
    { format: 'wrong data URL MIME', data: `data:text/plain;base64,${PNG}` },
    { format: 'invalid raw base64', data: 'not valid base64!?' },
    { format: 'nested data URL', data: `data:image/png;base64,${PNG_URL}` }
  ])('rejects $format with recovery guidance and leaves previous attachments intact', async ({ data }) => {
    const existing = savedAttachment();
    await openInsights([existing]);
    await captureScreenshot(data);
    await screen.findByText(common.insights.images.processFailed);
    expect(useInsightsStore.getState().pendingImages).toEqual([existing]);
    expect(createThumbnail).not.toHaveBeenCalled();
    expect(screen.getByAltText(existing.filename)).toHaveAttribute('src', PNG_URL);
    expect(screen.queryByText(data)).toBeNull();
  });

  it('handles thumbnail processing failure without discarding previous attachments', async () => {
    const existing = savedAttachment();
    createThumbnail.mockRejectedValue(new Error('Image conversion private runtime details'));
    await openInsights([existing]);
    await captureScreenshot(PNG_URL);
    await screen.findByText(common.insights.images.processFailed);
    expect(createThumbnail).toHaveBeenCalledExactlyOnceWith(PNG_URL);
    expect(useInsightsStore.getState().pendingImages).toEqual([existing]);
    expect(screen.queryByText('Image conversion private runtime details')).toBeNull();
  });

  it.each(['project', 'session', 'draft'] as const)('discards a delayed screenshot thumbnail after the visible $0 changes', async (scope) => {
    const existing = savedAttachment();
    const thumbnail = deferred<string>();
    createThumbnail.mockReturnValue(thumbnail.promise);
    const view = await openInsights([existing]);
    await captureScreenshot(PNG_URL);
    expect(createThumbnail).toHaveBeenCalledExactlyOnceWith(PNG_URL);
    const replacement = { ...existing, id: 'replacement-image', filename: 'replacement.png' };
    if (scope === 'project') {
      view.rerender(<Insights projectId="B" />);
      await waitFor(() => expect(useInsightsStore.getState().session?.projectId).toBe('B'));
    } else if (scope === 'session') {
      await act(async () => { await switchSession('A', 'new-session'); });
    } else {
      act(() => useInsightsStore.getState().setPendingImages([replacement]));
    }
    const visibleImages = useInsightsStore.getState().pendingImages;
    await act(async () => thumbnail.resolve(PNG_URL));
    expect(useInsightsStore.getState().pendingImages).toEqual(visibleImages);
    expect(useInsightsStore.getState().pendingImages.some((image) => image.filename.startsWith('screenshot-'))).toBe(false);
  });
});

describe('Insights full image preview', () => {
  it('opens the real preview from a thumbnail and returns focus after Escape without mutating attachments', async () => {
    const image = savedAttachment();
    await openInsights([image]);
    const trigger = previewButton(image.filename);
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: image.filename });
    expect(within(dialog).getByAltText(image.filename)).toHaveAttribute('src', PNG_URL);
    expect(within(dialog).getByRole('button', { name: tasks.imagePreview.close })).toBeInTheDocument();
    expect(useInsightsStore.getState().pendingImages).toEqual([image]);
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: image.filename })).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(useInsightsStore.getState().pendingImages).toEqual([image]);
  });

  it('uses an unblocked native button for keyboard activation and previews the full data', async () => {
    const image = savedAttachment();
    await openInsights([image]);
    const trigger = previewButton(image.filename);
    expect(trigger).toBeInstanceOf(HTMLButtonElement);
    expect(trigger).toHaveAttribute('type', 'button');
    trigger.focus();
    expect(fireEvent.keyDown(trigger, { key: 'Enter', code: 'Enter' })).toBe(true);
    // jsdom does not synthesize the browser's Enter default click; dispatch that
    // activation after checking the native button and unprevented key contract.
    fireEvent.click(trigger);
    fireEvent.keyUp(trigger, { key: 'Enter', code: 'Enter' });
    const dialog = await screen.findByRole('dialog', { name: image.filename });
    expect(within(dialog).getByAltText(image.filename)).toHaveAttribute('src', PNG_URL);
    expect(useInsightsStore.getState().pendingImages[0].data).toBe(PNG);
  });

  it.each(['removed', 'replaced'] as const)('closes a stale preview when its attachment is $0', async (change) => {
    const image = savedAttachment();
    await openInsights([image]);
    fireEvent.click(previewButton(image.filename));
    await screen.findByRole('dialog', { name: image.filename });
    act(() => useInsightsStore.getState().setPendingImages(change === 'removed' ? [] : [{ ...image, data: `${PNG}changed` }]));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: image.filename })).toBeNull());
  });

  it('closes the selected project preview when a different project becomes visible', async () => {
    const image = savedAttachment();
    const view = await openInsights([image]);
    fireEvent.click(previewButton(image.filename));
    await screen.findByRole('dialog', { name: image.filename });
    view.rerender(<Insights projectId="B" />);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: image.filename })).toBeNull());
    await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled());
    expect(useInsightsStore.getState().session?.projectId).toBe('B');
  });

  it('closes the previous conversation preview when another session becomes visible', async () => {
    const image = savedAttachment();
    await openInsights([image]);
    fireEvent.click(previewButton(image.filename));
    await screen.findByRole('dialog', { name: image.filename });
    await act(async () => { await switchSession('A', 'another-session'); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: image.filename })).toBeNull());
    expect(useInsightsStore.getState().session?.id).toBe('another-session');
  });
});
