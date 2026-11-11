# Convierte un archivo de Office a PDF usando el programa instalado (COM).
# Recibe las rutas por variables de entorno para no tener que escaparlas.
$ErrorActionPreference = 'Stop'
$in = $env:TRAZO_IN
$out = $env:TRAZO_OUT
$kind = $env:TRAZO_KIND

switch ($kind) {
  'ppt' {
    $app = New-Object -ComObject PowerPoint.Application
    $abiertas = $app.Presentations.Count
    # Open(archivo, SoloLectura, SinTitulo, ConVentana)
    $p = $app.Presentations.Open($in, -1, 0, 0)
    try { $p.SaveAs($out, 32) } finally { $p.Close() }
    # No cierra PowerPoint si el usuario tenia otras presentaciones abiertas.
    if ($abiertas -eq 0 -and $app.Presentations.Count -eq 0) { $app.Quit() }
  }
  'excel' {
    $app = New-Object -ComObject Excel.Application
    $app.DisplayAlerts = $false
    $wb = $app.Workbooks.Open($in, 0, $true)
    try { $wb.ExportAsFixedFormat(0, $out) } finally { $wb.Close($false) }
    if ($app.Workbooks.Count -eq 0) { $app.Quit() }
  }
  default {
    $app = New-Object -ComObject Word.Application
    $app.Visible = $false
    $doc = $app.Documents.Open($in, $false, $true)
    try { $doc.ExportAsFixedFormat($out, 17) } finally { $doc.Close(0) }
    if ($app.Documents.Count -eq 0) { $app.Quit() }
  }
}
