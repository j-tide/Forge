/** Keep internal ad-hoc QA bundles away from the normal Forge data profile. */
import { lstatSync, readFileSync, type Stats } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const MARKER = 'FORGE_INTERNAL_TEST_BUILD';
const ID = /^[a-f0-9]{16}$/;

export function internalQaAppData(
  resourcesPath: string, defaultAppData: string, override?: string,
): string | null {
  const marker = join(resourcesPath, MARKER);
  let status: Stats;
  try { status = lstatSync(marker); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw new Error('Internal QA marker is invalid', { cause: error });
  }
  if (!status.isFile() || status.size > 512) throw new Error('Internal QA marker is invalid');
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(marker, 'utf8')); }
  catch { throw new Error('Internal QA marker is invalid'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) ||
    Object.keys(raw).sort().join(',') !== 'kind,qaId' ||
    !('kind' in raw) || raw.kind !== 'internal-qa' ||
    !('qaId' in raw) || typeof raw.qaId !== 'string' || !ID.test(raw.qaId)) {
    throw new Error('Internal QA marker is invalid');
  }
  if (override !== undefined) {
    if (!isAbsolute(override)) throw new Error('Internal test home must be absolute');
    return override;
  }
  return join(defaultAppData, 'Forge Internal QA', raw.qaId);
}
