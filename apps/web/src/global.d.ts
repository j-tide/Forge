import type { ForgeDesktopBridge } from '@forge/contracts';

declare global {
  interface Window {
    forge?: ForgeDesktopBridge;
  }
}
