/** @vitest-environment jsdom */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskModalLayout } from '../TaskModalLayout';

afterEach(cleanup);

describe('TaskModalLayout accessibility and actions', () => {
  it('exposes its title, description, form content, and real footer actions', () => {
    const save = vi.fn();
    render(<TaskModalLayout open onOpenChange={vi.fn()} title="New task" description="Describe the desired outcome"
      footer={<button type="button" onClick={save}>Save task</button>}>
      <label htmlFor="request">Task request</label><textarea id="request" />
    </TaskModalLayout>);

    expect(screen.getByRole('dialog', { name: 'New task' })).toHaveAccessibleDescription('Describe the desired outcome');
    expect(screen.getByRole('textbox', { name: 'Task request' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    expect(save).toHaveBeenCalledOnce();
  });

  it('closes with Escape and restores focus to the button that opened it', async () => {
    function OpenTask() {
      const [open, setOpen] = useState(false);
      return <>
        <button type="button" onClick={() => setOpen(true)}>New task</button>
        <TaskModalLayout open={open} onOpenChange={setOpen} title="Task editor" description="Edit request"
          footer={<button type="button">Save task</button>}>
          <label htmlFor="request">Task request</label><textarea id="request" />
        </TaskModalLayout>
      </>;
    }
    render(<OpenTask />);
    const trigger = screen.getByRole('button', { name: 'New task' });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('traps keyboard focus inside the modal instead of moving behind it', async () => {
    render(<TaskModalLayout open onOpenChange={vi.fn()} title="Task editor" description="Edit request"
      footer={<button type="button">Save task</button>}>
      <label htmlFor="request">Task request</label><textarea id="request" />
    </TaskModalLayout>);
    const save = screen.getByRole('button', { name: 'Save task' });
    save.focus();
    fireEvent.keyDown(save, { key: 'Tab', code: 'Tab' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: 'Tab', code: 'Tab', shiftKey: true });
    expect(save).toHaveFocus();
  });

  it('keeps Escape and the close button from interrupting a disabled submission', async () => {
    const onOpenChange = vi.fn();
    render(<TaskModalLayout open disabled onOpenChange={onOpenChange} title="Task editor" description="Saving task"
      footer={<button type="button" disabled>Saving</button>}><p>Pending submission</p></TaskModalLayout>);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toBeDisabled();
    fireEvent.click(close);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the optional file sidebar only when the existing visibility control is enabled', () => {
    const modal = { open: true, onOpenChange: vi.fn(), title: 'Task editor', description: 'Edit request', footer: <button type="button">Save</button> };
    const { rerender } = render(<TaskModalLayout {...modal} sidebar={<p>Project file explorer</p>}><p>Task content</p></TaskModalLayout>);
    expect(screen.queryByText('Project file explorer')).not.toBeInTheDocument();
    rerender(<TaskModalLayout {...modal} sidebar={<p>Project file explorer</p>} sidebarOpen><p>Task content</p></TaskModalLayout>);
    expect(screen.getByText('Project file explorer')).toBeInTheDocument();
    expect(screen.getByText('Task content')).toBeInTheDocument();
  });
});
