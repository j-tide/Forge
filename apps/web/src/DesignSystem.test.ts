import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, type App as VueApp } from 'vue';
import {
  ForgeButton, ForgeIconButton, ForgeInput, ForgeCard, GlassSurface, StatusTag, ForgeTabs, ForgeDialog, ForgeDrawer, ForgePopover,
} from '@forge/ui';

let app: VueApp | undefined;
let container: HTMLDivElement | undefined;
function mount(render: () => ReturnType<typeof h>, appRoot = false): HTMLDivElement {
  container = document.createElement('div');
  if (appRoot) container.id = 'app';
  document.body.append(container);
  app = createApp({ render });
  app.mount(container);
  return container;
}
afterEach(() => { app?.unmount(); container?.remove(); document.querySelectorAll('.forge-overlay').forEach((node) => node.remove()); app = undefined; container = undefined; });

describe('Forge UI primitives', () => {
  it('gives an icon-only control an accessible name and selected state', () => {
    const root = mount(() => h(ForgeIconButton, { label: 'Open settings', selected: true }, () => '◇'));
    const button = root.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Open settings');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('uses native buttons for interactive cards and glass surfaces', () => {
    const root = mount(() => h('div', [
      h(ForgeCard, { variant: 'interactive' }, () => 'Open card'),
      h(GlassSurface, { interactive: true, selected: true }, () => 'Selected surface'),
    ]));
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Open card', 'Selected surface']);
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders button variants and keeps disabled/loading controls inoperable', () => {
    const root = mount(() => h('div', [
      h(ForgeButton, { variant: 'primary' }, () => 'Primary'),
      h(ForgeButton, { variant: 'danger', disabled: true }, () => 'Danger'),
      h(ForgeButton, { loading: true }, () => 'Loading'),
    ]));
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons[0]?.classList.contains('forge-button--primary')).toBe(true);
    expect(buttons[1]?.disabled).toBe(true);
    expect(buttons[2]?.disabled).toBe(true);
    expect(buttons[2]?.getAttribute('aria-busy')).toBe('true');
  });

  it('links field validation to the input and includes status text', () => {
    const value = ref('');
    const root = mount(() => h('div', [
      h(ForgeInput, { label: 'Name', modelValue: value.value, 'onUpdate:modelValue': (next: string) => { value.value = next; }, error: 'Required' }),
      h(StatusTag, { tone: 'danger', label: 'Unavailable' }),
    ]));
    const input = root.querySelector('input')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(root.querySelector(`#${input.getAttribute('aria-describedby')}`)?.textContent).toBe('Required');
    expect(root.querySelector('.forge-status-tag')?.textContent).toContain('Unavailable');
  });

  it('moves tabs with arrow keys while skipping disabled items', async () => {
    const value = ref('one');
    const root = mount(() => h(ForgeTabs, {
      tabs: [{ id: 'one', label: 'One' }, { id: 'skip', label: 'Skip', disabled: true }, { id: 'two', label: 'Two' }],
      label: 'Views', modelValue: value.value, 'onUpdate:modelValue': (next: string) => { value.value = next; },
    }, { default: () => value.value }));
    const first = root.querySelector<HTMLButtonElement>('[role="tab"]')!;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await nextTick();
    expect(value.value).toBe('two');
    expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Two');
    expect(document.activeElement?.textContent).toBe('Two');
  });

  it('traps Tab, closes dialog on Escape, and restores trigger focus', async () => {
    const open = ref(false);
    mount(() => h('div', [
      h('button', { id: 'dialog-trigger', onClick: () => { open.value = true; } }, 'Open'),
      h(ForgeDialog, { title: 'Example', open: open.value, 'onUpdate:open': (next: boolean) => { open.value = next; } }, {
        default: () => [h('button', { id: 'dialog-first' }, 'First'), h('button', { id: 'dialog-last' }, 'Last')],
      }),
    ]));
    const trigger = document.querySelector<HTMLButtonElement>('#dialog-trigger')!;
    trigger.focus(); trigger.click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    const last = document.querySelector<HTMLButtonElement>('#dialog-last')!;
    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('关闭对话框');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    await nextTick();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes the drawer with its button and restores focus', async () => {
    const open = ref(false);
    mount(() => h('div', [
      h('button', { id: 'drawer-trigger', onClick: () => { open.value = true; } }, 'Open drawer'),
      h(ForgeDrawer, { title: 'Sheet', open: open.value, 'onUpdate:open': (next: boolean) => { open.value = next; } }, { default: () => h('p', 'Content') }),
    ]));
    const trigger = document.querySelector<HTMLButtonElement>('#drawer-trigger')!;
    trigger.focus(); trigger.click();
    await vi.waitFor(() => expect(document.querySelector('.forge-drawer')).not.toBeNull());
    document.querySelector<HTMLButtonElement>('[aria-label="关闭抽屉"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('.forge-drawer')).toBeNull());
    await nextTick();
    expect(document.activeElement).toBe(trigger);
  });

  it('restores focus when the parent unmounts a closing drawer', async () => {
    const open = ref(false);
    const root = mount(() => h('div', [
      h('article', { id: 'task-trigger', tabindex: 0, onClick: () => { open.value = true; } }, 'Task'),
      open.value ? h(ForgeDrawer, { title: 'Task', open: open.value,
        'onUpdate:open': (next: boolean) => { open.value = next; } },
      { default: () => h('p', 'Details') }) : null,
    ]));
    const trigger = root.querySelector<HTMLElement>('#task-trigger')!;
    trigger.focus(); trigger.click();
    await vi.waitFor(() => expect(document.querySelector('.forge-drawer')).not.toBeNull());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('.forge-drawer')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps the app inert until the last nested overlay closes', async () => {
    const outer = ref(false);
    const inner = ref(false);
    const root = mount(() => h('div', [
      h('button', { id: 'outer-trigger', onClick: () => { outer.value = true; } }, 'Open outer'),
      h(ForgeDialog, { title: 'Outer', open: outer.value,
        'onUpdate:open': (value: boolean) => { outer.value = value; } }, {
        default: () => [
          h('button', { id: 'inner-trigger', onClick: () => { inner.value = true; } }, 'Open inner'),
          h(ForgeDialog, { title: 'Inner', open: inner.value,
            'onUpdate:open': (value: boolean) => { inner.value = value; } },
          { default: () => h('button', 'Inner action') }),
        ],
      }),
    ]), true);
    const trigger = root.querySelector<HTMLButtonElement>('#outer-trigger')!;
    trigger.focus(); trigger.click();
    await vi.waitFor(() => expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1));
    expect(root.inert).toBe(true);
    document.querySelector<HTMLButtonElement>('#inner-trigger')!.click();
    await vi.waitFor(() => expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2));
    expect(root.inert).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.waitFor(() => expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1));
    expect(root.inert).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.waitFor(() => expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0));
    expect(root.inert).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('closes a popover on Escape and returns focus to its trigger', async () => {
    const open = ref(false);
    const root = mount(() => h(ForgePopover, { label: 'Details', open: open.value, 'onUpdate:open': (next: boolean) => { open.value = next; } }, {
      trigger: () => 'Open details', default: () => h('p', 'Popover content'),
    }));
    const trigger = root.querySelector<HTMLButtonElement>('button')!;
    trigger.click();
    await nextTick();
    expect(root.querySelector('[role="dialog"]')?.textContent).toContain('Popover content');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
