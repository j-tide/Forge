/**
 * Sentry Error Tracking for Main Process
 *
 * Initializes Sentry with:
 * - beforeSend hook for mid-session toggle support (no restart needed)
 * - Path masking for user privacy (shared with renderer)
 * - IPC listener for settings changes from renderer
 *
 * Privacy Note:
 * - Usernames are masked from all file paths
 * - Project paths remain visible for debugging (this is expected)
 * - Tags, contexts, extra data, and user info are all sanitized
 */

import * as Sentry from '@sentry/electron/main';
import { app, ipcMain } from 'electron';
import { readSettingsFile } from './settings-utils';
import { DEFAULT_APP_SETTINGS } from '../shared/constants';
import { IPC_CHANNELS } from '../shared/constants/ipc';
import {
  processEvent,
  PRODUCTION_TRACE_SAMPLE_RATE,
  type SentryErrorEvent
} from '../shared/utils/sentry-privacy';

/**
 * Build-time constants defined in electron.vite.config.ts
 * These are replaced at build time with actual values from environment variables.
 * In development, they come from .env file. In CI builds, from GitHub secrets.
 */
declare const __SENTRY_DSN__: string;
declare const __SENTRY_TRACES_SAMPLE_RATE__: string;
declare const __SENTRY_PROFILES_SAMPLE_RATE__: string;

// In-memory state for current setting (updated via IPC when user toggles)
let sentryEnabledState = false;

/**
 * Get Sentry DSN from build-time constant
 *
 * The DSN is embedded at build time via Vite's `define` option.
 * Only the derivative-specific DSN may enable reporting. Generic SENTRY_DSN
 * values inherited from an upstream build or shell are ignored.
 */
function getSentryDsn(): string {
  // __SENTRY_DSN__ is replaced at build time with the actual value
  // Falls back to runtime env var for development flexibility
  // typeof guard needed for test environments where Vite's define doesn't apply
  const buildTimeValue = typeof __SENTRY_DSN__ !== 'undefined' ? __SENTRY_DSN__ : '';
  return buildTimeValue || process.env.FORGE_GLASS_PREVIEW_SENTRY_DSN || '';
}

/**
 * Get trace sample rate from build-time constant
 * Controls performance monitoring sampling (0.0 to 1.0)
 * Default: 0.1 (10%) in production, 0 in development
 */
