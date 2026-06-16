Option Explicit

Dim shell, fso, root, backendDir, frontendDir, backendCommand, frontendCommand

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
backendDir = root & "\smartchurch_backend"
frontendDir = root & "\smartchurch_frontend"

If Not fso.FileExists(backendDir & "\.venv\Scripts\python.exe") Then WScript.Quit 1
If Not fso.FileExists(frontendDir & "\package.json") Then WScript.Quit 1

backendCommand = "cmd.exe /c cd /d """ & backendDir & """ && "".venv\Scripts\python.exe"" -m uvicorn smartchurch_backend.asgi:application --port 8000 --reload"
frontendCommand = "cmd.exe /c cd /d """ & frontendDir & """ && node ""node_modules\vite\bin\vite.js"" preview --port 80"

shell.Run backendCommand, 0, False
shell.Run frontendCommand, 0, False