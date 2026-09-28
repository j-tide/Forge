/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CustomMcpDialog } from '../CustomMcpDialog';

afterEach(cleanup);

function pendingSave() {
  let resolve!: (saved: boolean) => void;
  const promise = new Promise<boolean>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('CustomMcpDialog save lifecycle', () => {
  it('waits for success, disables concurrent saves, and then closes', async () => {
    const pending = pendingSave();
    const onSave = vi.fn().mockReturnValue(pending.promise);
    const onOpenChange = vi.fn();
    render(<CustomMcpDialog open server={null} existingIds={[]} onSave={onSave} onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Example Server' } });
    const save = screen.getByRole('button', { name: 'Add Server' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(save).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true);
    await act(async () => pending.resolve(true));
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(onSave.mock.calls[0][0]).toMatchObject({ id: 'example-server', name: 'Example Server', command: 'npx' });
  });

  it('keeps fields and shows a safe error when save rejects', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('private secret value'));
    const onOpenChange = vi.fn();
    render(<CustomMcpDialog open server={null} existingIds={[]} onSave={onSave} onOpenChange={onOpenChange} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Example Server' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Example Server');
    expect(screen.queryByText(/private secret/)).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add Server' })).toHaveProperty('disabled', false);
  });

  it('does not close a later dialog session when an earlier save resolves', async () => {
    const pending = pendingSave();
    const onSave = vi.fn().mockReturnValue(pending.promise);
    const onOpenChange = vi.fn();
    const props = { server: null, existingIds: [], onSave, onOpenChange };
    const view = render(<CustomMcpDialog {...props} open />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'First Server' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }));
    view.rerender(<CustomMcpDialog {...props} open={false} />);
    view.rerender(<CustomMcpDialog {...props} open />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Second Server' } });
    await act(async () => pending.resolve(true));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toHaveProperty('value', 'Second Server');
  });

  it('does not attempt to persist an empty generated identifier', async () => {
    const onSave = vi.fn();
    render(<CustomMcpDialog open server={null} existingIds={[]} onSave={onSave} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '!!!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('supports a Chinese display name with a stable ASCII identifier', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    render(<CustomMcpDialog open server={null} existingIds={[]} onSave={onSave} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '项目文档检索' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }));
    await screen.findByRole('alert');
    const firstId = onSave.mock.calls[0][0].id;
    expect(firstId).toMatch(/^mcp-[a-f0-9-]+$/);
    expect(onSave.mock.calls[0][0].name).toBe('项目文档检索');
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0].id).toBe(firstId);
  });
});
