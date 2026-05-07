/** Optional native adapters for a future mobile shell. No adapter is installed in the PWA. */

export type MobileCapability<T> = Readonly<
  | { available: false; reason: 'native-adapter-unavailable' }
  | { available: true; port: T }
>;

export interface NativePushPort {
  /** Must be called only after a user gesture; a push is an invalidation, never command success. */
  requestPermission(): Promise<'granted' | 'denied'>;
  onWake(listener: () => void): () => void;
}

export interface NativeSecureStorePort {
  /** The UI can inspect protection and revoke its own session, never read raw secrets. */
  protectionStatus(): Promise<'protected' | 'locked' | 'unavailable'>;
  clearSession(): Promise<void>;
}

export interface NativeScannerPort {
  /** Scanned text is untrusted and must still pass Host pairing and Desktop approval. */
  scanPairingCode(): Promise<string | null>;
}

export interface MobilePlatformBridge {
  readonly kind: 'web' | 'native';
  readonly push: MobileCapability<NativePushPort>;
  readonly secureStore: MobileCapability<NativeSecureStorePort>;
  readonly scanner: MobileCapability<NativeScannerPort>;
}

const unavailable = Object.freeze({ available: false,
  reason: 'native-adapter-unavailable' } as const);

/** The browser build never invents push, Keychain/Keystore or camera capability. */
export const browserMobilePlatformBridge: MobilePlatformBridge = Object.freeze({
  kind: 'web', push: unavailable, secureStore: unavailable, scanner: unavailable,
});
