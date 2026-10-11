@echo off
setlocal
"C:\Users\15593\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" "%~dp0reapply.cjs" --install
set "result=%ERRORLEVEL%"
if not "%result%"=="0" (
  echo Restoration stopped. No unreviewed plugin version is overwritten.
) else (
  echo Done. Restart DeepSeek Harness to activate the restored plugin.
)
pause
exit /b %result%
