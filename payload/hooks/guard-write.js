#!/usr/bin/env node
// Claude Code PreToolUse 钩子（Write/Edit）：把“change 确认前禁止写业务代码”从
// 提示词约束前移为写入瞬间的机械拦截——违规不再是“写完被 check 打回”，而是第一行就写不进去。
// 协议：stdin 收 JSON；exit 0 放行，exit 2 拦截（stderr 反馈给 Claude）。
// 原则：fail-open——解析失败/结构异常一律放行；只拦最明确的两种违规：
//   1) 存在变更单但一个都没确认 → 禁止写业务代码（文档/测试/.ai 内除外）
//   2) 已有确认的变更 → 业务代码路径必须落在某个已确认变更的 affected_files 内
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

function main(input) {
  const fp = (input.tool_input || {}).file_path || (input.tool_input || {}).notebook_path || "";
  if (!fp) process.exit(0);
  const root = process.cwd();
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
    ids = fs.readdirSync(changesDir).filter((d) => fs.statSync(path.join(changesDir, d)).isDirectory());
  } catch { process.exit(0); } // 未安装/无变更目录：不拦（契约仍然管）
  if (!ids.length) process.exit(0);

  const confirmed = ids.filter((id) => fs.existsSync(path.join(changesDir, id, "confirmed.json")));
  if (!confirmed.length) {
    console.error(
      `[ai-control] 已拦截：存在变更单（${ids.join(", ")}）但均未确认。` +
      `change 确认前禁止写业务代码——先 ai check 通过、向用户输出确认单，用户点头后 ai confirm <id> 再实现。`
    );
    process.exit(2);
  }

  // 汇总已确认变更声明的影响文件
  const declared = [];
  for (const id of confirmed) {
    try {
      const text = fs.readFileSync(path.join(changesDir, id, "proposal.md"), "utf8");
      const m = text.match(/^[ \t]*affected_files:[ \t]*([^\n]*)\n?((?:[ \t]*-[ \t]*[^\n]*\n?)*)/m);
      if (!m) continue;
      if (m[1] && m[1].trim()) declared.push(m[1].trim());
      for (const l of (m[2] || "").split("\n")) {
        const v = l.replace(/^[ \t]*-[ \t]*/, "").replace(/[`'"]/g, "").trim();
        if (v && !/^(none|无|暂无|n\/a)$/i.test(v)) declared.push(v);
      }
    } catch { /* 单个变更读取失败不影响其他 */ }
  }
  if (!declared.length) process.exit(0); // 声明为空/异常：fail-open

  const norm = (s) => s.replace(/^\.\//, "").replace(/\\/g, "/");
  const ok = declared.some((e) => {
    const d = norm(e);
    if (d.endsWith("/")) return rel.startsWith(d) || rel.includes("/" + d);
    return rel === d || rel.endsWith("/" + d) || d.endsWith("/" + rel) || rel.endsWith(d);
  });
  if (!ok) {
    console.error(
      `[ai-control] 已拦截：${rel} 不在任何已确认变更的 affected_files 内` +
      `（已确认: ${confirmed.join(", ")}）。禁止修改无关文件；确需修改则更新 proposal 影响范围并重新经用户确认（ai confirm）。`
    );
    process.exit(2);
  }
  process.exit(0);
}
