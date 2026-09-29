import { getProviderPreset, resolveModelEquivalent } from '../constants/models';
import type { AppSettings, InsightsModelConfig } from '../types';
import type { ProviderAccount } from '../types/provider-account';

/** Resolve the same concrete model for the selector and the outgoing request. */
export function resolveInsightsModelConfig(
  settings: AppSettings,
  account: ProviderAccount | null,
  sessionConfig?: InsightsModelConfig,
): InsightsModelConfig {
  const provider = account?.provider ?? 'anthropic';
  if (sessionConfig) {
    return {
      ...sessionConfig,
      model: resolveModelEquivalent(sessionConfig.model, provider, settings.modelOverrides)?.modelId ?? sessionConfig.model,
    };
  }
  const config = settings.providerAgentConfig?.[provider];
  const profileId = config?.selectedAgentProfile ?? settings.selectedAgentProfile ?? 'balanced';
  const preset = getProviderPreset(provider, profileId) ?? getProviderPreset(provider, 'auto');
  const featureModel = config?.featureModels?.insights;
  const requestedModel = featureModel ?? preset?.primaryModel ?? settings.featureModels?.insights ?? 'sonnet';
  return {
    profileId: featureModel ? 'custom' : profileId,
    model: resolveModelEquivalent(requestedModel, provider, settings.modelOverrides)?.modelId ?? requestedModel,
    thinkingLevel: config?.featureThinking?.insights ?? preset?.primaryThinking ?? settings.featureThinking?.insights ?? 'medium',
  };
}
