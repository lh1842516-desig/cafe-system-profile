' تشغيل خادم الكافيه في الخلفية بدون نافذة (للتشغيل التلقائي مع ويندوز)
Option Explicit
Dim fso, shell, scriptDir
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir
shell.Run "node server.js", 0, False
