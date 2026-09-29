import { describe, expect, it } from 'vitest';
import { resolveInsightsModelConfig } from './insights-model-config';
import type { AppSettings } from '../types';
import type { ProviderAccount } from '../types/provider-account';

const glm: ProviderAccount = { id: 'glm', provider: 'zai', name: 'GLM', authType: 'api-key', billingModel: 'subscription', createdAt: 1, updatedAt: 1 };
describe('Insights provider defaults', () => {
  it('inherits GLM Auto instead of the legacy Sonnet fallback', () => {
    expect(resolveInsightsModelConfig({ providerAgentConfig: { zai: { selectedAgentProfile: 'auto' } } } as AppSettings, glm))
      .toEqual({ profileId: 'auto', model: 'glm-5', thinkingLevel: 'low' });
  });
  it('uses the configured feature model and thinking level', () => {
    const settings = { providerAgentConfig: { zai: { selectedAgentProfile: 'auto', featureModels: { insights: 'glm-4.7' }, featureThinking: { insights: 'high' } } } } as AppSettings;
    expect(resolveInsightsModelConfig(settings, glm)).toEqual({ profileId: 'custom', model: 'glm-4.7', thinkingLevel: 'high' });
  });
  it('maps an old Sonnet session to GLM while preserving its selected profile', () => {
    expect(resolveInsightsModelConfig({} as AppSettings, glm, { profileId: 'balanced', model: 'sonnet', thinkingLevel: 'medium' }))
      .toEqual({ profileId: 'balanced', model: 'glm-4.7', thinkingLevel: 'medium' });
  });
  it('preserves an explicit session choice over application defaults', () => {
    const explicit = { profileId: 'custom', model: 'glm-4.5-flash', thinkingLevel: 'low' } as const;
    expect(resolveInsightsModelConfig({ selectedAgentProfile: 'auto' } as AppSettings, glm, explicit)).toEqual(explicit);
  });
});
