#!/usr/bin/env node
// Dependency-free MCP stdio server wrapping the windows-cua-jev engine.
// Works with any MCP client: opencode, Claude Desktop, Cursor, etc.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

const engine = join(dirname(fileURLToPath(import.meta.url)), "cua.mjs");
const run = (args) => {
  try {
    return { content: [{ type: "text", text: execFileSync("node", [engine, ...args], { encoding: "utf8", timeout: 600000 }) }] };
  } catch (e) {
    return { content: [{ type: "text", text: "ERROR: " + (e.message || e) }], isError: true };
  }
};

const tools = [
  {
    name: "cua_tree",
    description: "List interactive UI elements of a Windows application as an indexed action space (UI Automation tree). Always call this first.",
    inputSchema: {
      type: "object",
      properties: { window: { type: "string", description: "window title substring, e.g. 'Notepad'" } },
    },
  },
  {
    name: "cua_act",
    description: "Perform one action on a UI element: click, type (text into it), key (raw SendKeys combo like ^s or {ENTER}), or read.",
    inputSchema: {
      type: "object",
      properties: {
        index: { type: "number", description: "element index from cua_tree (optional for 'key')" },
        action: { type: "string", enum: ["click", "type", "key", "read"] },
        text: { type: "string", description: "text to type, or key combo" },
        window: { type: "string", description: "window title substring" },
      },
      required: ["action"],
    },
  },
  {
    name: "cua_decide",
    description: "One Jev-style decision: a cheap fast model picks the next (operation, element index) from the UI tree. Escalates to a backup model on failure. Does not execute.",
    inputSchema: {
      type: "object",
      properties: { goal: { type: "string" }, window: { type: "string" } },
      required: ["goal"],
    },
  },
  {
    name: "cua_run",
    description: "Autonomous CUA loop: decide -> act -> re-observe with action history, until the model declares 'done'.",
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string", description: "goal with a verifiable end state" },
        window: { type: "string" },
        steps: { type: "number", description: "max steps (default 8)" },
      },
      required: ["goal"],
    },
  },
  {
    name: "cua_screenshot",
    description: "Capture the screen (optionally cropped to a window) to a PNG. Use for visual verification only.",
    inputSchema: {
      type: "object",
      properties: { window: { type: "string", description: "window title substring to crop to" } },
    },
  },
];

const dispatch = {
  cua_tree: (a) => run(a.window ? ["tree", "--window", a.window] : ["tree"]),
  cua_act: (a) => {
    const args = ["act", "--action", a.action];
    if (a.index != null) args.push("--index", String(a.index));
    if (a.text) args.push("--text", a.text);
    if (a.window) args.push("--window", a.window);
    return run(args);
  },
  cua_decide: (a) => run(["decide", "--goal", a.goal, ...(a.window ? ["--window", a.window] : [])]),
  cua_run: (a) => run(["run", "--goal", a.goal, "--steps", String(a.steps ?? 8), ...(a.window ? ["--window", a.window] : [])]),
  cua_screenshot: (a) => run(["shot", ...(a.window ? ["--window", a.window] : [])]),
};

const reply = (msg, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n");

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id == null) return; // notification
  if (msg.method === "initialize") {
    reply(msg, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "windows-cua-jev", version: "0.1.0" },
    });
  } else if (msg.method === "tools/list") {
    reply(msg, { tools });
  } else if (msg.method === "tools/call") {
    const { name, arguments: args } = msg.params || {};
    const fn = dispatch[name];
    reply(msg, fn ? fn(args || {}) : { content: [{ type: "text", text: `unknown tool: ${name}` }], isError: true });
  } else if (msg.method === "ping") {
    reply(msg, {});
  } else {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "method not found: " + msg.method } }) + "\n");
  }
});
