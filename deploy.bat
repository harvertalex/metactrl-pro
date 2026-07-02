@echo off
REM MetaCtrl PRO — быстрый деплой для Windows
REM Использование: deploy.bat или deploy.bat full

setlocal enabledelayedexpansion

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

REM Проверка команды
if "%1"=="" goto deploy
if "%1"=="full" goto deploy_full
if "%1"=="regen" goto regen_b64
if "%1"=="check" goto check
goto invalid_cmd

:regen_b64
REM index.html is now the hub (no B64) — MetaCtrl B64 lives only in install-page.html
echo [*] Regenerating MetaCtrl B64 in install-page.html...
node -e "const fs = require('fs'); const code = fs.readFileSync('bookmarklet.js', 'utf8'); const b64 = Buffer.from(code, 'utf8').toString('base64'); const tag = \"var B64 = '\" + b64 + \"'\"; ['install-page.html'].forEach(f=>{fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/var B64 = '[^']*'/,tag),'utf8');}); console.log('OK MetaCtrl - B64 length:', b64.length);"
echo [*] Regenerating Launcher B64 + stamping version in install-launcher.html...
node regen-launcher.mjs
goto end

:deploy_full
echo [*] Full cycle: B64 regen + Deploy
call :regen_b64
echo.
goto deploy

:deploy
echo [*] Deploying to tessa-bot server...
bun deploy.ts
goto end

:check
echo [*] Checking SSH access and server files...
ssh -i %USERPROFILE%\.ssh\capi-server1 root@94.130.220.232 "ls -lah /var/www/html/metactrl/"
goto end

:invalid_cmd
echo Invalid command: %1
echo.
echo Usage:
echo   deploy.bat           - Deploy to server
echo   deploy.bat full      - Regen B64 + Deploy
echo   deploy.bat regen     - Regenerate B64 only
echo   deploy.bat check     - Check SSH and server files
goto end

:end
endlocal
