param([string]$Path = "$env:TEMP\windows-cua.png", [string]$Window = "")
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$x = [System.Windows.Forms.SystemInformation]::VirtualScreen.X
$y = [System.Windows.Forms.SystemInformation]::VirtualScreen.Y
$w = [System.Windows.Forms.SystemInformation]::VirtualScreen.Width
$h = [System.Windows.Forms.SystemInformation]::VirtualScreen.Height

if ($Window -ne "") {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    foreach ($c in $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
        if ($c.Current.Name -like "*$Window*") {
            $r = $c.Current.BoundingRectangle
            if (-not [double]::IsNaN($r.X) -and $r.Width -gt 0) {
                $x = [int][Math]::Max(0, $r.X); $y = [int][Math]::Max(0, $r.Y)
                $w = [int][Math]::Min($r.Width, [System.Windows.Forms.SystemInformation]::VirtualScreen.Width)
                $h = [int][Math]::Min($r.Height, [System.Windows.Forms.SystemInformation]::VirtualScreen.Height)
            }
            break
        }
    }
}

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($x, $y, 0, 0, $bmp.Size)
$g.Dispose()
$bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "SAVED $Path ($w x $h)"
