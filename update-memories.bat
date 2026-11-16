@echo off
rem Admin: rebuild the memories wall from the files in the "memories" folder.
cd /d "%~dp0"
py -3.11 -c "import PIL" >nul 2>&1 && (py -3.11 update_memories.py & goto done)
python -c "import PIL" >nul 2>&1 && (python update_memories.py & goto done)
echo Pillow not found - images will be copied without resizing. (Install with: python -m pip install pillow)
python update_memories.py
:done
pause
