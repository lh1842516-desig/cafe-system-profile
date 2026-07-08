# إنشاء اختصار التشغيل التلقائي في مجلد Startup
param([string]$LinkPath, [string]$VbsPath, [string]$WorkDir)
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($LinkPath)
$s.TargetPath = "wscript.exe"
$s.Arguments = "`"$VbsPath`""
$s.WorkingDirectory = $WorkDir
$s.WindowStyle = 7
$s.Save()
