import { afterEach, describe, expect, it } from 'vitest';
import { appearanceStorageKey, readAppearance, writeAppearance } from './appearance-preferences';

afterEach(() => window.localStorage.removeItem(appearanceStorageKey));

describe('local appearance preferences', () => {
  it('restores valid display choices without a Host or Electron bridge', () => {
    expect(readAppearance(window.localStorage)).toEqual({
      theme: 'light', reduceTransparency: false, reduceMotion: false,
    });
    expect(writeAppearance(window.localStorage, {
      theme: 'dark', reduceTransparency: true, reduceMotion: true,
    })).toBe(true);
    expect(readAppearance(window.localStorage)).toEqual({
      theme: 'dark', reduceTransparency: true, reduceMotion: true,
    });
  });

  it('uses safe defaults for malformed, unsupported or inaccessible storage', () => {
    for (const invalid of [
      '{',
      JSON.stringify({ theme: 'neon', reduceTransparency: true, reduceMotion: true }),
      JSON.stringify({ theme: 'dark', reduceTransparency: 'yes', reduceMotion: true }),
    ]) {
      window.localStorage.setItem(appearanceStorageKey, invalid);
      expect(readAppearance(window.localStorage).theme).toBe('light');
    }
    const blocked = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    } as unknown as Storage;
    expect(readAppearance(blocked).reduceMotion).toBe(false);
    expect(writeAppearance(blocked, {
      theme: 'light', reduceTransparency: false, reduceMotion: true,
    })).toBe(false);
    expect(readAppearance(null).theme).toBe('light');
  });
});
