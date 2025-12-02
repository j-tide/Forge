import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

const focusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useOverlayFocus(open: Ref<boolean>, panel: Ref<HTMLElement | null>, close: () => void): void {
  let returnTo: HTMLElement | null = null;
  const background = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('#app');
  watch(open, async (isOpen) => {
    if (isOpen) {
      returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (background) background.inert = true;
      await nextTick();
      const candidates = [...(panel.value?.querySelectorAll<HTMLElement>(focusable) ?? [])];
      (candidates[0] ?? panel.value)?.focus();
    } else {
      if (background) background.inert = false;
      await nextTick();
      if (returnTo?.isConnected) returnTo.focus();
      returnTo = null;
    }
  }, { flush: 'post' });

  function onKeyDown(event: KeyboardEvent): void {
    if (!open.value) return;
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
    if (open.value && panel.value && !panel.value.contains(event.target as Node)) {
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
    if (background) background.inert = false;
  });
}
