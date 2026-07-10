import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import App from './App.vue';

let mounted: VueApp | undefined;
let root: HTMLDivElement | undefined;

afterEach(() => {
  mounted?.unmount();
  root?.remove();
  mounted = undefined;
  root = undefined;
  delete window.forge;
});

describe('desktop settings categories', () => {
  it('shows one category at a time and keeps unavailable Host operations disabled', async () => {
    delete window.forge;
    root = document.createElement('div');
    document.body.append(root);
    mounted = createApp(App);
    mounted.mount(root);

    root.querySelector<HTMLButtonElement>('button[aria-label="设置"]')?.click();
    await nextTick();
    const categories = root.querySelector<HTMLElement>('nav[aria-label="设置分类"]')!;
    const appearance = root.querySelector<HTMLElement>('#settings-panel-appearance')!;
    const environment = root.querySelector<HTMLElement>('#settings-panel-environment')!;
    const data = root.querySelector<HTMLElement>('#settings-panel-data')!;
    const access = root.querySelector<HTMLElement>('#settings-panel-access')!;
    expect(appearance.style.display).not.toBe('none');
    expect(environment.style.display).toBe('none');
    expect(data.style.display).toBe('none');
    expect(access.style.display).toBe('none');

    categories.querySelector<HTMLButtonElement>('button[aria-controls="settings-panel-environment"]')?.click();
    await nextTick();
    expect(appearance.style.display).toBe('none');
    expect(environment.style.display).not.toBe('none');
    expect(environment.textContent).toContain('本机依赖检测需要 Forge Desktop');
    expect(categories.querySelector('[aria-current="page"]')?.getAttribute('aria-controls'))
      .toBe('settings-panel-environment');

    categories.querySelector<HTMLButtonElement>('button[aria-controls="settings-panel-data"]')?.click();
    await nextTick();
    expect(data.style.display).not.toBe('none');
    expect(root.querySelector<HTMLButtonElement>('[data-testid="database-backup"] button')?.disabled)
      .toBe(true);

    categories.querySelector<HTMLButtonElement>('button[aria-controls="settings-panel-access"]')?.click();
    await nextTick();
    expect(access.style.display).not.toBe('none');
    expect(access.textContent).toContain('状态未确认');
    expect(access.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
  });
});
