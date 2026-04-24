$port = 8080

# Add C# types for native mouse control
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class Win32 {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
    
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
}
"@

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Listening on http://localhost:$port/"
Write-Host "Remote Control API enabled at /api/control"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $localPath = $request.Url.LocalPath
        
        # Add basic CORS headers just in case
        $response.AppendHeader("Access-Control-Allow-Origin", "*")
        $response.AppendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        $response.AppendHeader("Access-Control-Allow-Headers", "Content-Type")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        # API Route for remote control
        if ($localPath -eq "/api/control" -and $request.HttpMethod -eq "POST") {
            try {
                $reader = New-Object System.IO.StreamReader($request.InputStream)
                $json = $reader.ReadToEnd()
                $event = $json | ConvertFrom-Json
                
                if ($event.type -eq "move" -or $event.type -eq "drag") {
                    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
                    $x = [math]::Round($event.x * $bounds.Width)
                    $y = [math]::Round($event.y * $bounds.Height)
                    [Win32]::SetCursorPos($x, $y)
                    
                    if ($event.type -eq "drag") {
                        # We could implement drag by sending LEFTDOWN when drag starts and LEFTUP when it ends
                        # For simplicity, if we just want basic click and move, we can ignore drag holding for now
                    }
                }
                elseif ($event.type -eq "click") {
                    [Win32]::mouse_event([Win32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
                    [Win32]::mouse_event([Win32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
                }
                elseif ($event.type -eq "keydown") {
                    # Simple key sending using SendKeys
                    [System.Windows.Forms.SendKeys]::SendWait($event.key)
                }
                
                $response.StatusCode = 200
            } catch {
                $response.StatusCode = 500
                Write-Host "Error processing control command: $_"
            }
            $response.Close()
            continue
        }

        # Static file serving
        if ($localPath -eq "/") {
            $localPath = "/index.html"
        }
        
        $filePath = Join-Path (Get-Location) $localPath
        $filePath = $filePath.Replace('/', '\')
        
        if (Test-Path $filePath -PathType Leaf) {
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $content.Length
            
            # Set content type
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            switch ($ext) {
                ".html" { $response.ContentType = "text/html" }
                ".css"  { $response.ContentType = "text/css" }
                ".js"   { $response.ContentType = "application/javascript" }
                default { $response.ContentType = "application/octet-stream" }
            }
            
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            $response.StatusCode = 404
            $buffer = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        
        $response.Close()
    }
} finally {
    $listener.Stop()
}
