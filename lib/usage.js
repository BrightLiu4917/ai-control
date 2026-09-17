// 使用记录与统计：回答"这个工具到底有没有被用到"。
// 设计约束（三条都不能破）：
//   1. 纯本地——只写 ~/.ai-control/usage.jsonl，不联网、不上报；
//   2. fail-open——记录或横幅出任何问题都不许影响命令本身；
//   3. 机器契约不污染——结果信号仍走 stdout（单行大写标记）；
//      给人看的横幅在 TTY 下走 stdout、非 TTY（脚本/CI/AI 调用）走 stderr。
const fs = require("fs");
const os = require("os");
const path = require("path");

const BRAND = "bright-ai-coding";
const FALSY = ["off", "0", "false", "no"];
const MAX_BYTES = 1024 * 1024; // 超过 1MB 只保留尾部
const KEEP_LINES = 2000;

function val(name) {
  return String(process.env[name] || "").trim().toLowerCase();
}

// 默认开的开关（如 AI_CONTROL_USAGE）：不写就是开，只有显式 off/0/false/no 才关
function explicitlyOff(name) {
  return FALSY.includes(val(name));
}

// 默认关的开关（如 AI_CONTROL_QUIET / AI_CONTROL_BANNER）：必须显式给个非假值才算开
function explicitlyOn(name) {
  const v = val(name);
  return v !== "" && !FALSY.includes(v);
}

function usageFile() {
  return process.env.AI_CONTROL_USAGE_FILE || path.join(os.homedir(), ".ai-control", "usage.jsonl");
}

// 项目级开关：.ai/config.json 的 "usage"/"banner"（env 之外的常规入口，写在项目里全队一致）
function configSwitch(root, key) {
  if (!root) return "";
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, ".ai", "config.json"), "utf8"));
    return String(cfg[key] || "").trim().toLowerCase();
  } catch { return ""; }
}

function enabled(root) {
  return !explicitlyOff("AI_CONTROL_USAGE") && configSwitch(root, "usage") !== "off";
}

function countLines(file) {
  try { return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).length; }
  catch { return 0; }
}

function trim(file) {
  try {
    if (fs.statSync(file).size <= MAX_BYTES) return;
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    fs.writeFileSync(file, lines.slice(-KEEP_LINES).join("\n") + "\n");
  } catch { /* 忽略：清理失败不影响主流程 */ }
}

// 追加一条使用记录（幂等失败：返回 false，绝不抛）
function record(entry) {
  if (!enabled()) return false;
  const file = usageFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(entry) + "\n");
    trim(file);
    return true;
  } catch { return false; }
}

// 本机累计调用次数（含尚未写入的本次：调用方 +1 使用）
function total() {
  if (!enabled()) return 0;
  return countLines(usageFile());
}

// 读取全部记录；坏行跳过（半个 JSON 行不该让统计崩掉）
function read() {
  let text = "";
  try { text = fs.readFileSync(usageFile(), "utf8"); } catch { return []; }
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* 跳过坏行 */ }
  }
  return rows;
}

function summarize(rows) {
  const byCmd = {};
  const byProj = {};
  const WEEK = 7 * 24 * 3600 * 1000;
  const now = Date.now();
  let recent7 = 0, nonzero = 0, nonzero7 = 0;
  for (const r of rows) {
    byCmd[r.cmd || "?"] = (byCmd[r.cmd || "?"] || 0) + 1;
    const p = r.proj || "（项目外）";
    byProj[p] = (byProj[p] || 0) + 1;
    const t = Date.parse(r.ts) || 0;
    const fresh = now - t <= WEEK;
    if (fresh) recent7++;
    if (r.code) { nonzero++; if (fresh) nonzero7++; }
  }
  return {
    total: rows.length,
    first: (rows[0] || {}).ts || "",
    last: (rows[rows.length - 1] || {}).ts || "",
    recent7, nonzero, nonzero7,
    byCmd, byProj,
    recent: rows.slice(-8).reverse(),
  };
}

// 项目侧快照：进行中 / 已交付变更 + 钩子拦截次数（不需要 .ai 也能跑）
function projectSnapshot(root) {
  const snap = { name: "", root: "", active: 0, shipped: 0, intercepted: 0, lastInterception: "" };
  if (!root) return snap;
  snap.root = root;
  snap.name = path.basename(root);
  const changesDir = path.join(root, ".ai", "changes");
  try {
    for (const d of fs.readdirSync(changesDir)) {
      const p = path.join(changesDir, d);
      if (!fs.statSync(p).isDirectory()) continue;
      if (fs.existsSync(path.join(p, "shipped.json"))) snap.shipped++;
      else snap.active++;
    }
  } catch { /* 无变更目录 */ }
  try {
    const lines = fs.readFileSync(path.join(root, ".ai", "interceptions.jsonl"), "utf8")
      .split("\n").filter(Boolean);
    snap.intercepted = lines.length;
    try { snap.lastInterception = (JSON.parse(lines[lines.length - 1]) || {}).ts || ""; } catch { /* 坏行 */ }
  } catch { /* 还没被拦过 */ }
  return snap;
}

