/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppearancePreferences } from '../useAppearancePreferences';

function mediaPreference(initial = false) {
  const listeners = new Set<() => void>();
  const query = {
    matches: initial,
    addEventListener: vi.fn((_type: string, callback: () => void) => listeners.add(callback)),
    removeEventListener: vi.fn((_type: string, callback: () => void) => listeners.delete(callback)),
  };
  return {
    query,
    change(value: boolean) {
      query.matches = value;
      for (const callback of listeners) callback();
    },
    get listenerCount() { return listeners.size; },
  };
}

let motion: ReturnType<typeof mediaPreference>;
let transparency: ReturnType<typeof mediaPreference>;
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

beforeEach(() => {
  motion = mediaPreference();
  transparency = mediaPreference();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => (
      query.includes('transparency') ? transparency.query : motion.query
    ) as unknown as MediaQueryList),
  });
});
afterEach(() => {
  cleanup();
  if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
  else Reflect.deleteProperty(window, 'matchMedia');
});

describe('Appearance accessibility preferences', () => {
  it('keeps the normal appearance when no user or system reduction is set', () => {
    const { result } = renderHook(() => useAppearancePreferences({}));
    expect(result.current).toEqual({ reduceMotion: false, reduceTransparency: false });
    expect(document.documentElement.dataset.reduceMotion).toBe('false');
    expect(document.documentElement.dataset.reduceTransparency).toBe('false');
  });

  it('applies saved preferences and updates them without changing the theme', () => {
    document.documentElement.classList.add('dark');
    const { result, rerender } = renderHook((preferences) => useAppearancePreferences(preferences), {
      initialProps: { reduceMotion: true, reduceTransparency: true },
    });
    expect(result.current).toEqual({ reduceMotion: true, reduceTransparency: true });
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
    expect(document.documentElement.dataset.reduceTransparency).toBe('true');
    rerender({ reduceMotion: false, reduceTransparency: false });
    expect(result.current).toEqual({ reduceMotion: false, reduceTransparency: false });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    document.documentElement.classList.remove('dark');
  });

  it('respects system changes even when both user switches are off', () => {
    const { result } = renderHook(() => useAppearancePreferences({ reduceMotion: false, reduceTransparency: false }));
    act(() => { motion.change(true); transparency.change(true); });
    expect(result.current).toEqual({ reduceMotion: true, reduceTransparency: true });
    act(() => { motion.change(false); transparency.change(false); });
    expect(result.current).toEqual({ reduceMotion: false, reduceTransparency: false });
  });

  it('keeps user reductions on when the system reduction is turned off', () => {
    motion.query.matches = true;
    transparency.query.matches = true;
    const { result } = renderHook(() => useAppearancePreferences({ reduceMotion: true, reduceTransparency: true }));
    act(() => { motion.change(false); transparency.change(false); });
    expect(result.current).toEqual({ reduceMotion: true, reduceTransparency: true });
  });

  it('removes both media listeners and DOM attributes on unmount', () => {
    const { unmount } = renderHook(() => useAppearancePreferences({ reduceMotion: true }));
    expect(motion.listenerCount).toBe(1);
    expect(transparency.listenerCount).toBe(1);
    unmount();
    expect(motion.listenerCount).toBe(0);
    expect(transparency.listenerCount).toBe(0);
    expect(document.documentElement.hasAttribute('data-reduce-motion')).toBe(false);
    expect(document.documentElement.hasAttribute('data-reduce-transparency')).toBe(false);
  });
});
