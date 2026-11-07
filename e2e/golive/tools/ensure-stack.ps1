# Starts (only when not listening) the sink, the production web and admin builds and the TLS front of the integrated QA stack. The API is restarted by the batch runners.
param([string]$Worktree = 'D:\My Work\hrm-dijipeople\dijipeople-integration', [string]$Qa = 'D:\My Work\hrm-dijipeople\dijipeople-starter-qa')
function Up($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
if (-not (Up 8325)) { $env:QA_SMTP_PORT = '1325'; $env:QA_MAIL_HTTP_PORT = '8325'; Start-Process node -ArgumentList "`"$Qa\e2e\golive\tools\mail-sink.cjs`"" -WindowStyle Hidden; Remove-Item Env:QA_SMTP_PORT, Env:QA_MAIL_HTTP_PORT }
if (-not (Up 3314)) { Start-Process cmd.exe -ArgumentList '/c', 'npx next start -p 3314 > ..\..\.qa-web.log 2>&1' -WorkingDirectory "$Worktree\apps\web" -WindowStyle Hidden }
if (-not (Up 3302)) { $env:ADMIN_PORT = '3302'; Start-Process cmd.exe -ArgumentList '/c', 'npx next start -p 3302 > ..\..\.qa-admin.log 2>&1' -WorkingDirectory "$Worktree\apps\admin" -WindowStyle Hidden; Remove-Item Env:ADMIN_PORT }
if (-not (Up 3744)) { Start-Process node -ArgumentList "`"$Qa\e2e\golive\tools\tls-proxy.cjs`" 3744 3314" -WindowStyle Hidden }
for ($i = 0; $i -lt 40; $i++) { if ((Up 3314) -and (Up 3302) -and (Up 3744) -and (Up 8325)) { break }; Start-Sleep 3 }
"stack: web=$(Up 3314) admin=$(Up 3302) tls=$(Up 3744) sink=$(Up 8325)"
