/** @vitest-environment jsdom */
import { useState, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskFormFields } from '../TaskFormFields';
import { createThumbnail } from '../../ImageUpload';
import type { ImageAttachment } from '../../../../shared/types';
import { MAX_IMAGE_SIZE } from '../../../../shared/constants';

const capture = vi.hoisted(() => ({ data: '' }));
vi.mock('../../AgentProfileSelector', () => ({ AgentProfileSelector: () => null }));
vi.mock('../../ScreenshotCapture', () => ({
  ScreenshotCapture: ({ open, onCapture }: { open: boolean; onCapture: (data: string) => void }) => (
    open ? <button type="button" onClick={() => onCapture(capture.data)}>Capture fixture screenshot</button> : null
  ),
}));
vi.mock('../../ImageUpload', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../ImageUpload')>(),
  createThumbnail: vi.fn().mockResolvedValue('data:image/png;base64,dGh1bWJuYWls'),
}));

type FormProps = ComponentProps<typeof TaskFormFields>;
const pngData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1YAAAAASUVORK5CYII=';
const pngDataUrl = `data:image/png;base64,${pngData}`;

function mount(overrides: Partial<FormProps> = {}) {
  const onImagesChange = vi.fn();
  const onError = vi.fn();
  let replaceImages: (next: ImageAttachment[]) => void = () => { throw new Error('Form is not mounted'); };
  function Form() {
    const [images, setImages] = useState<ImageAttachment[]>([]);
    replaceImages = setImages;
    return <TaskFormFields
      description="Keep the request"
      onDescriptionChange={vi.fn()}
      title=""
      onTitleChange={vi.fn()}
      profileId="auto"
      model=""
      thinkingLevel=""
      onProfileChange={vi.fn()}
      onModelChange={vi.fn()}
      onThinkingLevelChange={vi.fn()}
      onPhaseModelsChange={vi.fn()}
      onPhaseThinkingChange={vi.fn()}
      category=""
      priority=""
      complexity=""
      impact=""
      onCategoryChange={vi.fn()}
      onPriorityChange={vi.fn()}
      onComplexityChange={vi.fn()}
      onImpactChange={vi.fn()}
      showClassification={false}
      onShowClassificationChange={vi.fn()}
      images={images}
      onImagesChange={(next) => { onImagesChange(next); setImages(next); }}
      requireReviewBeforeCoding={false}
      onRequireReviewChange={vi.fn()}
      onError={onError}
      {...overrides}
    />;
  }
  render(<Form />);
  fireEvent.click(screen.getByRole('button', { name: /Reference Images \(optional\)/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
  return { onImagesChange, onError, replaceImages: (next: ImageAttachment[]) => replaceImages(next) };
}

afterEach(cleanup);
beforeEach(() => { vi.mocked(createThumbnail).mockReset().mockResolvedValue('data:image/png;base64,dGh1bWJuYWls'); });

describe('TaskFormFields screenshot attachments', () => {
  it.each([['current Main data URL', pngDataUrl], ['legacy bare base64', pngData]])(
    'stores a %s as raw base64 and previews it with one prefix',
    async (_format, data) => {
      capture.data = data;
      const { onImagesChange, onError } = mount();
      fireEvent.click(screen.getByRole('button', { name: 'Capture fixture screenshot' }));
      await waitFor(() => expect(onImagesChange).toHaveBeenCalledOnce());
      const attachment = onImagesChange.mock.calls[0][0][0] as ImageAttachment;
      expect(attachment).toEqual(expect.objectContaining({
        mimeType: 'image/png', data: pngData, size: atob(pngData).length,
      }));
      expect(createThumbnail).toHaveBeenCalledWith(pngDataUrl);
      expect(onError).not.toHaveBeenCalledWith(expect.any(String));
      expect(screen.getByRole('textbox', { name: /Description/ })).toHaveValue('Keep the request');
      fireEvent.click(screen.getByRole('button', { name: attachment.filename }));
      expect(within(screen.getByRole('dialog', { name: attachment.filename })).getByRole('img')).toHaveAttribute('src', pngDataUrl);
    },
  );

  it.each(['data:image/png;base64,not valid base64!', 'data:image/jpeg;base64,/9j/AA==', ''])(
    'rejects an invalid screenshot before thumbnail work (%s)',
    async (data) => {
      capture.data = data;
      const { onImagesChange, onError } = mount();
      fireEvent.click(screen.getByRole('button', { name: 'Capture fixture screenshot' }));
      await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(String)));
      expect(createThumbnail).not.toHaveBeenCalled();
      expect(onImagesChange).not.toHaveBeenCalled();
    },
  );

  it('keeps existing attachments if thumbnail processing rejects', async () => {
    capture.data = pngDataUrl;
    vi.mocked(createThumbnail).mockRejectedValueOnce(new Error('Fixture image processing failure'));
    const existing = { id: 'existing', filename: 'existing.png', mimeType: 'image/png', size: 1, data: pngData };
    const { onImagesChange, onError } = mount({ images: [existing] });
    fireEvent.click(screen.getByRole('button', { name: 'Capture fixture screenshot' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(String)));
    expect(onImagesChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'existing.png' })).toBeInTheDocument();
  });

  it('rejects an oversized screenshot before thumbnail processing without replacing existing attachments', async () => {
    // A PNG capture prefix with an oversized payload exercises the real bounded normalizer.
    const payloadLength = Math.ceil((MAX_IMAGE_SIZE + 3) / 3) * 4;
    capture.data = `data:image/png;base64,${pngData.slice(0, 16)}${'A'.repeat(payloadLength - 16)}`;
    const existing = { id: 'existing', filename: 'existing.png', mimeType: 'image/png', size: 1, data: pngData };
    const { onImagesChange, onError } = mount({ images: [existing] });
    fireEvent.click(screen.getByRole('button', { name: 'Capture fixture screenshot' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(
      'Screenshot is too large (10MB). Maximum size is 10MB. Consider capturing a smaller area.',
    ));
    expect(createThumbnail).not.toHaveBeenCalled();
    expect(onImagesChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'existing.png' })).toBeInTheDocument();
  });

  it('preserves attachments added while screenshot thumbnail processing is pending', async () => {
    capture.data = pngDataUrl;
    let resolveThumbnail: (thumbnail: string) => void = () => { throw new Error('Thumbnail processing has not started'); };
    vi.mocked(createThumbnail).mockImplementationOnce(() => new Promise((resolve) => { resolveThumbnail = resolve; }));
    const { onImagesChange, replaceImages } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Capture fixture screenshot' }));
    const pasted = { id: 'pasted', filename: 'pasted.png', mimeType: 'image/png', size: 1, data: pngData };
    act(() => replaceImages([pasted]));
    await act(async () => resolveThumbnail(pngDataUrl));
    await waitFor(() => expect(onImagesChange).toHaveBeenCalledOnce());
    expect(onImagesChange.mock.calls[0][0]).toEqual([
      pasted,
      expect.objectContaining({ data: pngData, mimeType: 'image/png' }),
    ]);
  });
});
