import { useTranslation } from 'react-i18next';
/**
 * Success banner shown after successful import
 */

import { CheckCircle2 } from 'lucide-react';
import { Button } from '../../ui/button';
import type { LinearImportResult } from '../types';

interface ImportSuccessBannerProps {
  importResult: LinearImportResult;
  onClose: () => void;
}

export function ImportSuccessBanner({ importResult, onClose }: ImportSuccessBannerProps) {
  const { t } = useTranslation('uiIntegrations');
  return (
    <div className="rounded-lg bg-success/10 border border-success/30 p-4 flex items-center gap-3">
      <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-success">
          {t('uiIntegrations:linear.importSuccess', { count: importResult.imported })}
        </p>
        <p className="text-xs text-success/80 mt-1">
          {t('uiIntegrations:linear.processingHint')}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onClose}>
        {t('uiIntegrations:linear.close')}
      </Button>
    </div>
  );
}
