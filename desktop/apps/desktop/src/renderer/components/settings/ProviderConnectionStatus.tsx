import { useTranslation } from 'react-i18next';
import { useId } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ProviderConnectionTestResult } from '@shared/types/provider-account';
import { cn } from '../../lib/utils';
import { ALL_AVAILABLE_MODELS } from '@shared/constants/models';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

export function ProviderConnectionModelSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation('settings');
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{t('providers.connection.model')}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ALL_AVAILABLE_MODELS.filter(model => model.provider === 'zai').map(model => (
            <SelectItem key={model.value} value={model.value}>{model.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ProviderConnectionStatus({ result }: { result: ProviderConnectionTestResult | null }) {
  const { t } = useTranslation('settings');
  if (!result) return null;
  const Icon = result.success ? CheckCircle2 : AlertCircle;
  const detail = result.code
    ? t(`providers.connection.results.${result.code}`, { status: result.status })
    : result.success ? result.message : result.error || result.message || t('providers.connection.unavailable');

  return (
    <div
      role={result.success ? 'status' : 'alert'}
      className={cn('flex items-start gap-2 rounded-md border p-3 text-xs', result.success
        ? 'border-success/30 bg-success/10 text-success'
        : 'border-destructive/30 bg-destructive/10 text-destructive')}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{t(result.success ? 'providers.connection.success' : 'providers.connection.failure')}</p>
        {detail && <p className="break-words">{detail}</p>}
      </div>
    </div>
  );
}
