const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(process.env.HOME, 'AppData', 'Local'),
  'electron-builder', 'Cache', 'winCodeSign'
);

const PROJECT_DIR = __dirname;

// Fix dylib symlinks in a directory
function fixDylibs(dir) {
  const libDir = path.join(dir, 'darwin', '10.12', 'lib');
  const pairs = [
    ['libcrypto.1.0.0.dylib', 'libcrypto.dylib'],
    ['libssl.1.0.0.dylib', 'libssl.dylib']
  ];
  for (const [src, dst] of pairs) {
    const srcPath = path.join(libDir, src);
    const dstPath = path.join(libDir, dst);
    try {
      if (fs.existsSync(srcPath)) {
        const dstStat = fs.existsSync(dstPath) ? fs.statSync(dstPath) : null;
        if (!dstStat || dstStat.size === 0) {
          fs.copyFileSync(srcPath, dstPath);
          console.log(`[fixer] Fixed ${dst}`);
        }
      }
    } catch (e) {}
  }
}

// Scan and fix all existing extraction directories
function scanAndFix() {
  try {
    const entries = fs.readdirSync(CACHE_DIR);
    for (const entry of entries) {
      if (/^\d+$/.test(entry)) {
        const dirPath = path.join(CACHE_DIR, entry);
        try {
          if (fs.statSync(dirPath).isDirectory()) {
            fixDylibs(dirPath);
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
}

// Watch for new directories and fix them immediately
let watching = true;
function watchCache() {
  try {
    fs.watch(CACHE_DIR, { persistent: true }, (eventType, filename) => {
      if (filename && /^\d+$/.test(filename)) {
        const dirPath = path.join(CACHE_DIR, filename);
        // Give extraction a moment to complete
        setTimeout(() => {
          try {
            if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
              fixDylibs(dirPath);
            }
          } catch (e) {}
        }, 500);
      }
    });
    console.log('[fixer] Watching cache directory:', CACHE_DIR);
  } catch (e) {
    console.log('[fixer] Could not watch cache directory:', e.message);
  }
}

// Also run a periodic scanner
const scanInterval = setInterval(scanAndFix, 1000);

// Start watching
watchCache();
scanAndFix(); // Initial scan

// Run electron-builder
console.log('[fixer] Starting electron-builder...');
const builder = spawn(
  process.execPath,
  [path.join(PROJECT_DIR, 'node_modules', 'electron-builder', 'cli.js'),
   '--win', 'portable', '--x64',
   '--config.win.sign=false',
   '--config.win.signAndEditExecutable=false'],
  {
    cwd: PROJECT_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false'
    }
  }
);

builder.on('close', (code) => {
  watching = false;
  clearInterval(scanInterval);
  console.log(`[fixer] electron-builder exited with code ${code}`);
  process.exit(code);
});
