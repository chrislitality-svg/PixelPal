Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile('C:\Users\Administrator\.qoderworkcn\workspace\mqexpwom1qyautw7\vibe_images\pixelpal-icon_1781587895.png')

# Create 256x256 for ICO
$bmp256 = New-Object System.Drawing.Bitmap 256, 256
$g256 = [System.Drawing.Graphics]::FromImage($bmp256)
$g256.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g256.DrawImage($src, 0, 0, 256, 256)
$g256.Dispose()

# Save as PNG stream
$pngStream = New-Object System.IO.MemoryStream
$bmp256.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $pngStream.ToArray()

# Build ICO file (PNG-in-ICO format)
$ico = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ico)

# ICO Header
$bw.Write([Int16]0)       # Reserved
$bw.Write([Int16]1)       # Type: ICO
$bw.Write([Int16]1)       # Count: 1 image

# ICO Directory Entry
$bw.Write([byte]0)        # Width (0 = 256)
$bw.Write([byte]0)        # Height (0 = 256)
$bw.Write([byte]0)        # Color palette
$bw.Write([byte]0)        # Reserved
$bw.Write([Int16]1)       # Color planes
$bw.Write([Int16]32)      # Bits per pixel
$bw.Write([Int32]$pngBytes.Length)  # Image data size
$bw.Write([Int32]22)      # Offset to image data (6+16)

# Image data (PNG)
$bw.Write($pngBytes)

# Save ICO
$icoBytes = $ico.ToArray()
[System.IO.File]::WriteAllBytes('C:\Users\Administrator\.qoderworkcn\workspace\mqexpwom1qyautw7\PixelPal\build\icon.ico', $icoBytes)
Write-Output ("ICO created: " + $icoBytes.Length + " bytes")

# Create 32x32 tray icon
$bmp32 = New-Object System.Drawing.Bitmap 32, 32
$g32 = [System.Drawing.Graphics]::FromImage($bmp32)
$g32.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g32.DrawImage($src, 0, 0, 32, 32)
$g32.Dispose()

$trayDir = 'C:\Users\Administrator\.qoderworkcn\workspace\mqexpwom1qyautw7\PixelPal\assets\icons'
if (-not (Test-Path $trayDir)) { New-Item -ItemType Directory -Path $trayDir -Force | Out-Null }
$bmp32.Save((Join-Path $trayDir 'tray-icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Tray icon created: 32x32"

# Cleanup
$bmp256.Dispose()
$bmp32.Dispose()
$src.Dispose()
$pngStream.Dispose()
$ico.Dispose()
