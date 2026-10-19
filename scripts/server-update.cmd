@echo off
rem myGym server update (Windows, run over SSH from the Mac after "git pull --ff-only"; CLAUDE.md).
rem Rebuilds and restarts the stack with the commit baked into the app's version, so Settings
rem shows "v1.4.1+<commit>" (docker-compose.override.yml passes APP_BUILD to the web build).
rem DOCKER_CONFIG: a config without the Windows credential store, which SSH cannot reach.
set DOCKER_CONFIG=C:\Users\SzAko\.docker-ssh
for /f %%i in ('git rev-parse --short HEAD') do set APP_BUILD=%%i
echo Building %APP_BUILD%
docker compose up -d --build
