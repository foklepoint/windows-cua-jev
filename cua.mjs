#!/usr/bin/env node
// windows-cua-jev engine
// Indexed UIA-tree decisions (Jev-style) with LLM fallback for Windows GUI automation.
// Provider-agnostic: any OpenAI-compatible /chat/completions endpoint.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scripts = join(dirname(fileURLToPath(import.meta.url)), "scripts");

const ps = (file, args = []) =>
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(scripts, file), ...args], {
    encoding: "utf8", timeout: 45000,
  }).trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cfg = () => ({
  baseUrl: (process.env.CUA_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
  apiKey: process.env.CUA_API_KEY || process.env.OPENROUTER_API_KEY,
  jev: process.env.CUA_JEV_MODEL || "z-ai/glm-4.7-flash",
  backup: process.env.CUA_BACKup_MODEL || process.env.CUA_BACKUP_MODEL || "openai/gpt-oss-120b",
});

function getTree(win) {
  return ps("get-tree.ps1", win ? ["-Window", win] : []);
}

function buildMessages(goal, tree, history = []) {
  const sys = [
    'You are a UI-automation decision engine ("System One"). You receive an indexed list of UI elements and must choose exactly ONE next action.',
    "You also receive the actions already taken and their results. Use them to track progress - never repeat an action that already happened.",
    'Plan efficiently: prefer ONE action that does the most work - a "type" on a text field, or a "key" combo with the full expression (e.g. text "1234*5678=" in a calculator, "^s" to save) - over hunting for individual buttons.',
    "Reply with ONLY minified JSON - no prose, no markdown fences:",
    '{"op":"click"|"type"|"key"|"done"|"fail","index":<element index or null>,"text":<string or null>,"reason":"<short>"}',
    "- click: activate element at index",
    "- type: focus element at index and type text (use for Edit/Document fields)",
    '- key: send raw SendKeys combo, e.g. "{ENTER}", "^s", "%f" (focuses index first if given; index may be null)',
    "- done: the goal is fully achieved AND verified from the element values",
    "- fail: impossible with the current elements",
  ].join("\n");
  const hist = history.length
    ? `\n\nACTIONS ALREADY TAKEN (do NOT repeat; adapt):\n${history.map((h, i) => `${i + 1}. ${JSON.stringify(h.dec)} -> ${h.result}`).join("\n")}`
    : "";
  return [
    { role: "system", content: sys },
    { role: "user", content: `GOAL: ${goal}\n\nUI ELEMENTS:\n${tree}${hist}` },
  ];
}

async function chat(model, messages) {
  const { baseUrl, apiKey } = cfg();
  if (!apiKey) throw new Error("no API key: set CUA_API_KEY (or OPENROUTER_API_KEY)");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0, max_tokens: 800 }),
  });
  if (!res.ok) throw new Error(`${baseUrl} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const m = j.choices?.[0]?.message;
  const text = m?.content || m?.reasoning || "";
  if (!text.trim()) throw new Error("empty response");
  return text;
}

function parseDecision(s) {
  for (let i = s.indexOf("{"); i >= 0; i = s.indexOf("{", i + 1)) {
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === "{") depth++;
      else if (s[j] === "}") {
        if (--depth === 0) {
          try {
            const d = JSON.parse(s.slice(i, j + 1));
            if (d.op) return d;
          } catch {}
          break;
        }
      }
    }
  }
  throw new Error(`no valid JSON decision in: ${s.slice(0, 120)}`);
}

async function decideWithFallback(goal, tree, history = []) {
  const { jev, backup } = cfg();
  const msgs = buildMessages(goal, tree, history);
  try {
    const t0 = Date.now();
    return { dec: parseDecision(await chat(jev, msgs)), model: jev, ms: Date.now() - t0, escalated: false };
  } catch (e) {
    const t0 = Date.now();
    return {
      dec: parseDecision(await chat(backup, msgs)),
      model: backup,
      ms: Date.now() - t0,
      escalated: true,
      why: String(e.message).slice(0, 120),
    };
  }
}

function act(dec, win) {
  const args = ["-Action", dec.op];
  if (dec.index) args.push("-Index", String(dec.index));
  if (win) args.push("-Window", win);
  if (dec.text) args.push("-Text", dec.text);
  return ps("act.ps1", args);
}

async function run(goal, win, maxSteps) {
  console.log(`GOAL: ${goal}`);
  const history = [];
  for (let step = 1; step <= maxSteps; step++) {
    const tree = getTree(win);
    let outcome;
    try { outcome = await decideWithFallback(goal, tree, history); }
    catch (e) {
      console.log(`[step ${step}] both models failed to decide: ${e.message} - retrying`);
      await sleep(800);
      continue;
    }
    const { dec, model, ms, escalated, why } = outcome;
    console.log(`[step ${step}] ${model} (${ms}ms)${escalated ? ` [escalated: ${why}]` : ""} -> ${JSON.stringify(dec)}`);
    if (dec.op === "done") { console.log("== GOAL DONE =="); return; }
    if (dec.op === "fail") throw new Error(`engine gave up: ${dec.reason}`);
    let result;
    try { result = act(dec, win); } catch (e) { result = `ACTION FAILED: ${String(e.message).slice(0, 150)}`; }
    console.log(`   ${result}`);
    history.push({ dec, result });
    if (history.length > 10) history.shift();
    await sleep(450);
  }
  console.log("== MAX STEPS REACHED (no 'done') ==");
}

// --- CLI ---
const argv = process.argv.slice(2);
const cmd = argv.shift();
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};

try {
  if (cmd === "tree") console.log(getTree(arg("--window", "")));
  else if (cmd === "act") {
    const args = ["-Action", arg("--action", "click")];
    if (arg("--index")) args.push("-Index", arg("--index"));
    if (arg("--text")) args.push("-Text", arg("--text"));
    if (arg("--window")) args.push("-Window", arg("--window"));
    console.log(ps("act.ps1", args));
  } else if (cmd === "shot") {
    const args = ["-Path", arg("--path", `${process.env.TEMP}\\windows-cua.png`)];
    if (arg("--window")) args.push("-Window", arg("--window"));
    console.log(ps("screenshot.ps1", args));
  } else if (cmd === "decide") {
    const tree = getTree(arg("--window", ""));
    const { dec, model, ms, escalated, why } = await decideWithFallback(arg("--goal", ""));
    console.log(`${model} (${ms}ms)${escalated ? ` [escalated: ${why}]` : ""} -> ${JSON.stringify(dec)}`);
  } else if (cmd === "run") await run(arg("--goal", ""), arg("--window", ""), parseInt(arg("--steps", "8"), 10));
  else console.log("usage: node cua.mjs tree|act|shot|decide|run");
} catch (e) {
  console.error("ERROR: " + (e.message || e));
  process.exit(1);
}
