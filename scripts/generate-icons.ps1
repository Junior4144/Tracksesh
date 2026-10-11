# Raster equivalents of public/tracksesh-icon.svg. Run on Windows when changing the mark.
Add-Type -AssemblyName System.Drawing
$iconRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public'))
$iconSizes = @(16, 32, 48, 180, 192, 512)
$iconPngs = @{}
foreach ($size in $iconSizes) {
    $bitmap = New-Object Drawing.Bitmap 512, 512
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([Drawing.Color]::Transparent)
    $green = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#2c6553'))
    $shape = New-Object Drawing.Drawing2D.GraphicsPath
    $corner = 224
    $shape.AddArc(0, 0, $corner, $corner, 180, 90)
    $shape.AddArc(288, 0, $corner, $corner, 270, 90)
    $shape.AddArc(288, 288, $corner, $corner, 0, 90)
    $shape.AddArc(0, 288, $corner, $corner, 90, 90)
    $shape.CloseFigure()
    $graphics.FillPath($green, $shape)
    $pen = New-Object Drawing.Pen ([Drawing.Color]::White), 32
    $pen.StartCap = $pen.EndCap = [Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawEllipse($pen, 80, 80, 352, 352)
    $graphics.DrawLine($pen, 256, 144, 256, 256)
    $graphics.DrawLine($pen, 256, 256, 352, 312)
    $graphics.FillEllipse([Drawing.Brushes]::White, 232, 232, 48, 48)
    $small = New-Object Drawing.Bitmap $size, $size
    $smallGraphics = [Drawing.Graphics]::FromImage($small)
    $smallGraphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $smallGraphics.DrawImage($bitmap, 0, 0, $size, $size)
    $stream = New-Object IO.MemoryStream
    $small.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
    $iconPngs[$size] = $stream.ToArray()
    if ($size -ge 48) {
        [IO.File]::WriteAllBytes((Join-Path $iconRoot "tracksesh-icon-$size.png"), $iconPngs[$size])
    }
    $stream.Dispose(); $smallGraphics.Dispose(); $small.Dispose()
    $pen.Dispose(); $shape.Dispose(); $green.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
# ICO supports PNG entries; supply actual small sizes instead of a single giant image.
$icoStream = New-Object IO.MemoryStream
$writer = New-Object IO.BinaryWriter $icoStream
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]3)
$offset = 6 + 16 * 3
foreach ($size in @(16, 32, 48)) {
    $writer.Write([byte]$size); $writer.Write([byte]$size)
    $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32)
    $writer.Write([uint32]$iconPngs[$size].Length); $writer.Write([uint32]$offset)
    $offset += $iconPngs[$size].Length
}
foreach ($size in @(16, 32, 48)) { $writer.Write([byte[]]$iconPngs[$size]) }
[IO.File]::WriteAllBytes((Join-Path $iconRoot 'favicon.ico'), $icoStream.ToArray())
$writer.Dispose(); $icoStream.Dispose()
