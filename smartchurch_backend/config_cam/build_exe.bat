@echo off
cd /d "%~dp0"

call venvcam\Scripts\activate

pyinstaller ^
  --clean ^
  --onefile ^
  --noconsole ^
  --distpath . ^
  --name SmartChurchCameraConfigurator ^
  camera_configurator.py

pause