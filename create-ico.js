const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectDir = __dirname;
const srcPng = path.join(projectDir, '..', 'vibe_images', 'pixelpal-icon_1781578743.png');
const icoPath = path.join(projectDir, 'build', 'icon.ico');
const resizedPng = path.join(projectDir, 'build', 'icon-256.png');
const trayPng = path.join(projectDir, 'assets', 'icons', 'tray-icon.png');

// Use PowerShell .NET to resize the PNG to 256x256 and 32x32
console.log('Resizing icon to 256x256...');
execSync(`powershell -Command "Add-Type -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('${srcPng.replace(/'/g, "''")}'); $bmp = New-Object System.Drawing.Bitmap 256,256; $g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; $g.DrawImage($img, 0, 0, 256, 256); $bmp.Save('${resizedPng.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose(); $img.Dispose();"`, { stdio: 'inherit' });

console.log('Creating tray icon 32x32...');
execSync(`powershell -Command "Add-Type -AssemblyName System.Drawing; $img = [System.Drawing.Image]::FromFile('${srcPng.replace(/'/g, "''")}'); $bmp = New-Object System.Drawing.Bitmap 32,32; $g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; $g.DrawImage($img, 0, 0, 32, 32); $bmp.Save('${trayPng.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose(); $img.Dispose();"`, { stdio: 'inherit' });

// Read the resized 256x256 PNG
const pngData = fs.readFileSync(resizedPng);

// Parse PNG dimensions
if (pngData[0] !== 0x89 || pngData[1] !== 0x50) {
  console.error('Not a valid PNG');
  process.exit(1);
}
const width = pngData.readUInt32BE(16);
const height = pngData.readUInt32BE(20);
console.log(`Resized PNG: ${width}x${height}, ${pngData.length} bytes`);

// Create ICO with single 256x256 PNG entry
const numImages = 1;
const headerSize = 6;
const dirEntrySize = 16;
const dataOffset = headerSize + dirEntrySize * numImages;

const ico = Buffer.alloc(dataOffset + pngData.length);
let off = 0;

// ICO Header
ico.writeUInt16LE(0, off); off += 2;
ico.writeUInt16LE(1, off); off += 2;
ico.writeUInt16LE(numImages, off); off += 2;

// Directory entry for 256x256 PNG
ico.writeUInt8(0, off); off += 1;   // Width 0 = 256
ico.writeUInt8(0, off); off += 1;   // Height 0 = 256
ico.writeUInt8(0, off); off += 1;   // Color palette
ico.writeUInt8(0, off); off += 1;   // Reserved
ico.writeUInt16LE(1, off); off += 2;
ico.writeUInt16LE(32, off); off += 2;
ico.writeUInt32LE(pngData.length, off); off += 4;
ico.writeUInt32LE(dataOffset, off); off += 4;

// PNG data
pngData.copy(ico, dataOffset);

// Write ICO
fs.mkdirSync(path.dirname(icoPath), { recursive: true });
fs.mkdirSync(path.dirname(trayPng), { recursive: true });
fs.writeFileSync(icoPath, ico);
console.log(`ICO created: ${icoPath} (${ico.length} bytes)`);
console.log(`Tray icon: ${trayPng}`);
console.log('Done!');
