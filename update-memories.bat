@echo off
rem Admin: build the private, encrypted album from the "memories" folder into the "album" folder.
cd /d "%~dp0"
set "PY="
py -3.11 -c "import PIL, cryptography, imageio_ffmpeg" >nul 2>&1
if not errorlevel 1 set "PY=py -3.11"
if defined PY goto run
python -c "import PIL, cryptography, imageio_ffmpeg" >nul 2>&1
if not errorlevel 1 set "PY=python"
if defined PY goto run
echo Installing the helper packages (only the first time)...
py -3.11 -m pip install --user pillow cryptography imageio-ffmpeg
set "PY=py -3.11"
:run
%PY% update_memories.py
echo.
pause
