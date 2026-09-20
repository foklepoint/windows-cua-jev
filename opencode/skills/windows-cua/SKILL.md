---
name: windows-cua
description: >
  Drive real Windows GUI applications (click, type, read, verify) using the
  indexed UIA-tree CUA stack: cua_tree/cua_act/cua_decide/cua_run/cua_screenshot
  tools or `node cua.mjs` directly. Jev-style cheap decision model with LLM
  backup. Use whenever the task involves automating, testing, or verifying a
  desktop app UI on this Windows machine.
---

# Windows CUA workflows

This machine has a working computer-use stack. The happy path uses **zero
screenshots**: apps expose a UI Automation (UIA) tree that is converted into an
indexed text action space; a cheap fast model ("System One" style, default
`z-ai/glm-4.7-flash` via OpenRouter, override with env `CUA_JEV_MODEL`) makes
one typed decision `(op, index)` per step. A backup LLM (default
`openai/gpt-oss-120b`, env `CUA_BACKUP_MODEL`) takes over automatically when the
primary errors or emits garbage.

## Tools

| Tool | Purpose |
|---|---|
| `cua_tree` | List interactive elements of a window as an indexed action space. ALWAYS do this first. |
| `cua_act` | One action: `click`, `type`, `key` (raw SendKeys like `^s`, `{ENTER}`), or `read` on an element index. |
| `cua_decide` | One supervised decision: returns `{"op","index","text","reason"}` without executing. |
| `cua_run` | Autonomous decide -> act -> re-observe loop with action history, until the model says `done`. |
| `cua_screenshot` | Full-screen PNG for visual verification. Fallback only. |

## Workflow

1. Launch the target app (`Start-Process <app>`) and wait ~2s.
2. `cua_tree --window "<title substring>"` and read the element list.
3. Simple goals: `cua_run --goal "..." --window "..." --steps 12`.
   Complex/supervised: alternate `cua_decide` + `cua_act` yourself, checking the tree between steps.
4. Verify from the tree (`read` action, or element values like a calculator display) and/or `cua_screenshot` + view the PNG.
5. Clean up windows you opened (close them) unless the user wants them left.

## Efficiency rules (what makes this cheap)

- Prefer ONE action that does the most work: `type` on a text field, or a `key`
  combo with a full expression (e.g. `1234*5678=` in Calculator, `^s` to save)
  instead of clicking individual buttons.
- Use UI element names/indices from the tree, never screen coordinates.
- Screenshots + vision are the LAST resort (UIA-poor apps, games, canvas).
- Goals must state the verifiable end state ("done when the display shows X").

## Manual engine access

If plugin tools are unavailable, drive the engine directly from the project root:

```
node cua.mjs tree   --window Notepad
node cua.mjs act    --index 2 --action type --text "hi" --window Notepad
node cua.mjs decide --goal "..." --window Notepad
node cua.mjs run    --goal "..." --window Notepad --steps 12
node cua.mjs shot   --path some.png
```

Engine internals: `cua.mjs` (decision loop, OpenRouter) + `.opencode/scripts/*.ps1`
(`get-tree.ps1`, `act.ps1`, `screenshot.ps1`, .NET UIAutomation + SendKeys).

## Known quirks

- WinUI apps (Calculator) may report NaN/Infinity rects for some elements - the
  tree shows them as `(-1,-1,-1x-1)`; the mouse-click fallback guards against them.
- The cheap model can return empty/truncated JSON; the engine retries and
  escalates to the backup model, so occasional `[escalated: ...]` lines are normal.
- Modal dialogs (error popups, UAC) pollute the tree and can shift indices -
  re-run `cua_tree` after any dialog appears/disappears.
- Never operate on windows containing the user's unsaved work; open a fresh
  app instance or tab for tests.
