/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultiProviderModelSelect } from './MultiProviderModelSelect';

vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) => selector({ settings: { providerAccounts: [] } }),
}));
afterEach(cleanup);

describe('Multi-provider model picker overlay', () => {
  it('escapes clipped settings content, selects a model once, and restores keyboard focus', async () => {
    const onChange = vi.fn();
    render(<div data-testid="settings-scroll" style={{ overflow: 'hidden', height: 48 }}>
      <MultiProviderModelSelect value="sonnet" onChange={onChange} filterProvider="anthropic" />
    </div>);
    const trigger = screen.getByRole('button', { name: /Sonnet/ });
    trigger.focus();
    fireEvent.click(trigger);
    const search = await screen.findByPlaceholderText('Search models...');
    expect(screen.getByTestId('settings-scroll').contains(search)).toBe(false);
    fireEvent.change(search, { target: { value: 'Opus' } });
    const option = screen.getByText('Claude Opus 4.6', { exact: true }).closest('button');
    if (!option) throw new Error('Model option button missing');
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('opus');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('closes with Escape and retains custom model input behavior', async () => {
    const onChange = vi.fn();
    render(<MultiProviderModelSelect value="sonnet" onChange={onChange} filterProvider="anthropic" />);
    const trigger = screen.getByRole('button', { name: /Sonnet/ });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByPlaceholderText('Search models...');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByPlaceholderText('Search models...')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    fireEvent.click(trigger);
    const custom = await screen.findByPlaceholderText('Enter model ID...');
    fireEvent.change(custom, { target: { value: '  custom-ui-fixture  ' } });
    fireEvent.keyDown(custom, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('custom-ui-fixture');
  });

  it('moves through available model results with the keyboard without submitting a model', async () => {
    const onChange = vi.fn();
    render(<MultiProviderModelSelect value="sonnet" onChange={onChange} filterProvider="anthropic" />);
    fireEvent.click(screen.getByRole('button', { name: /Sonnet/ }));
    const search = await screen.findByPlaceholderText('Search models...');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    const first = document.activeElement as HTMLElement;
    expect(first.hasAttribute('data-model-option')).toBe(true);
    fireEvent.keyDown(first, { key: 'End' });
    const last = document.activeElement;
    expect(last).not.toBe(first);
    if (!last) throw new Error('Focused model option missing');
    fireEvent.keyDown(last, { key: 'Home' });
    expect(document.activeElement).toBe(first);
    expect(onChange).not.toHaveBeenCalled();
  });
});
