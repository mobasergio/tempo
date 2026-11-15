@echo off
rem Atajo para scripts\release.ps1 sin tocar la ExecutionPolicy. Ver RELEASE.md.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\release.ps1" %*
