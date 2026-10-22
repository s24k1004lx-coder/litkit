# Register (or remove) a scheduled task that starts the litkit Web UI at logon.
#   Install : powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
#   Remove  : powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 -Remove
# Runs as the current user (no administrator rights needed) and only while that user is logged on.

param([switch]$Remove)

$name = 'litkit-ui'

if ($Remove) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed scheduled task '$name'."
    return
}

$script = Join-Path $PSScriptRoot 'start-ui.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
    -Description 'litkit Web UI on the Tailscale address' -Force | Out-Null
Write-Host "Registered scheduled task '$name' (runs at logon). Start now with: Start-ScheduledTask -TaskName $name"
