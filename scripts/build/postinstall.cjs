#!/usr/bin/env node
/**
 * Post-install script for Forge
 *
 * Build native modules locally when platform packages are not already present.
 * The derivative never downloads binaries from upstream app releases.
 */

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const appRoot = path.resolve(__dirname, '../..');

const isWindows = os.platform() === 'win32';

const WINDOWS_BUILD_TOOLS_HELP = `
================================================================================
  VISUAL STUDIO BUILD TOOLS REQUIRED
================================================================================

This preview builds native modules locally and requires Visual Studio Build Tools.

To install:

  1. Download Visual Studio Build Tools 2022:
     https://visualstudio.microsoft.com/visual-cpp-build-tools/

  2. Run installer and select:
     - "Desktop development with C++" workload

  3. In "Individual Components", also select:
     - "MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs"

  4. Restart your terminal and run: npm install

================================================================================
`;

/**
 * Get electron version from package.json
 */
function getElectronVersion() {
  const pkgPath = path.join(appRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const electronVersion = pkg.devDependencies?.electron || pkg.dependencies?.electron;
  if (!electronVersion) {
    return null;
  }
  // Strip leading ^ or ~ from version
  return electronVersion.replace(/^[\^~]/, '');
}

/**
 * Run electron-rebuild
 */
function runElectronRebuild() {
  return new Promise((resolve, reject) => {
    const npx = isWindows ? 'npx.cmd' : 'npx';
    const electronVersion = getElectronVersion();
    const args = ['electron-rebuild'];

    // Explicitly pass electron version if detected
    if (electronVersion) {
      args.push('-v', electronVersion);
      console.log(`[postinstall] Using Electron version: ${electronVersion}`);
    }

    const child = spawn(npx, args, {
      stdio: 'inherit',
      shell: isWindows,
      cwd: appRoot,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        reject(new Error(`electron-rebuild exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * Check if node-pty is already built
 */
function isNodePtyBuilt() {
  // Check traditional node-pty build location in this application.
  const localBuildDir = path.join(appRoot, 'node_modules', 'node-pty', 'build', 'Release');
  if (fs.existsSync(localBuildDir)) {
    const files = fs.readdirSync(localBuildDir);
    if (files.some((f) => f.endsWith('.node'))) return true;
  }

  // Check for @lydell/node-pty with platform-specific prebuilts
  const arch = os.arch();
  const platform = os.platform();
  const platformPkg = `@lydell/node-pty-${platform}-${arch}`;

  // Check this application's platform package.
  const localLydellDir = path.join(appRoot, 'node_modules', platformPkg);
  if (fs.existsSync(localLydellDir)) {
    const files = fs.readdirSync(localLydellDir);
    if (files.some((f) => f.endsWith('.node'))) return true;
  }

  return false;
}

/**
 * Main postinstall logic
 */
async function main() {
  console.log('[postinstall] Setting up native modules for Electron...\n');

  // If node-pty is already built (e.g., from a previous successful install), skip
  if (isNodePtyBuilt()) {
    console.log('[postinstall] Native modules already built, skipping rebuild.');
    return;
  }

  // Run electron-rebuild
  try {
    console.log('[postinstall] Running electron-rebuild...\n');
    await runElectronRebuild();
    console.log('\n[postinstall] Native modules built successfully!');
  } catch (error) {
    console.error('\n[postinstall] Failed to build native modules.\n');

    if (isWindows) {
      console.error(WINDOWS_BUILD_TOOLS_HELP);
    } else {
      console.error('Error:', error.message);
      console.error('\nYou may need to install build tools for your platform:');
      console.error('  macOS: xcode-select --install');
      console.error('  Linux: sudo apt-get install build-essential\n');
    }

    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[postinstall] Unexpected error:', err);
  process.exit(1);
});
