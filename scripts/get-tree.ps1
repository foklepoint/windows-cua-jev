param([string]$Window = "", [int]$Max = 250)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$target = $null
if ($Window -ne "") {
    foreach ($c in $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
        if ($c.Current.Name -like "*$Window*") { $target = $c; break }
    }
    if (-not $target) { Write-Output "WINDOW_NOT_FOUND: $Window"; exit 1 }
} else {
    $target = $root
}

$keep = @('Text','Button','Edit','Document','CheckBox','RadioButton','ComboBox','ComboBoxItem','ListItem','MenuItem','TabItem','Hyperlink','Slider','TreeItem','SplitButton','MenuBar')
$els = $target.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$i = 0
foreach ($el in $els) {
    if ($i -ge $Max) { break }
    $ct = $el.Current.ControlType.ProgrammaticName -replace '^ControlType\.', ''
    if ($keep -notcontains $ct) { continue }
    if (-not $el.Current.IsEnabled) { continue }
    $r = $el.Current.BoundingRectangle
    $val = ""
    try { $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); $val = $vp.Current.Value } catch {}
    if ($val.Length -gt 150) { $val = $val.Substring(0,150) + "..." }
    $name = $el.Current.Name
    if ($name.Length -gt 80) { $name = $name.Substring(0,80) + "..." }
    $i++
    $val = ($val -replace "`r", " " -replace "`n", " ")
    $coords = @($r.X, $r.Y, $r.Width, $r.Height) | ForEach-Object { if ([double]::IsNaN($_) -or [double]::IsInfinity($_)) { -1 } else { [int][Math]::Max(-2147483647, [Math]::Min(2147483647, $_)) } }
    "{0}|{1}|{2}|{3}|({4},{5},{6}x{7})|{8}" -f $i, $ct, $name, $el.Current.AutomationId, $coords[0], $coords[1], $coords[2], $coords[3], $val
}
Write-Output "TOTAL=$i"
