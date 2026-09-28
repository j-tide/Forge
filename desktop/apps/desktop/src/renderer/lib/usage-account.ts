import type { ProviderAccount } from '../../shared/types/provider-account';

/** Usage belongs to an account ID or its linked Claude profile, never a name. */
export function usageMatchesAccount(
  profileId: string,
  account: Pick<ProviderAccount, 'id' | 'claudeProfileId'> | null,
): boolean {
  return !!account && !!profileId && (profileId === account.id || profileId === account.claudeProfileId);
}
