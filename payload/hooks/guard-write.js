#!/usr/bin/env node
// Claude Code PreToolUse 钩子（Write/Edit）：把"change 确认前禁止写业务代码"从
// 提示词约束前移为写入瞬间的机械拦截。
// 协议：stdin 收 JSON；exit 0 放行，exit 2 拦截（stderr 反馈给 Claude）。
// 原则：
//   - fail-open——解析失败/结构异常一律放行；
//   - 只看"活跃"变更（已 shipped 的不算——防止白名单随历史变更膨胀）；
//   - 简单任务通道——未确认草稿只锁"它自己声明要改的文件"，无关小改不拦；
//   - 已确认变更实现期间，业务代码写入须落在其声明的影响范围内。
// 逃生阀：AI_CONTROL_HOOKS=off，或 .ai/config.json 里 "hooks": "off"。

const fs = require("fs");
const path = require("path");

if (process.env.AI_CONTROL_HOOKS === "off") process.exit(0);

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    main(JSON.parse(raw));
  } catch {
    process.exit(0);
  }
});

// 项目根：Claude Code 注入的 CLAUDE_PROJECT_DIR 优先；否则从 cwd 向上找 .ai/
// （子目录启动 Claude 时 cwd 不是项目根，相对路径会失效——B 修复）
function findRoot() {
  if (process.env.CLAUDE_PROJECT_DIR && fs.existsSync(path.join(process.env.CLAUDE_PROJECT_DIR, ".ai"))) {
    return process.env.CLAUDE_PROJECT_DIR;
  }
  let dir = process.cwd();
  while (true) {
    if (fs.existsSync(path.join(dir, ".ai"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function affectedFiles(changesDir, id) {
  try {
    const text = fs.readFileSync(path.join(changesDir, id, "proposal.md"), "utf8");
    const m = text.match(/^[ \t]*affected_files:[ \t]*([^\n]*)\n?((?:[ \t]*-[ \t]*[^\n]*\n?)*)/m);
    if (!m) return [];
    const items = [];
    if (m[1] && m[1].trim()) items.push(m[1].trim());
    for (const l of (m[2] || "").split("\n")) {
      const v = l.replace(/^[ \t]*-[ \t]*/, "").replace(/[`'"]/g, "").trim();
      if (v && !/^(none|无|暂无|n\/a)$/i.test(v)) items.push(v);
    }
    return items;
  } catch { return []; }
}

function matches(rel, entries) {
  const norm = (s) => s.replace(/^\.\//, "").replace(/\\/g, "/");
  return entries.some((e) => {
    const d = norm(e);
    if (d.endsWith("/")) return rel.startsWith(d) || rel.includes("/" + d);
    return rel === d || rel.endsWith("/" + d) || d.endsWith("/" + rel) || rel.endsWith(d);
  });
}

function main(input) {
  const fp = (input.tool_input || {}).file_path || (input.tool_input || {}).notebook_path || "";
  if (!fp) process.exit(0);
  const root = findRoot();
  if (!root) process.exit(0);
  try {
    if ((JSON.parse(fs.readFileSync(path.join(root, ".ai", "config.json"), "utf8")).hooks || "") === "off") process.exit(0);
  } catch { /* 无配置则默认开启 */ }

  const rel = path.relative(root, path.resolve(root, fp)).replace(/\\/g, "/");

  // 永远放行：文档、测试、框架自身目录（简单任务与流程文件不受限）
  const FREE = [
    /\.md$/i,
    /(^|\/)\.(ai|claude|workbuddy|github|git)\//,
    /(^|\/)(tests?|__tests__|test-results)\//,
    /\.(test|spec)\.[jt]sx?$/,
    /Test\.(java|kt|php)$/,
    /_test\.go$/,
  ];
  if (rel.startsWith("..") || FREE.some((re) => re.test(rel))) process.exit(0);

  const changesDir = path.join(root, ".ai", "changes");
  let ids = [];
  try {
    ids = fs.readdirSync(changesDir).filter((d) => {
      try {
        return fs.statSync(path.join(changesDir, d)).isDirectory()
          && !fs.existsSync(path.join(changesDir, d, "shipped.json")); // 已交付不再约束
      } catch { return false; }
    });
  } catch { process.exit(0); }
  if (!ids.length) process.exit(0);

  const confirmed = ids.filter((id) => fs.existsSync(path.join(changesDir, id, "confirmed.json")));
  const drafts = ids.filter((id) => !confirmed.includes(id));

  // 未确认草稿只锁"它自己声明要改的文件"——防 AI 先实现后确认；
  // 无关文件放行（简单任务通道：改个配置/错别字不该被烂尾草稿连坐）
  for (const id of drafts) {
    if (matches(rel, affectedFiles(changesDir, id))) {
      console.error(
        `[ai-control] 已拦截：${rel} 是变更 ${id} 声明要改的文件，但该变更尚未确认。` +
        `先 ai check 通过、向用户输出确认单，用户点头后由用户运行 ai confirm ${id}，再开始实现。`
      );
      process.exit(2);
    }
  }

  // 已确认变更实现期间：业务代码写入须落在某个已确认变更的影响范围内
  if (confirmed.length) {
    const declared = confirmed.flatMap((id) => affectedFiles(changesDir, id));
    if (!declared.length) process.exit(0); // 声明为空/异常：fail-open
    if (!matches(rel, declared)) {
      console.error(
        `[ai-control] 已拦截：${rel} 不在任何进行中变更的 affected_files 内（进行中: ${confirmed.join(", ")}）。` +
        `属本变更的改动请更新 proposal 影响范围并重新经用户确认；与变更无关的简单任务请先交付当前变更，或让用户以 AI_CONTROL_HOOKS=off 临时放行。`
      );
      process.exit(2);
    }
  }
  process.exit(0);
}
