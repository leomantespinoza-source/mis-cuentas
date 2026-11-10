# Genera los íconos PNG de la app (fondo verde con "S/").
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\icons'
New-Item -ItemType Directory -Force $out | Out-Null

function Make-Icon([int]$size, [string]$file, [double]$pad) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(31, 92, 74))
  $g.FillRectangle($bg, 0, 0, $size, $size)

  # Moneda
  $inner = $size * (1 - 2 * $pad)
  $off = $size * $pad
  $coin = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(246, 244, 239))
  $g.FillEllipse($coin, [float]$off, [float]$off, [float]$inner, [float]$inner)

  $font = New-Object System.Drawing.Font 'Segoe UI', ([float]($inner * 0.36)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'
  $fmt.LineAlignment = 'Center'
  $ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(31, 92, 74))
  $rect = New-Object System.Drawing.RectangleF ([float]$off), ([float]($off + $inner * 0.02)), ([float]$inner), ([float]$inner)
  $g.DrawString('S/', $font, $ink, $rect, $fmt)

  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Make-Icon 192 'icon-192.png' 0.14
Make-Icon 512 'icon-512.png' 0.14
Make-Icon 512 'icon-maskable-512.png' 0.22
Make-Icon 180 'apple-touch-icon.png' 0.14
Write-Output 'Iconos generados'
