/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../shared/i18n';
import { ClaudeCodeStatusBadge } from './ClaudeCodeStatusBadge';
import { TooltipProvider } from './ui/tooltip';

const originalAPI = window.electronAPI;

beforeEach(() => {
  window.electronAPI = {
    checkClaudeCodeVersion: vi.fn().mockResolvedValue({
      success: true,
      data: { installed: null, latest: '2.0.0', isOutdated: false }
    }),
    getClaudeCodeInstallations: vi.fn().mockResolvedValue({
      success: true,
      data: { installations: [] }
    })
  } as unknown as typeof window.electronAPI;
});

afterEach(() => {
  cleanup();
  window.electronAPI = originalAPI;
});

describe('Claude CLI status localization', () => {
  it('updates installation feedback when language switches while the popover remains open', async () => {
    await i18n.changeLanguage('zh-CN');
    render(<TooltipProvider><ClaudeCodeStatusBadge /></TooltipProvider>);
    await waitFor(() => expect(screen.getByRole('button', { name: /Claude Code.*安装/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Claude Code.*安装/ }));
    fireEvent.click(screen.getByRole('button', { name: '安装' }));
    expect(await screen.findByText('当前无法安装')).toBeInTheDocument();
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByText('Installation not available')).toBeInTheDocument();
    expect(screen.queryByText('当前无法安装')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
  });

  it('keeps provider-supplied diagnostic text unchanged', async () => {
    const providerError = 'provider diagnostic E42';
    window.electronAPI.installClaudeCode = vi.fn().mockResolvedValue({ success: false, error: providerError });
    await i18n.changeLanguage('zh-CN');
    render(<TooltipProvider><ClaudeCodeStatusBadge /></TooltipProvider>);
    await waitFor(() => expect(screen.getByRole('button', { name: /Claude Code.*安装/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Claude Code.*安装/ }));
    fireEvent.click(screen.getByRole('button', { name: '安装' }));
    expect(await screen.findByText(providerError)).toBeInTheDocument();
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByText(providerError)).toBeInTheDocument();
  });
});
