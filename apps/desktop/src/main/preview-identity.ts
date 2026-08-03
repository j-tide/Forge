/**
 * Establish the preview's app identity before importing services with module-level
 * singletons. In particular, ProjectStore reads userData during module evaluation.
 */
import { app } from 'electron';
import { mkdirSync } from 'fs';
import { isAbsolute, join } from 'path';

export const PREVIEW_APP_NAME = 'Forge Glass Preview';
export const PREVIEW_APP_ID = 'dev.iamzjt.forgeglasspreview';

app.setName(PREVIEW_APP_NAME);

const testUserData = process.env.FORGE_GLASS_PREVIEW_USER_DATA_DIR;
const previewUserData = !app.isPackaged && process.env.NODE_ENV === 'test' && testUserData && isAbsolute(testUserData)
  ? testUserData
  : join(app.getPath('appData'), PREVIEW_APP_NAME);

mkdirSync(previewUserData, { recursive: true });
app.setPath('userData', previewUserData);

if (process.platform === 'darwin') {
  app.name = PREVIEW_APP_NAME;
}
