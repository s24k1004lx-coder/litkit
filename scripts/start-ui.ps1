# Run the litkit Web UI on the Tailscale address, and keep it running.
# Started at logon by the scheduled task created with install-autostart.ps1.
# If Tailscale is not up yet (or the server exits), retry after a short wait.

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$log = Join-Path $root 'data\ui.log'
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null

while ($true) {
    "[$(Get-Date -Format s)] starting" | Out-File $log -Append -Encoding utf8
    uv run litkit ui --tailscale --no-browser --no-reload *>> $log
    "[$(Get-Date -Format s)] exited (code $LASTEXITCODE); retrying in 20s" | Out-File $log -Append -Encoding utf8
    Start-Sleep -Seconds 20
}
