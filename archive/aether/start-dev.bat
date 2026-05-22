@echo off
echo Starting Alpha Development Servers...
echo.
echo [1/2] Starting Backend on port 8080...
start "Backend" cmd /c "npx tsx src/server.ts"
timeout /t 3 /nobreak >nul
echo [2/2] Starting Frontend on port 5173...
start "Frontend" cmd /c "cd frontend && npx vite"
echo.
echo Alpha ready:
echo   Backend: http://localhost:8080
echo   Frontend: http://localhost:5173
pause
