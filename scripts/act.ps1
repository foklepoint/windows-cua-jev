param([int]$Index = 0, [string]$Action = "click", [string]$Text = "", [string]$Window = "")
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

# "key" with no index: send to the foreground window after bringing the target to front
if ($Action -eq "key" -and $Index -eq 0) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W32F {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
    try { [W32F]::SetForegroundWindow($target.CurrentNativeWindowHandle) | Out-Null } catch {}
    Start-Sleep -Milliseconds 300
    [System.Windows.Forms.SendKeys]::SendWait($Text)
    Write-Output "KEY '$Text' sent to window '$($target.Current.Name)'"
    exit 0
}

$keep = @('Text','Button','Edit','Document','CheckBox','RadioButton','ComboBox','ComboBoxItem','ListItem','MenuItem','TabItem','Hyperlink','Slider','TreeItem','SplitButton','MenuBar')
$els = $target.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$list = New-Object System.Collections.ArrayList
foreach ($el in $els) {
    if ($list.Count -ge 250) { break }
    $ct = $el.Current.ControlType.ProgrammaticName -replace '^ControlType\.', ''
    if ($keep -notcontains $ct) { continue }
    if (-not $el.Current.IsEnabled) { continue }
    [void]$list.Add($el)
}
if ($Index -lt 1 -or $Index -gt $list.Count) { Write-Output "INDEX_OUT_OF_RANGE: $Index of $($list.Count)"; exit 1 }
$el = $list[$Index - 1]

if ($Action -eq "click") {
    $done = $false
    try { $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); $done = $true } catch {}
    if (-not $done) { try { $el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Toggle(); $done = $true } catch {} }
    if (-not $done) { try { $el.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select(); $done = $true } catch {} }
    if (-not $done) { try { $el.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand(); $done = $true } catch {} }
    if (-not $done) {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W32 {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, int e);
}
"@
        $r = $el.Current.BoundingRectangle
        $cx = [double]$r.X + [double]$r.Width / 2; $cy = [double]$r.Y + [double]$r.Height / 2
        if ([double]::IsNaN($cx) -or [double]::IsInfinity($cx)) { throw "element has invalid rect" }
        $x = [int][Math]::Max(-2147483647, [Math]::Min(2147483647, $cx)); $y = [int][Math]::Max(-2147483647, [Math]::Min(2147483647, $cy))
        [W32]::SetCursorPos($x, $y) | Out-Null
        Start-Sleep -Milliseconds 80
        [W32]::mouse_event(0x02, 0, 0, 0, 0); [W32]::mouse_event(0x04, 0, 0, 0, 0)
    }
    Write-Output "CLICKED index=$Index name='$($el.Current.Name)'"
}
elseif ($Action -eq "type") {
    Add-Type -AssemblyName System.Windows.Forms
    try { $el.SetFocus() } catch {}
    Start-Sleep -Milliseconds 250
    $safe = $Text.Replace('[', '{[}').Replace(']', '{]}').Replace('+', '{+}').Replace('^', '{^}').Replace('%', '{%}').Replace('~', '{~}').Replace('(', '{(}').Replace(')', '{)}')
    [System.Windows.Forms.SendKeys]::SendWait($safe)
    Write-Output "TYPED into index=$Index name='$($el.Current.Name)'"
}
elseif ($Action -eq "key") {
    Add-Type -AssemblyName System.Windows.Forms
    try { $el.SetFocus() } catch {}
    Start-Sleep -Milliseconds 150
    [System.Windows.Forms.SendKeys]::SendWait($Text)
    Write-Output "KEY '$Text' sent (focus: index=$Index)"
}
elseif ($Action -eq "read") {
    $val = ""
    try { $val = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch { $val = $el.Current.Name }
    Write-Output "READ index=$Index name='$($el.Current.Name)' value:'$val'"
}
else {
    Write-Output "UNKNOWN_ACTION: $Action"; exit 1
}