function getTracesSampleRate(): number {
  // Try build-time constant first, then runtime env var
  // typeof guard needed for test environments where Vite's define doesn't apply
  const buildTimeValue = typeof __SENTRY_TRACES_SAMPLE_RATE__ !== 'undefined' ? __SENTRY_TRACES_SAMPLE_RATE__ : '';
  const envValue = buildTimeValue || process.env.FORGE_GLASS_PREVIEW_SENTRY_TRACES_SAMPLE_RATE;
  if (envValue) {
    const parsed = parseFloat(envValue);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  // Default: 10% in production, 0 in dev
  return app.isPackaged ? PRODUCTION_TRACE_SAMPLE_RATE : 0;
}

/**
 * Get profile sample rate from build-time constant
 * Controls profiling sampling relative to traces (0.0 to 1.0)
 * Default: 0.1 (10%) in production, 0 in development
 */
function getProfilesSampleRate(): number {
  // Try build-time constant first, then runtime env var
  // typeof guard needed for test environments where Vite's define doesn't apply
  const buildTimeValue = typeof __SENTRY_PROFILES_SAMPLE_RATE__ !== 'undefined' ? __SENTRY_PROFILES_SAMPLE_RATE__ : '';
  const envValue = buildTimeValue || process.env.FORGE_GLASS_PREVIEW_SENTRY_PROFILES_SAMPLE_RATE;
  if (envValue) {
    const parsed = parseFloat(envValue);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  // Default: 10% in production, 0 in dev
  return app.isPackaged ? PRODUCTION_TRACE_SAMPLE_RATE : 0;
}

// Cache config so renderer can access it via IPC
let cachedDsn: string = '';
let cachedTracesSampleRate: number = 0;
let cachedProfilesSampleRate: number = 0;
let sentryClientInitialized = false;

function startSentryMain(): void {
  if (sentryClientInitialized || !sentryEnabledState || !cachedDsn ||
      (!app.isPackaged && process.env.SENTRY_DEV !== 'true')) {
    return;
  }

  Sentry.init({
    dsn: cachedDsn,
    environment: app.isPackaged ? 'production' : 'development',
    release: `forge-glass-preview@${app.getVersion()}`,

    beforeSend(event: Sentry.ErrorEvent) {
      if (!sentryEnabledState) {
        return null;
      }
      return processEvent(event as SentryErrorEvent) as Sentry.ErrorEvent;
    },

    beforeSendTransaction(event: Sentry.ErrorEvent) {
      if (!sentryEnabledState) {
        return null;
      }
      return processEvent(event as SentryErrorEvent) as Sentry.ErrorEvent;
    },

    tracesSampleRate: cachedTracesSampleRate,
    profilesSampleRate: cachedProfilesSampleRate,
    sendClientReports: false,
  });
  sentryClientInitialized = true;
}

function stopSentryMain(): void {
  if (!sentryClientInitialized) {
    return;
  }
  sentryClientInitialized = false;
  void Sentry.close(0).catch((error) => {
    console.warn('[Sentry] Failed to close error reporting client:', error);
  });
}

/**
 * Initialize Sentry for the main process
 * Called early in app startup, before window creation
 */
export function initSentryMain(): void {
  // Get configuration from environment variables
  cachedDsn = getSentryDsn();
  cachedTracesSampleRate = getTracesSampleRate();
  cachedProfilesSampleRate = getProfilesSampleRate();

  // Read initial setting from disk synchronously
  const savedSettings = readSettingsFile();
  const settings = { ...DEFAULT_APP_SETTINGS, ...savedSettings };
  sentryEnabledState = settings.sentryEnabled ?? false;

  // No SDK client is initialized until both the preview DSN and user opt-in exist.
  const hasDsn = cachedDsn.length > 0;

  if (!hasDsn) {
    console.log('[Sentry] No Forge Glass Preview DSN configured - error reporting disabled');
  }

  startSentryMain();

  // Listen for settings changes from renderer process
  ipcMain.on(IPC_CHANNELS.SENTRY_STATE_CHANGED, (_event, enabled: boolean) => {
    setSentryEnabled(enabled);
  });

  // IPC handler for renderer to get Sentry config
  ipcMain.handle(IPC_CHANNELS.GET_SENTRY_DSN, () => {
    return cachedDsn;
  });

  ipcMain.handle(IPC_CHANNELS.GET_SENTRY_CONFIG, () => {
    return {
      dsn: cachedDsn,
      tracesSampleRate: cachedTracesSampleRate,
      profilesSampleRate: cachedProfilesSampleRate,
    };
  });

  if (hasDsn && sentryClientInitialized) {
    console.log(`[Sentry] Main process initialized (traces: ${cachedTracesSampleRate}, profiles: ${cachedProfilesSampleRate})`);
  }
}

/**
 * Get current Sentry enabled state
 */
export function isSentryEnabled(): boolean {
  return sentryEnabledState;
}

/**
 * Set Sentry enabled state programmatically
 */
export function setSentryEnabled(enabled: boolean): void {
  sentryEnabledState = enabled === true;
  if (sentryEnabledState) {
    startSentryMain();
  } else {
    stopSentryMain();
  }
  console.log(`[Sentry] Error reporting ${sentryEnabledState ? 'enabled' : 'disabled'}`);
}

/**
 * Safely add a Sentry breadcrumb, ignoring errors if Sentry is not initialized.
 * Use this instead of raw `Sentry.addBreadcrumb()` to avoid try/catch boilerplate.
 */
export function safeBreadcrumb(breadcrumb: SentryBreadcrumb): void {
  try {
    Sentry.addBreadcrumb(breadcrumb);
  } catch { /* Sentry not initialized */ }
}

/**
 * Safely capture a Sentry exception, ignoring errors if Sentry is not initialized.
 * Use this instead of raw `Sentry.captureException()` to avoid try/catch boilerplate.
 */
export function safeCaptureException(error: Error, context?: SentryCaptureContext): void {
  try {
    Sentry.captureException(error, context);
  } catch { /* Sentry not initialized */ }
}

/**
 * Get Sentry environment variables for passing to Python subprocesses
 *
 * This returns the build-time embedded values so that Python backends
 * can also report errors to Sentry in packaged apps.
 *
 * Usage:
 * ```typescript
 * const env = { ...getAugmentedEnv(), ...getSentryEnvForSubprocess() };
 * spawn(pythonPath, args, { env });
 * ```
 */
export function getSentryEnvForSubprocess(): Record<string, string> {
  const dsn = getSentryDsn();
  if (!dsn || !sentryEnabledState) {
    return {};
  }

  return {
    SENTRY_DSN: dsn,
    SENTRY_TRACES_SAMPLE_RATE: String(getTracesSampleRate()),
    SENTRY_PROFILES_SAMPLE_RATE: String(getProfilesSampleRate()),
  };
}
