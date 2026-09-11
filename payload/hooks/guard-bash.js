#!/usr/bin/env node
// Claude Code PreToolUse 钩子（Bash）：危险 SQL 在“执行前的一瞬间”拦截。
// 协议：stdin 收 JSON；exit 0 放行，exit 2 拦截（stderr 会反馈给 Claude）。
// 原则：只拦“错了不可逆”的模式；解析失败一律放行（fail-open，不能把用户会话搞瘫）。
// 逃生阀：环境变量 AI_CONTROL_HOOKS=off 时直接放行。

if (process.env.AI_CONTROL_HOOKS === "off") process.exit(0);

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    cmd = (JSON.parse(raw).tool_input || {}).command || "";
  } catch {
    process.exit(0);
  }
  // 确认必须出自用户之手：AI 代跑 ai confirm 会让"确认留痕"失去意义
  if (/(^|[;&|]\s*|\$\(\s*)(node\s+|npx\s+)?(\S*\/)?ai(\.js)?\s+confirm\b/.test(cmd)) {
    console.error("[ai-control] 已拦截：ai confirm 必须由用户本人在终端执行。请向用户输出确认单，并把 `ai confirm <change-id>` 这条命令交给用户运行。");
    process.exit(2);
  }
  const hits = [];
  if (/\bdrop\s+(table|database)\b/i.test(cmd)) hits.push("DROP TABLE/DATABASE");
  if (/\btruncate\s+(table\s+)?\S+/i.test(cmd)) hits.push("TRUNCATE");
  if (/\bdelete\s+from\b/i.test(cmd) && !/\bwhere\b/i.test(cmd)) hits.push("无 WHERE 的 DELETE");
  if (/\bupdate\s+\S+\s+set\b/i.test(cmd) && !/\bwhere\b/i.test(cmd)) hits.push("无 WHERE 的 UPDATE");

  if (hits.length) {
    console.error(
      `[ai-control] 已拦截危险 SQL（${hits.join("、")}）。` +
      `数据库破坏性操作必须走两阶段确认：输出变更确认包（目标 SQL + 回滚 SQL + 影响说明）等用户确认后，由用户执行或用户明确授权后执行；DROP/TRUNCATE 前默认备份（原表名_copy_yyyyMMdd）。`
    );
    process.exit(2);
  }
  process.exit(0);
});