// ── 横幅 ────────────────────────────────────────────────
// 例：◆ bright-ai-coding · ai-control v2.2.1 · ai ship · 本机第 37 次
const BANNER_SKIP = ["stats", "version", "help"];

function bannerText({ cmd, version, count, root }) {
  if (explicitlyOn("AI_CONTROL_QUIET") || explicitlyOn("AI_CONTROL_BANNER")) return "";
  if (configSwitch(root, "banner") === "off") return "";
  if (!cmd || BANNER_SKIP.includes(cmd)) return "";
  const parts = [`ai-control v${version}`, `ai ${cmd}`];
  if (count > 0) parts.push(`本机第 ${count} 次`);
  return `◆ ${BRAND} · ${parts.join(" · ")}`;
}

function colorize(line, stream) {
  if (!stream.isTTY || process.env.NO_COLOR) return line;
  const [head, ...rest] = line.split(" · ");
  const tail = rest.length ? " · " + rest.join(" · ") : "";
  return `\x1b[36m${head}\x1b[0m\x1b[2m${tail}\x1b[0m`;
}

// TTY：走 stdout（人看的）；非 TTY（脚本/CI/AI 调用）：走 stderr（不污染 stdout 的机器契约）
function emitBanner(line) {
  if (!line) return;
  try {
    const out = process.stdout.isTTY ? process.stdout : process.stderr;
    out.write(colorize(line, out) + "\n");
  } catch { /* 忽略 */ }
}

// ── ai stats 渲染 ───────────────────────────────────────
function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "?";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtShort(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "?";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function topN(obj, n, prefix = "") {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([k, v]) => `${prefix}${k} ${v}`)
    .join(" · ");
}

// 中文标签按显示宽度对齐（CJK 占两列，padEnd 按字符数会错位）
function displayWidth(s) {
  return [...s].reduce((n, c) => n + (/[\u1100-\u115f\u2e80-\ua4cf\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/.test(c) ? 2 : 1), 0);
}

function padLabel(s, width) {
  return s + " ".repeat(Math.max(0, width - displayWidth(s)));
}

function renderStats({ version, rows, project }) {
  const s = summarize(rows);
  const line = (label, value) => console.log(`  ${padLabel(label, 10)}${value}`);

  console.log(`◆ ${BRAND} · ai-control v${version} · ai stats`);
  console.log("");
  console.log(`本机使用记录（只在 ${usageFile()}，不联网、不上报；AI_CONTROL_USAGE=off 可关）`);

  if (!s.total) {
    console.log("  还没有记录。跑一条 ai 命令就会开始记账。");
  } else {
    line("首次使用", `${fmtTime(s.first)}（累计 ${s.total} 次，最近 7 天 ${s.recent7} 次）`);
    line("非零退出", `${s.nonzero} 次（门禁拦截或失败；最近 7 天 ${s.nonzero7} 次）`);
    line("最近一次", fmtTime(s.last));
    console.log("");
    line("按命令", topN(s.byCmd, 8, "ai ") || "—");
    line("按项目", topN(s.byProj, 6) || "—");
    if (s.recent.length) {
      console.log("");
      console.log("  最近");
      for (const r of s.recent) {
        const mark = r.code ? `✗ exit=${r.code}` : "✓";
        console.log(`    ${fmtShort(r.ts)}  ${`ai ${r.cmd || "?"}`.padEnd(11)}${(r.id || "-").padEnd(22)}${mark.padEnd(10)}${r.proj || "（项目外）"}`);
      }
    }
  }

  console.log("");
  if (!project.root) {
    console.log("本项目：当前目录不在已安装的项目内（ai stats 可在任意目录运行）");
  } else {
    console.log(`本项目（${project.name}）`);
    line("变更", `进行中 ${project.active} 个 · 已交付 ${project.shipped} 个`);
    line("钩子拦截", project.intercepted
      ? `${project.intercepted} 次（最近 ${fmtTime(project.lastInterception)}）——AI 想越界被当场按住`
      : "0 次（还没拦过；记录见 .ai/interceptions.jsonl）");
  }
  console.log("");
  console.log("说明：这里统计的是 ai 命令被调用的次数与结果，不统计 AI 工具内部的每一次工具调用（那属于工具自己的日志）。");
}

module.exports = {
  BRAND, enabled, record, total, read, summarize, projectSnapshot,
  bannerText, emitBanner, renderStats, fmtTime, fmtShort, usageFile, colorize,
  explicitlyOn, explicitlyOff,
};
