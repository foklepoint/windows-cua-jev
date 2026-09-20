import { tool } from "@opencode-ai/plugin"
import { execFileSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const engine = join(dirname(dirname(fileURLToPath(import.meta.url))), "cua.mjs")
const run = (args: string[]) =>
  execFileSync("node", [engine, ...args], { encoding: "utf8", timeout: 120000 })

export const CuaPlugin = async () => {
  return {
    tool: {
      cua_tree: tool({
        description:
          "List interactive UI elements of a Windows application as an indexed action space (UI Automation tree). Use index numbers with cua_act / cua_decide.",
        args: { window: tool.schema.string().optional().describe("window title substring, e.g. 'Notepad'") },
        async execute(args) {
          return run(args.window ? ["tree", "--window", args.window] : ["tree"])
        },
      }),
      cua_act: tool({
        description:
          "Perform one action on a UI element: click, type (text into it), key (raw SendKeys combo like ^s or {ENTER}), or read.",
        args: {
          index: tool.schema.number().describe("element index from cua_tree"),
          action: tool.schema.enum(["click", "type", "key", "read"]),
          text: tool.schema.string().optional().describe("text to type, or key combo"),
          window: tool.schema.string().optional().describe("window title substring"),
        },
        async execute(args) {
          const a = ["act", "--index", String(args.index), "--action", args.action]
          if (args.text) a.push("--text", args.text)
          if (args.window) a.push("--window", args.window)
          return run(a)
        },
      }),
      cua_decide: tool({
        description:
          "One Jev-style decision: cheap fast model picks the next (operation, element index) from the UI tree. Escalates to a backup model on failure. Does not execute.",
        args: {
          goal: tool.schema.string().describe("the goal in natural language"),
          window: tool.schema.string().optional().describe("window title substring"),
        },
        async execute(args) {
          const a = ["decide", "--goal", args.goal]
          if (args.window) a.push("--window", args.window)
          return run(a)
        },
      }),
      cua_run: tool({
        description:
          "Autonomous CUA loop: decide -> act -> re-observe with a cheap model (escalating to backup), up to N steps, until it declares 'done'.",
        args: {
          goal: tool.schema.string().describe("the goal in natural language"),
          window: tool.schema.string().optional().describe("window title substring"),
          steps: tool.schema.number().optional().describe("max steps (default 8)"),
        },
        async execute(args) {
          const a = ["run", "--goal", args.goal, "--steps", String(args.steps ?? 8)]
          if (args.window) a.push("--window", args.window)
          return run(a)
        },
      }),
      cua_screenshot: tool({
        description: "Capture the screen to a PNG and return the path. Use for visual verification when the UI tree is not enough.",
        args: {},
        async execute() {
          return run(["shot"])
        },
      }),
    },
  }
}
