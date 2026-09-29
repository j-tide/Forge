import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BuiltinProvider,
  ProviderConnectionConfig,
  ProviderConnectionTestResult,
} from '@shared/types/provider-account';

/** Keep a probe result tied to exactly the configuration that was checked. */
export function useProviderConnectionTest(configurationKey: string) {
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<ProviderConnectionTestResult | null>(null);
  const generation = useRef(0);
  const latestKey = useRef(configurationKey);
  latestKey.current = configurationKey;

  useEffect(() => {
    latestKey.current = configurationKey;
    generation.current += 1;
    setIsTesting(false);
    setResult(null);
    return () => { generation.current += 1; };
  }, [configurationKey]);

  const test = useCallback(async (provider: BuiltinProvider, config: ProviderConnectionConfig) => {
    const requestGeneration = ++generation.current;
    const requestKey = configurationKey;
    setIsTesting(true);
    setResult(null);
    const isCurrent = () => generation.current === requestGeneration && latestKey.current === requestKey;

    try {
      const response = await window.electronAPI.testProviderConnection(provider, config);
      if (isCurrent()) {
        setResult(response.success && response.data
          ? response.data
          : { success: false, error: response.error });
      }
    } catch {
      // IPC failures can contain unsanitized transport details. The UI uses its
      // localized generic failure rather than exposing those details or keys.
      if (isCurrent()) setResult({ success: false });
    } finally {
      if (isCurrent()) setIsTesting(false);
    }
  }, [configurationKey]);

  return { isTesting, result, test };
}
