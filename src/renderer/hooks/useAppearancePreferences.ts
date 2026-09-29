import { useEffect, useState } from 'react';
import type { AppSettings } from '../../shared/types';

type AppearancePreferences = Pick<AppSettings, 'reduceMotion' | 'reduceTransparency'>;

const MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)';

/** Apply accessibility preferences without allowing an app setting to override the OS. */
export function useAppearancePreferences(settings: AppearancePreferences) {
  const [systemPreferences, setSystemPreferences] = useState(() => ({
    reduceMotion: window.matchMedia(MOTION_QUERY).matches,
    reduceTransparency: window.matchMedia(TRANSPARENCY_QUERY).matches,
  }));

  useEffect(() => {
    const motion = window.matchMedia(MOTION_QUERY);
    const transparency = window.matchMedia(TRANSPARENCY_QUERY);
    const update = () => setSystemPreferences({
      reduceMotion: motion.matches,
      reduceTransparency: transparency.matches,
    });
    update();
    motion.addEventListener('change', update);
    transparency.addEventListener('change', update);
    return () => {
      motion.removeEventListener('change', update);
      transparency.removeEventListener('change', update);
    };
  }, []);

  const reduceMotion = settings.reduceMotion === true || systemPreferences.reduceMotion;
  const reduceTransparency = settings.reduceTransparency === true || systemPreferences.reduceTransparency;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-reduce-motion', String(reduceMotion));
    root.setAttribute('data-reduce-transparency', String(reduceTransparency));
    return () => {
      root.removeAttribute('data-reduce-motion');
      root.removeAttribute('data-reduce-transparency');
    };
  }, [reduceMotion, reduceTransparency]);

  return { reduceMotion, reduceTransparency };
}
