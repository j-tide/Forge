import type { CSSProperties } from 'react';
import { cn } from '../lib/utils';
import './ForgeBrand.css';

const forgeMarkUrl = new URL('../../../resources/branding/forge-mark.png', import.meta.url).href;

interface ForgeMarkProps {
  size?: 24 | 28 | 48 | 64;
  decorative?: boolean;
  className?: string;
}

/** One original mark, with its alpha silhouette shared by every interface theme. */
export function ForgeMark({ size = 28, decorative = false, className }: ForgeMarkProps) {
  return (
    <span
      className={cn('forge-brand-mark', className)}
      role="img"
      aria-label={decorative ? undefined : 'Forge'}
      aria-hidden={decorative ? true : undefined}
      style={{
        width: size,
        height: size,
        '--forge-mark-image': `url("${forgeMarkUrl}")`,
      } as CSSProperties}
    />
  );
}

interface ForgeBrandProps {
  showName?: boolean;
  size?: ForgeMarkProps['size'];
  className?: string;
}

/** Wordmark and icon are a single accessible identity, including collapsed navigation. */
export function ForgeBrand({ showName = true, size = 28, className }: ForgeBrandProps) {
  return (
    <span className={cn('forge-brand', className)}>
      <ForgeMark size={size} decorative={showName} />
      {showName && <span className="forge-brand-name">Forge</span>}
    </span>
  );
}
