import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Download, Loader2, ExternalLink, WifiOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';
import { useSettingsStore } from '../../stores/settings-store';
import type { ProviderAccount } from '@shared/types/provider-account';

type OllamaConnectionState = 'idle' | 'checking' | 'not-installed' | 'not-running' | 'connected';
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

interface OllamaConnectionPanelProps {
  accounts: ProviderAccount[];
  onAccountCreated?: () => void;
}

export function OllamaConnectionPanel({ accounts, onAccountCreated }: OllamaConnectionPanelProps) {
  const { t } = useTranslation('settings');
  const addProviderAccount = useSettingsStore((state) => state.addProviderAccount);
  const updateProviderAccount = useSettingsStore((state) => state.updateProviderAccount);
  const account = accounts.find((entry) => entry.provider === 'ollama');
  const savedUrl = account?.baseUrl || DEFAULT_OLLAMA_URL;
  const urlInputId = useId();

  const [connectionState, setConnectionState] = useState<OllamaConnectionState>('idle');
  const [llmModelCount, setLlmModelCount] = useState<number | null>(null);
  const [customUrl, setCustomUrl] = useState(savedUrl);
  const [error, setError] = useState<string | null>(null);
  const [checkedUrl, setCheckedUrl] = useState<string | null>(null);
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastCheckedUrlRef = useRef<string | null>(null);

  const checkConnection = useCallback(async (inputUrl: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;
    setError(null);
    setLlmModelCount(null);

    let endpoint: URL;
    try {
      endpoint = new URL(inputUrl.trim());
      if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Invalid URL');
    } catch {
      setConnectionState('idle');
      setError(t('providers.ollama.connection.invalidUrl'));
      return;
    }

    const url = inputUrl.trim().replace(/\/+$/, '');
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
    lastCheckedUrlRef.current = url;
    setCheckedUrl(url);
    setConnectionState('checking');

    try {
      // A remote endpoint is usable without a local Ollama installation.
      const statusResult = await window.electronAPI.checkOllamaStatus(url);
      if (signal.aborted) return;
      if (!statusResult?.success || !statusResult.data?.running) {
        if (isLocal) {
          const installedResult = await window.electronAPI.checkOllamaInstalled();
          if (signal.aborted) return;
          setConnectionState(installedResult?.success && installedResult.data?.installed === false ? 'not-installed' : 'not-running');
        } else {
          setConnectionState('not-running');
        }
        return;
      }

      const modelsResult = await window.electronAPI.listOllamaModels(url);
      if (signal.aborted) return;
      if (modelsResult?.success && modelsResult.data?.models) {
        setLlmModelCount(modelsResult.data.models.filter((model) => !model.is_embedding).length);
      }

      const existingAccount = accountsRef.current.find((entry) => entry.provider === 'ollama');
      if (!existingAccount || existingAccount.baseUrl !== url) {
        try {
          const result = existingAccount
            ? await updateProviderAccount(existingAccount.id, { baseUrl: url })
            : await addProviderAccount({
              provider: 'ollama',
              name: isLocal ? 'Ollama (Local)' : 'Ollama',
              authType: 'api-key',
              billingModel: 'pay-per-use',
              baseUrl: url,
            });
          if (signal.aborted) return;
          if (!result.success) {
            setError(t('providers.ollama.connection.saveFailed'));
          } else {
            if (result.data) accountsRef.current = [result.data, ...accountsRef.current.filter((entry) => entry.id !== result.data?.id)];
            onAccountCreated?.();
          }
        } catch {
          if (signal.aborted) return;
          setError(t('providers.ollama.connection.saveFailed'));
        }
      }
      setCustomUrl(url);
      setConnectionState('connected');
    } catch {
      if (!signal.aborted) setConnectionState('not-running');
    }
  }, [addProviderAccount, updateProviderAccount, onAccountCreated, t]);

  useEffect(() => {
    setCustomUrl(savedUrl);
  }, [savedUrl]);

  useEffect(() => {
    if (lastCheckedUrlRef.current !== savedUrl || abortControllerRef.current?.signal.aborted) void checkConnection(savedUrl);
  }, [savedUrl, checkConnection]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={urlInputId} className="text-xs text-muted-foreground">
          {t('providers.ollama.connection.customUrl')}
        </Label>
        <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); void checkConnection(customUrl); }}>
          <Input
            id={urlInputId}
            value={customUrl}
            onChange={(event) => {
              abortControllerRef.current?.abort();
              setCustomUrl(event.target.value);
              setConnectionState('idle');
              setError(null);
              setLlmModelCount(null);
            }}
            placeholder={t('providers.ollama.connection.customUrlPlaceholder')}
            aria-invalid={Boolean(error)}
            className="h-8 text-xs font-mono"
          />
          <Button type="submit" variant="outline" size="sm" disabled={connectionState === 'checking' || !customUrl.trim()} className="shrink-0">
            {connectionState === 'checking' && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            {t('providers.ollama.connection.testAndSave')}
          </Button>
        </form>
      </div>

      <div role="status" aria-live="polite">
        {connectionState === 'idle' && <p className="text-xs text-muted-foreground">{t('providers.ollama.connection.testHint')}</p>}
        {connectionState === 'checking' && <p className="text-sm text-muted-foreground">{t('providers.ollama.connection.checking')}</p>}
        {connectionState === 'connected' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success/20 border border-success/40 shrink-0"><Check className="h-3 w-3 text-success" /></div>
                <span className="text-sm font-medium text-foreground">{t('providers.ollama.connection.connected')}</span>
              </div>
              {llmModelCount !== null && <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', llmModelCount > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                {llmModelCount > 0 ? t('providers.ollama.connection.modelsAvailable', { count: llmModelCount }) : t('providers.ollama.connection.noModels')}
              </span>}
            </div>
            <p className="text-xs text-muted-foreground">{t('providers.ollama.connection.connectedDescription')}</p>
            <p className="text-xs text-muted-foreground font-mono break-all">{checkedUrl}</p>
          </div>
        )}
        {connectionState === 'not-installed' && (
          <div className="rounded-lg border border-info/30 bg-info/10 p-4">
            <div className="flex items-start gap-3">
              <Download className="h-5 w-5 text-info shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{t('providers.ollama.connection.notInstalled')}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('providers.ollama.connection.localOrRemote')}</p>
                <div className="flex items-center gap-2 mt-3">
                  <Button size="sm" onClick={() => window.electronAPI?.openExternal?.('https://ollama.com/download')}><Download className="h-3.5 w-3.5 mr-1.5" />{t('providers.ollama.connection.install')}</Button>
                  <Button variant="ghost" size="sm" onClick={() => window.electronAPI?.openExternal?.('https://ollama.com')} className="text-muted-foreground"><ExternalLink className="h-3.5 w-3.5 mr-1.5" />{t('providers.ollama.connection.learnMore')}</Button>
                </div>
              </div>
            </div>
          </div>
        )}
        {connectionState === 'not-running' && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 flex items-start gap-3">
            <WifiOff className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">{t('providers.ollama.connection.unreachable')}</p>
              <p className="text-sm text-warning/80 mt-1">{t('providers.ollama.connection.unreachableDescription')}</p>
              <p className="text-xs text-muted-foreground mt-2 font-mono break-all">{checkedUrl}</p>
            </div>
          </div>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
