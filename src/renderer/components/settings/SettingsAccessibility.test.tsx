/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DEFAULT_APP_SETTINGS } from '../../../shared/constants/config';
import type { AppSettings } from '../../../shared/types';
import { AdvancedSettings } from './AdvancedSettings';
import { AccountPriorityList, type UnifiedAccount } from './AccountPriorityList';
import { TooltipProvider } from '../ui/tooltip';
import i18n from '../../../shared/i18n';
import { FontConfigPanel } from './terminal-font-settings/FontConfigPanel';
import { CursorConfigPanel } from './terminal-font-settings/CursorConfigPanel';
import type { TerminalFontSettings } from '../../stores/terminal-font-settings-store';

afterEach(cleanup);
const terminalSettings: TerminalFontSettings = {
  fontFamily: ['Menlo', 'monospace'], fontSize: 13, fontWeight: 400,
  lineHeight: 1.2, letterSpacing: 0, cursorStyle: 'block', cursorBlink: true,
  cursorAccentColor: '#000000', scrollback: 10000,
};

describe('Settings accessible controls', () => {
  it('names all four notification switches and makes their visible labels actionable', () => {
    const change = vi.fn();
    render(<AdvancedSettings settings={DEFAULT_APP_SETTINGS as AppSettings} onSettingsChange={change} section="notifications" version="test" />);
    const entries = [
      ['onTaskComplete', 'notifications.onTaskComplete'],
      ['onTaskFailed', 'notifications.onTaskFailed'],
      ['onReviewNeeded', 'notifications.onReviewNeeded'],
      ['sound', 'notifications.sound'],
    ] as const;

    for (const [key, labelKey] of entries) {
      const label = i18n.t(`settings:${labelKey}`);
      const control = screen.getByRole('switch', { name: label });
      expect(control).toHaveAccessibleDescription();
      expect(screen.getByLabelText(label)).toBe(control);
      fireEvent.click(screen.getByText(label));
      expect(change).toHaveBeenLastCalledWith(expect.objectContaining({
        notifications: { ...DEFAULT_APP_SETTINGS.notifications, [key]: !DEFAULT_APP_SETTINGS.notifications[key] },
      }));
    }
  });

  it('identifies the priority action and draggable account without relying on tooltip hover', () => {
    const activate = vi.fn();
    const account: UnifiedAccount = {
      id: 'secondary', name: 'Secondary account', displayName: 'Secondary account', provider: 'openai',
      identifier: 'OpenAI', type: 'api', isActive: false, isNext: false, isAvailable: true, hasUnlimitedUsage: false,
    };
    render(<TooltipProvider><AccountPriorityList accounts={[account]} onReorder={vi.fn()} onSetActive={activate} /></TooltipProvider>);
    expect(screen.getByRole('button', { name: 'Secondary account' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set as active: Secondary account' }));
    expect(activate).toHaveBeenCalledWith('secondary');
  });

  it('names font controls by their purpose and links the font family label to its picker', () => {
    render(<FontConfigPanel settings={terminalSettings} onSettingChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Font Family' })).toBe(screen.getByLabelText('Font Family'));
    expect(screen.getByRole('spinbutton', { name: 'Font Weight' })).toBe(screen.getByLabelText('Font Weight'));
    for (const name of ['Font Size', 'Line Height', 'Letter Spacing']) {
      expect(screen.getByRole('slider', { name })).toBe(screen.getByLabelText(name));
    }
    expect(screen.getByRole('button', { name: /Decrease font size/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Increase font weight/ })).toBeInTheDocument();
  });

  it('links cursor style, blinking and color labels and makes the blinking label actionable', () => {
    const change = vi.fn();
    render(<CursorConfigPanel settings={terminalSettings} onSettingChange={change} />);
    expect(screen.getByRole('combobox', { name: 'Cursor Style' })).toBe(screen.getByLabelText('Cursor Style'));
    const blink = screen.getByRole('switch', { name: 'Cursor Blink' });
    expect(blink).toBe(screen.getByLabelText('Cursor Blink'));
    expect(blink).toHaveAccessibleDescription();
    expect(screen.getByLabelText('Cursor Accent Color')).toHaveAttribute('type', 'color');
    expect(screen.getByRole('button', { name: 'Reset to black' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cursor Blink'));
    expect(change).toHaveBeenCalledWith('cursorBlink', false);
  });
});
