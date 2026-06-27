@echo off
cd /d "%~dp0"

call venvcam\Scripts\activate

pyinstaller ^
  --clean ^
  --onedir ^
  --noconsole ^
  --name SmartChurchCameraConfigurator ^
  camera_configurator.py

pause