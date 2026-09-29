#!/usr/bin/env node
/**
 * Legacy command retained for callers of the upstream installer.
 * Forge has no trusted prebuild release feed, so this command
 * never downloads binaries. Use the local electron-rebuild path instead.
 */

async function downloadPrebuilds() {
  return { success: false, reason: 'no-preview-prebuild-feed' };
}

module.exports = { downloadPrebuilds };

if (require.main === module) {
  downloadPrebuilds().then((result) => {
    console.error(`[prebuilds] ${result.reason}; run npm run rebuild to build native modules locally.`);
    process.exitCode = 1;
  });
}
