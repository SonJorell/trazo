# Ayudante de teclado de Trazo (solo Windows).
# Lee por la entrada estándar líneas "<código-virtual> <extendida 0|1>" y pulsa esa tecla
# en la ventana que esté en primer plano (el programa de presentación).
# Solo recibe códigos de la lista blanca definida en overlay/main.js.
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class TrazoKeys {
  [DllImport("user32.dll")]
  static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  const uint EXTENDED = 0x1;
  const uint KEYUP = 0x2;
  public static void Tap(byte vk, bool extended) {
    uint flags = extended ? EXTENDED : 0u;
    keybd_event(vk, 0, flags, UIntPtr.Zero);
    keybd_event(vk, 0, flags | KEYUP, UIntPtr.Zero);
  }
}
"@
[Console]::Out.WriteLine('ready')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $parts = $line.Trim().Split(' ')
  if ($parts.Length -ne 2) { continue }
  $vk = 0
  if (-not [int]::TryParse($parts[0], [ref]$vk)) { continue }
  if ($vk -lt 1 -or $vk -gt 254) { continue }
  [TrazoKeys]::Tap([byte]$vk, $parts[1] -eq '1')
}
