import type { KeyboardEvent } from 'react';

/** Move among available results without stealing cursor keys from custom-ID fields. */
export function navigateModelPicker(event: KeyboardEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement;
  const fromSearch = target.hasAttribute('data-model-search');
  const fromOption = target.hasAttribute('data-model-option');
  if ((!fromSearch && !fromOption) || event.nativeEvent.isComposing) return;
  if (!['ArrowDown', 'ArrowUp', ...(fromOption ? ['Home', 'End'] : [])].includes(event.key)) return;
  const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-model-option]:not([disabled])'));
  if (!options.length) return;
  const current = options.indexOf(target as HTMLButtonElement);
  const next = event.key === 'Home' ? 0
    : event.key === 'End' ? options.length - 1
    : current < 0 ? event.key === 'ArrowDown' ? 0 : options.length - 1
    : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
  event.preventDefault();
  options[next].focus();
  options[next].scrollIntoView({ block: 'nearest' });
}
