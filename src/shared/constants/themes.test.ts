import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS } from './config';
import { COLOR_THEMES } from './themes';

describe('Forge Glass theme defaults', () => {
  it('offers the new palette while retaining every existing theme', () => {
    const ids = COLOR_THEMES.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      'default', 'dusk', 'lime', 'ocean', 'retro', 'neo', 'forest', 'forge-glass'
    ]));
    expect(COLOR_THEMES.find(({ id }) => id === 'forge-glass')?.previewColors).toMatchObject({
      bg: '#F5F6F8',
      accent: '#426FD0',
      darkBg: '#171A20'
    });
  });

  it('starts new installs in light Forge Glass and lets saved preferences win', () => {
    expect(DEFAULT_APP_SETTINGS.theme).toBe('light');
    expect(DEFAULT_APP_SETTINGS.colorTheme).toBe('forge-glass');

    const savedSettings = { theme: 'dark' as const, colorTheme: 'ocean' as const };
    expect({ ...DEFAULT_APP_SETTINGS, ...savedSettings }).toMatchObject(savedSettings);
  });
});
