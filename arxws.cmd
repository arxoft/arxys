@echo off
:: arxws.cmd — Windows wrapper for the arxws bash script
:: Runs the script using Git Bash (git-bash.exe or sh.exe from Git for Windows)

setlocal

:: Locate Git Bash — check common install paths
set "GIT_BASH="

for %%G in (
  "C:\Program Files\Git\bin\bash.exe"
  "C:\Program Files (x86)\Git\bin\bash.exe"
  "%LOCALAPPDATA%\Programs\Git\bin\bash.exe"
  "%ProgramW6432%\Git\bin\bash.exe"
) do (
  if not defined GIT_BASH (
    if exist %%G set "GIT_BASH=%%~G"
  )
)

:: Fall back to whatever bash is on PATH
if not defined GIT_BASH (
  where bash >nul 2>&1
  if not errorlevel 1 set "GIT_BASH=bash"
)

if not defined GIT_BASH (
  echo ERROR: Git Bash not found.
  echo Install Git for Windows from https://git-scm.com/download/win
  exit /b 1
)

:: Resolve the directory this .cmd file lives in
set "SCRIPT_DIR=%~dp0"
:: Strip trailing backslash
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

:: Convert Windows path to a Unix-style path for bash
:: e.g. C:\foo\bar -> /c/foo/bar
set "UNIX_SCRIPT_DIR=%SCRIPT_DIR:\=/%"
:: Replace drive letter  X:  with  /x
set "DRIVE=%UNIX_SCRIPT_DIR:~0,1%"
set "REST=%UNIX_SCRIPT_DIR:~2%"
set "UNIX_SCRIPT_DIR=/%DRIVE%/%REST%"

"%GIT_BASH%" --login -i "%UNIX_SCRIPT_DIR%/arxws" %*

exit /b %errorlevel%
