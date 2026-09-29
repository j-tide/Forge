/**
 * Helper utilities for Electron E2E tests
 * Provides utilities for launching and interacting with the Electron app
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'path';

const testProfiles = new WeakMap<ElectronApplication, string>();

export interface ElectronTestContext {
  app: ElectronApplication;
  page: Page;
}

/**
 * Launch the Electron application for testing
 */
export async function launchElectronApp(): Promise<ElectronTestContext> {
  // Path to the built Electron app
  const appPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const userDataDir = await mkdtemp(path.join(path.resolve(tmpdir()), 'forge-ui-e2e-'));
  let app: ElectronApplication | undefined;

  try {
    app = await electron.launch({
      args: [appPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        FORGE_GLASS_PREVIEW_USER_DATA_DIR: userDataDir
      }
    });
    testProfiles.set(app, userDataDir);

    // Wait for the main window to open
    const page = await app.firstWindow();

    // Wait for the app to be ready
    await page.waitForLoadState('domcontentloaded');

    return { app, page };
  } catch (error) {
    // A failed window/readiness wait still leaves a launched process to close.
    if (app) {
      try {
        await closeElectronApp(app);
      } catch (closeError) {
        throw new AggregateError([error, closeError], 'Electron startup and cleanup failed');
      }
    } else {
      await rm(userDataDir, { recursive: true, force: true });
    }
    throw error;
  }
}

/**
 * Close the Electron application
 */
export async function closeElectronApp(app: ElectronApplication): Promise<void> {
  await app.close();
  const userDataDir = testProfiles.get(app);
  if (userDataDir) {
    // Keep the profile if close fails; an active app must retain its data.
    await rm(userDataDir, { recursive: true, force: true });
    testProfiles.delete(app);
  }
}

/**
 * Wait for the app to be in a stable state
 */
export async function waitForAppReady(page: Page): Promise<void> {
  // Wait for the main content to be visible
  await page.waitForSelector('[data-testid="app-container"]', {
    timeout: 30000,
    state: 'visible'
  }).catch(() => {
    // If no testid, wait for any substantial content
    return page.waitForSelector('body', { timeout: 30000 });
  });
}

/**
 * Take a screenshot for debugging
 */
export async function takeDebugScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `./e2e/screenshots/${name}-${Date.now()}.png`,
    fullPage: true
  });
}

/**
 * Mock IPC responses for testing
 */
export function createMockIpcHandler(app: ElectronApplication): {
  mockProjectAdd: (response: unknown) => Promise<void>;
  mockProjectList: (projects: unknown[]) => Promise<void>;
  mockTaskCreate: (response: unknown) => Promise<void>;
  mockTaskList: (tasks: unknown[]) => Promise<void>;
} {
  return {
    async mockProjectAdd(response: unknown) {
      await app.evaluate(
        ({ ipcMain }, response) => {
          ipcMain.handle('project:add', () => response);
        },
        response
      );
    },

    async mockProjectList(projects: unknown[]) {
      await app.evaluate(
        ({ ipcMain }, projects) => {
          ipcMain.handle('project:list', () => ({
            success: true,
            data: projects
          }));
        },
        projects
      );
    },

    async mockTaskCreate(response: unknown) {
      await app.evaluate(
        ({ ipcMain }, response) => {
          ipcMain.handle('task:create', () => response);
        },
        response
      );
    },

    async mockTaskList(tasks: unknown[]) {
      await app.evaluate(
        ({ ipcMain }, tasks) => {
          ipcMain.handle('task:list', () => ({
            success: true,
            data: tasks
          }));
        },
        tasks
      );
    }
  };
}
