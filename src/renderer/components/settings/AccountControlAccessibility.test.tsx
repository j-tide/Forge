/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AccountSettings } from './AccountSettings';
import { DEFAULT_APP_SETTINGS } from '../../../shared/constants/config';
import type { AppSettings } from '../../../shared/types';
import type { ProviderAccount } from '@shared/types/provider-account';
import i18n from '../../../shared/i18n';

const store = vi.hoisted(() => ({ getProviderAccounts: vi.fn(), setQueueOrder: vi.fn(), setCrossProviderQueueOrder: vi.fn() }));
vi.mock('../../stores/settings-store', () => ({ useSettingsStore: () => store }));
vi.mock('./ProviderAccountsList', () => ({ ProviderAccountsList: () => <div>Account fixtures</div> }));
vi.mock('./AccountPriorityList', () => ({ AccountPriorityList: () => <div>Priority fixtures</div> }));
vi.mock('../../hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

beforeEach(() => {
  const accounts: ProviderAccount[] = ['primary', 'secondary'].map(id => ({
    id, name: id, provider: 'openai', authType: 'api-key', billingModel: 'pay-per-use', createdAt: 1, updatedAt: 1,
  }));
  store.getProviderAccounts.mockReturnValue(accounts);
  window.electronAPI.getAutoSwitchSettings = vi.fn().mockResolvedValue({
    success: true,
    data: { enabled: true, proactiveSwapEnabled: true, autoSwitchOnRateLimit: false, autoSwitchOnAuthFailure: false, sessionThreshold: 95, weeklyThreshold: 99 },
  });
  window.electronAPI.updateAutoSwitchSettings = vi.fn().mockResolvedValue({ success: true });
  window.electronAPI.requestAllProfilesUsage = vi.fn().mockResolvedValue({ success: false });
});
afterEach(cleanup);

describe('Account switching accessible controls', () => {
  it.each([
    ['enableAutoSwitching', 'enabled', false],
    ['proactiveMonitoring', 'proactiveSwapEnabled', false],
    ['reactiveRecovery', 'autoSwitchOnRateLimit', true],
    ['autoSwitchOnAuthFailure', 'autoSwitchOnAuthFailure', true],
  ] as const)('names and links %s and saves the action from clicking its label', async (labelKey, settingKey, nextValue) => {
    render(<AccountSettings settings={DEFAULT_APP_SETTINGS as AppSettings} onSettingsChange={vi.fn()} isOpen />);
    const label = i18n.t(`settings:accounts.autoSwitching.${labelKey}`);
    await waitFor(() => expect(screen.getByRole('switch', { name: label })).toBeEnabled());
    const control = screen.getByRole('switch', { name: label });
    expect(screen.getByLabelText(label)).toBe(control);
    expect(control).toHaveAccessibleDescription();
    fireEvent.click(screen.getByText(label));
    await waitFor(() => expect(window.electronAPI.updateAutoSwitchSettings).toHaveBeenCalledWith({ [settingKey]: nextValue }));
  });
});
