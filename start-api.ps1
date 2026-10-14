Set-Location $PSScriptRoot
uv run uvicorn litkit.api:app --host 127.0.0.1 --port 7777 --reload
