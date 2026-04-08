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
echo [*] Regenerating B64 in install-page.html and index.html...
node -e "const fs = require('fs'); const code = fs.readFileSync('bookmarklet.js', 'utf8'); const b64 = Buffer.from(code, 'utf8').toString('base64'); const tag = \"var B64 = '\" + b64 + \"'\"; ['install-page.html','index.html'].forEach(f=>{fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/var B64 = '[^']*'/,tag),'utf8');}); console.log('OK - B64 length:', b64.length);"
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
ssh -i %USERPROFILE%\.ssh\tessa-bot root@192.248.190.182 "ls -lah /var/www/metactrl-pro/"
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
