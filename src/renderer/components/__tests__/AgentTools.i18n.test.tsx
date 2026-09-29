/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import en from '../../../shared/i18n/locales/en/uiAgentTools.json';
import zh from '../../../shared/i18n/locales/zh-CN/uiAgentTools.json';
import { AgentTools } from '../AgentTools';

vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: (selector: (state: { settings: object }) => unknown) => selector({ settings: {} }),
}));
vi.mock('../../stores/project-store', () => ({
  useProjectStore: (selector: (state: { projects: object[]; selectedProjectId: null }) => unknown) => selector({ projects: [], selectedProjectId: null }),
}));
vi.mock('../../hooks/useActiveProvider', () => ({ useActiveProvider: () => ({ provider: null }) }));
vi.mock('../../hooks', () => ({
  useResolvedAgentSettings: () => ({ phaseModels: {}, phaseThinking: {}, featureModels: {}, featureThinking: {} }),
  resolveAgentSettings: () => ({ model: 'opus', thinking: 'high' }),
}));
vi.mock('../CustomMcpDialog', () => ({ CustomMcpDialog: () => null }));

const i18n = createInstance();

beforeEach(async () => {
  await i18n.use(initReactI18next).init({
    lng: 'zh-CN', fallbackLng: 'en',
    resources: { en: { uiAgentTools: en }, 'zh-CN': { uiAgentTools: zh } },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
});
afterEach(cleanup);

describe('AgentTools language presentation', () => {
  it('renders Chinese categories, roles and tools without changing protocol names', () => {
    render(<I18nextProvider i18n={i18n}><AgentTools /></I18nextProvider>);
    expect(screen.getByText('MCP 服务器概览')).toBeDefined();
    expect(screen.getByRole('heading', { name: '规划者' })).toBeDefined();
    expect(screen.getAllByText('高').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /规划者/ }));
    expect(screen.getByText('可用工具')).toBeDefined();
    expect(screen.getByText('读取文件').getAttribute('title')).toBe('Read');
    expect(screen.getByText('Forge 工具')).toBeDefined();
    expect(screen.getByText('Context7')).toBeDefined();
  });

  it('updates existing content immediately when the language switches to English', async () => {
    render(<I18nextProvider i18n={i18n}><AgentTools /></I18nextProvider>);
    fireEvent.click(screen.getByRole('button', { name: /规划者/ }));
    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByText('MCP Server Overview')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Planner' })).toBeDefined();
    expect(screen.getByText('Available Tools')).toBeDefined();
    expect(screen.getByText('Forge Tools')).toBeDefined();
    expect(screen.getByText('Read').getAttribute('title')).toBe('Read');
    expect(screen.queryByText('规划者')).toBeNull();
  });

  it('provides matching metadata keys and keeps environment identifiers exact', () => {
    expect(Object.keys(zh.agents).sort()).toEqual(Object.keys(en.agents).sort());
    expect(Object.keys(zh.servers).sort()).toEqual(Object.keys(en.servers).sort());
    expect(zh.servers.memory.description).toContain('GRAPHITI_MCP_URL');
    expect(zh.servers.linear.description).toContain('LINEAR_API_KEY');
    expect(zh.servers.electron.description).toContain('ELECTRON_MCP_ENABLED=true');
  });
});
