/** Versioned, non-sensitive display choices scoped to the current browser profile. */
export const appearanceStorageKey = 'forge.appearance/v1';

export type AppearancePreferences = {
  theme: 'system' | 'light' | 'dark';
  reduceTransparency: boolean;
  reduceMotion: boolean;
};

const defaults: AppearancePreferences = {
  theme: 'system', reduceTransparency: false, reduceMotion: false,
};

export function appearanceStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; }
  catch { return null; }
}

export function readAppearance(storage: Storage | null): AppearancePreferences {
  if (!storage) return { ...defaults };
  try {
    const raw: unknown = JSON.parse(storage.getItem(appearanceStorageKey) ?? 'null');
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ...defaults };
    const value = raw as Record<string, unknown>;
    if (value.theme !== 'system' && value.theme !== 'light' && value.theme !== 'dark') {
      return { ...defaults };
    }
    if (typeof value.reduceTransparency !== 'boolean' ||
        typeof value.reduceMotion !== 'boolean') return { ...defaults };
    return { theme: value.theme, reduceTransparency: value.reduceTransparency,
      reduceMotion: value.reduceMotion };
  } catch { return { ...defaults }; }
}

export function writeAppearance(
  storage: Storage | null, value: AppearancePreferences,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(appearanceStorageKey, JSON.stringify(value));
    return true;
  } catch { return false; }
}
