/** @vitest-environment jsdom */
import { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileAutocomplete } from '../FileAutocomplete';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { useFileExplorerStore } from '../../stores/file-explorer-store';

const projectPath = '/projects/fixture';
const fixtureFiles = ['alpha.ts', 'beta.ts', 'gamma.ts'].map((name) => ({
  name, path: `${projectPath}/${name}`, isDirectory: false,
}));

function Fixture({ query = '', mentionStart, onSelect = vi.fn(), onClose = vi.fn() }: {
  query?: string;
  mentionStart?: number;
  onSelect?: (name: string, path: string) => void;
  onClose?: () => void;
}) {
  const anchorRef = useRef<HTMLTextAreaElement>(null);
  const props = { query, mentionStart, projectPath, position: { top: 20, left: 10 }, anchorRef, onSelect, onClose };
  return (
    <div data-testid="clipping-parent" style={{ overflow: 'hidden' }}>
      <textarea ref={anchorRef} aria-label="Description" />
      <button type="button">Unrelated control</button>
      <FileAutocomplete {...props} />
    </div>
  );
}

beforeEach(() => {
  useFileExplorerStore.setState({ files: new Map([[projectPath, fixtureFiles]]) });
  // jsdom has no layout; give Radix a visible textarea and viewport for its
  // collision logic. Real clipping/position checks run in Electron separately.
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1200);
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(900);
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.tagName === 'TEXTAREA' ? new DOMRect(100, 100, 600, 240) : originalRect.call(this);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('FileAutocomplete interaction boundaries', () => {
  it('portals suggestions out of the clipping form and associates them with the description', async () => {
    render(<Fixture />);
    const description = screen.getByRole('textbox', { name: 'Description' });
    const list = await screen.findByRole('listbox', { name: 'Project Files' });
    expect(screen.getByTestId('clipping-parent')).not.toContainElement(list);
    expect(description).toHaveAttribute('aria-controls', list.id);
    expect(description).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: /alpha.ts/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('resets selection after the query changes so Enter picks a visible result', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<Fixture onSelect={onSelect} />);
    const textarea = screen.getByRole('textbox', { name: 'Description' });
    textarea.focus();
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    rerender(<Fixture query="alpha" onSelect={onSelect} />);
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('alpha.ts', `${projectPath}/alpha.ts`);
  });

  it('does not intercept another control or an IME composition', () => {
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);
    const unrelated = screen.getByRole('button', { name: 'Unrelated control' });
    unrelated.focus();
    expect(fireEvent.keyDown(unrelated, { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(unrelated, { key: 'ArrowDown' })).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
    const textarea = screen.getByRole('textbox', { name: 'Description' });
    textarea.focus();
    expect(fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true })).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('preserves the textarea focus while selecting with arrows and the mouse', async () => {
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);
    const textarea = screen.getByRole('textbox', { name: 'Description' });
    textarea.focus();
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /beta.ts/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(textarea, { key: 'ArrowUp' });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith('alpha.ts', `${projectPath}/alpha.ts`);
    const option = screen.getByRole('option', { name: /beta.ts/ });
    expect(fireEvent.mouseDown(option)).toBe(false);
    fireEvent.click(option);
    expect(onSelect).toHaveBeenLastCalledWith('beta.ts', `${projectPath}/beta.ts`);
    await waitFor(() => expect(textarea).toHaveFocus());
  });

  it('does not trap Tab or Enter when there are no files', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(<Fixture query="missing" onClose={onClose} onSelect={onSelect} />);
    const textarea = screen.getByRole('textbox', { name: 'Description' });
    textarea.focus();
    expect(screen.getByRole('status')).toHaveTextContent('No files found');
    expect(fireEvent.keyDown(textarea, { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(textarea, { key: 'Tab' })).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('lets Shift+Tab leave the field without accepting a file', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(<Fixture onClose={onClose} onSelect={onSelect} />);
    const textarea = screen.getByRole('textbox', { name: 'Description' });
    textarea.focus();
    expect(fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true })).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes stale suggestions when the cursor leaves the mention and removes its listeners', () => {
    const onClose = vi.fn();
    const { unmount } = render(<Fixture query="alpha.ts" onClose={onClose} />);
    const textarea = screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement;
    textarea.value = 'Read @alpha.ts next';
    textarea.setSelectionRange(14, 14);
    fireEvent.select(textarea);
    expect(onClose).not.toHaveBeenCalled();
    textarea.setSelectionRange(0, 0);
    fireEvent.select(textarea);
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    fireEvent.keyDown(textarea, { key: 'Escape' });
    fireEvent.select(textarea);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('resets the active result when cached files are replaced', () => {
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);
    const textarea = screen.getByRole('textbox', { name: 'Description' });
    textarea.focus();
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    act(() => useFileExplorerStore.setState({ files: new Map([[projectPath, [fixtureFiles[0]]]]) }));
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('alpha.ts', `${projectPath}/alpha.ts`);
  });

  it('does not leave a popup attached to a different mention with the same query', () => {
    const onClose = vi.fn();
    render(<Fixture query="alpha" mentionStart={0} onClose={onClose} />);
    const textarea = screen.getByRole('textbox', { name: 'Description' }) as HTMLTextAreaElement;
    textarea.value = '@alpha and @alpha';
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fireEvent.select(textarea);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Escape closes only the autocomplete, retaining the parent task editor', async () => {
    function Editor() {
      const [showAutocomplete, setShowAutocomplete] = useState(true);
      const [open, setOpen] = useState(true);
      const anchorRef = useRef<HTMLTextAreaElement>(null);
      const props = { query: '', projectPath, position: { top: 20, left: 10 }, anchorRef, onSelect: vi.fn(), onClose: () => setShowAutocomplete(false) };
      return <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Task editor</DialogTitle>
          <textarea ref={anchorRef} aria-label="Description" />
          {showAutocomplete && <FileAutocomplete {...props} />}
        </DialogContent>
      </Dialog>;
    }
    render(<Editor />);
    const textarea = screen.getByRole('textbox', { name: 'Description' });
    textarea.focus();
    await screen.findByRole('listbox');
    fireEvent.keyDown(textarea, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Task editor' })).toBeInTheDocument();
    expect(textarea).toHaveFocus();
    expect(textarea).not.toHaveAttribute('aria-controls');
    expect(textarea).not.toHaveAttribute('aria-expanded');
  });
});
