@echo off
title Link Fortress IT Solutions
cd /d "%~dp0"
cls
echo [1] Starting...
where node
echo [2] Node check done
node --version
echo [3] Version done
pause
echo [4] After pause
node scripts/serve-local.mjs
pause
