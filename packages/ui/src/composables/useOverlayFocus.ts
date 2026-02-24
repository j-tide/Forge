import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const overlayStack: symbol[] = [];
const inertCounts = new WeakMap<HTMLElement, number>();

export function useOverlayFocus(open: Ref<boolean>, panel: Ref<HTMLElement | null>, close: () => void,
  initialFocus?: string): void {
  let returnTo: HTMLElement | null = null;
  const background = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('#app');
  const identity = Symbol('forge-overlay');
  let active = false;
  function release(): void {
    if (!active) return;
    active = false;
    const position = overlayStack.lastIndexOf(identity);
    if (position !== -1) overlayStack.splice(position, 1);
    if (background) {
      const count = Math.max(0, (inertCounts.get(background) ?? 1) - 1);
      if (count) inertCounts.set(background, count);
      else { inertCounts.delete(background); background.inert = false; }
    }
  }
  watch(open, async (isOpen) => {
    if (isOpen) {
      returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!active) {
        active = true;
        overlayStack.push(identity);
        if (background) {
          inertCounts.set(background, (inertCounts.get(background) ?? 0) + 1);
          background.inert = true;
        }
      }
      await nextTick();
      if (!open.value || overlayStack.at(-1) !== identity) return;
      const candidates = [...(panel.value?.querySelectorAll<HTMLElement>(focusable) ?? [])];
      ((initialFocus ? panel.value?.querySelector<HTMLElement>(initialFocus) : null) ??
        candidates[0] ?? panel.value)?.focus();
    } else {
      if (!active && returnTo === null) return;
      release();
      await nextTick();
      if (open.value) return;
      if (returnTo?.isConnected) returnTo.focus();
      returnTo = null;
    }
  }, { flush: 'post', immediate: true });

  function onKeyDown(event: KeyboardEvent): void {
    if (!open.value || overlayStack.at(-1) !== identity) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab' || !panel.value) return;
    const candidates = [...panel.value.querySelectorAll<HTMLElement>(focusable)].filter((element) => element.getClientRects().length || element.offsetParent !== null);
    // Headless DOMs have no layout boxes, but a real browser always does.
    const items = candidates.length ? candidates : [...panel.value.querySelectorAll<HTMLElement>(focusable)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) { event.preventDefault(); panel.value.focus(); return; }
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function onFocusIn(event: FocusEvent): void {
    if (open.value && overlayStack.at(-1) === identity && panel.value && !panel.value.contains(event.target as Node)) {
      (panel.value.querySelector<HTMLElement>(focusable) ?? panel.value).focus();
    }
  }

  watch(open, (isOpen) => {
    if (isOpen) { document.addEventListener('keydown', onKeyDown); document.addEventListener('focusin', onFocusIn); }
    else { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('focusin', onFocusIn); }
  }, { immediate: true });
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('focusin', onFocusIn);
    const restore = active && overlayStack.at(-1) === identity;
    release();
    if (restore && returnTo?.isConnected) returnTo.focus();
  });
}
