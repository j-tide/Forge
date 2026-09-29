/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import type { TerminalProps } from './types';
import i18n from '../../../shared/i18n';
import { TerminalHeader } from './TerminalHeader';
import { SortableTerminalWrapper } from '../SortableTerminalWrapper';

vi.mock('../../stores/terminal-store', () => ({
  useTerminalStore: (selector: (state: { terminals: [] }) => unknown) => selector({ terminals: [] }),
}));
vi.mock('../Terminal', async () => {
  const { forwardRef } = await import('react');
  const { TerminalHeader: Header } = await import('./TerminalHeader');
  return {
    Terminal: forwardRef(function TerminalHeaderFixture(props: TerminalProps, _ref) {
      return <Header
        terminalId={props.id} title="My shell" status="running" isCLIMode={false} tasks={[]}
        onClose={props.onClose} onInvokeClaude={vi.fn()} onTitleChange={vi.fn()}
        onTaskSelect={vi.fn()} onClearTask={vi.fn()}
        dragHandleListeners={props.dragHandleListeners}
        dragHandleAttributes={props.dragHandleAttributes}
        setActivatorNodeRef={props.setActivatorNodeRef}
      />;
    }),
  };
});

afterEach(cleanup);

describe('Terminal header drag handle accessibility', () => {
  it.each([
    { language: 'en', name: 'Reorder terminal My shell' },
    { language: 'zh-CN', name: '调整终端 My shell 的顺序' },
  ])('provides a named native keyboard-focusable handle in $language', async ({ language, name }) => {
    await i18n.changeLanguage(language);
    const onKeyDown = vi.fn();
    const setActivatorNodeRef = vi.fn();
    const { unmount } = render(<TerminalHeader
      terminalId="terminal-fixture" title="My shell" status="running" isCLIMode={false} tasks={[]}
      onClose={vi.fn()} onInvokeClaude={vi.fn()} onTitleChange={vi.fn()}
      onTaskSelect={vi.fn()} onClearTask={vi.fn()}
      dragHandleListeners={{ onKeyDown }}
      setActivatorNodeRef={setActivatorNodeRef}
      dragHandleAttributes={{
        role: 'button', tabIndex: 0, 'aria-disabled': false, 'aria-pressed': false,
        'aria-roledescription': 'draggable', 'aria-describedby': 'terminal-drag-instructions',
      }}
    />);
    const handle = screen.getByRole('button', { name });
    expect(handle.tagName).toBe('BUTTON');
    expect((handle as HTMLButtonElement).type).toBe('button');
    expect(handle.tabIndex).toBe(0);
    expect(handle.getAttribute('aria-describedby')).toBe('terminal-drag-instructions');
    expect(handle.getAttribute('aria-roledescription')).toBe('draggable');
    expect(setActivatorNodeRef).toHaveBeenCalledWith(handle);
    expect(handle.closest('[data-terminal-id]')?.getAttribute('data-terminal-id')).toBe('terminal-fixture');
    handle.focus();
    expect(document.activeElement).toBe(handle);
    fireEvent.keyDown(handle, { key: ' ', code: 'Space' });
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(onKeyDown.mock.calls[0][0].nativeEvent.code).toBe('Space');
    expect(onKeyDown.mock.calls[0][0].target).toBe(handle);
    unmount();
    expect(setActivatorNodeRef.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it('omits the reorder handle when the terminal has no sortable listeners', () => {
    render(<TerminalHeader
      terminalId="terminal-fixture" title="My shell" status="running" isCLIMode={false} tasks={[]}
      onClose={vi.fn()} onInvokeClaude={vi.fn()} onTitleChange={vi.fn()}
      onTaskSelect={vi.fn()} onClearTask={vi.fn()}
    />);
    expect(screen.queryByRole('button', { name: 'Reorder terminal My shell' })).toBeNull();
  });

  it('activates the real keyboard sensor through the named handle without an extra outer focus target', async () => {
    const onDragStart = vi.fn();
    const onDragCancel = vi.fn();
    const { container } = render(<DndContext onDragStart={onDragStart} onDragCancel={onDragCancel}>
      <SortableContext items={['terminal-fixture']}>
        <SortableTerminalWrapper
          id="terminal-fixture" isActive onClose={vi.fn()} onActivate={vi.fn()}
          tasks={[]} terminalCount={1}
        />
      </SortableContext>
    </DndContext>);
    const handle = screen.getByRole('button', { name: 'Reorder terminal My shell' });
    expect(container.querySelector('div[role="button"]')).toBeNull();
    const instructions = handle.getAttribute('aria-describedby');
    expect(instructions).toBeTruthy();
    expect(instructions && document.getElementById(instructions)).not.toBeNull();
    handle.focus();
    fireEvent.keyDown(handle, { key: ' ', code: 'Space' });
    await waitFor(() => expect(onDragStart).toHaveBeenCalledOnce());
    expect(onDragStart.mock.calls[0][0].active.id).toBe('terminal-fixture');
    // The keyboard sensor installs its document listener on the next task.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(onDragCancel).toHaveBeenCalledOnce());
    await waitFor(() => expect(document.activeElement).toBe(handle));
  });
});
