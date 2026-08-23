@echo off
REM ============================================================
REM  Dishy dev launcher - double-click to start backend + frontend
REM  Opens two windows: one for the Go backend (:8080),
REM  one for the Next.js frontend (:3000).
REM  Close a window to stop that server.
REM ============================================================

title Dishy launcher

REM --- Backend (:8080) ---
REM  Runs pending DB migrations first, then starts the server.
REM  If a migration fails, it stops before starting so you see the error.
cd /d "%~dp0backend"
start "Dishy Backend :8080" cmd /k "go run ./cmd/migrate && go run main.go"

REM --- Frontend (:3000) ---
cd /d "%~dp0frontend"
start "Dishy Frontend :3000" cmd /k "npm run dev"

REM --- Open the app in the default browser after a short wait ---
timeout /t 8 /nobreak >nul
start "" "http://localhost:3000"

exit
