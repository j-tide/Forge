/** Keep global navigation shortcuts out of modal flows and focused controls. */
export function shouldIgnoreNavigationShortcut(
  event: KeyboardEvent,
  options: { settingsActive?: boolean; allowTerminalTextarea?: boolean; blockInteractiveControls?: boolean } = {}
): boolean {
  if (options.settingsActive || event.defaultPrevented || event.isComposing || event.repeat) return true;
  if (document.querySelector('[role="dialog"]:not([hidden]):not([aria-hidden="true"]), [role="alertdialog"]:not([hidden]):not([aria-hidden="true"])')) return true;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[inert]')) return true;
  // The terminal explicitly forwards modifier tab shortcuts; modal/settings guards still apply.
  if (options.allowTerminalTextarea && target.classList.contains('xterm-helper-textarea')) return false;
  if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="combobox"], [role="textbox"]')) return true;
  return options.blockInteractiveControls !== false && Boolean(target.closest('button, a, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="slider"], [role="switch"]'));
}
