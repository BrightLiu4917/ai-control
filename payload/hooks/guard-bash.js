#!/usr/bin/env node
// Claude Code PreToolUse 钩子（Bash）：危险 SQL 在“执行前的一瞬间”拦截。
// 协议：stdin 收 JSON；exit 0 放行，exit 2 拦截（stderr 会反馈给 Claude）。
// 原则：只拦“错了不可逆”的模式；解析失败一律放行（fail-open，不能把用户会话搞瘫）。
// 逃生阀：环境变量 AI_CONTROL_HOOKS=off 时直接放行。

if (process.env.AI_CONTROL_HOOKS === "off") process.exit(0);

// 拦截记录（可选）：老版本安装里没有 usage-log.js 时，判定照常，只是不记账
let logInterception = () => {};
let findRoot = () => null;
try { ({ logInterception, findRoot } = require("./usage-log")); } catch { /* 无记录能力 */ }

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    cmd = (JSON.parse(raw).tool_input || {}).command || "";
  } catch {
    process.exit(0);
  }
  // 确认留痕：不带 --attested 的 ai confirm 表示"用户本人在终端敲的"，AI 不能冒充。
  // 用户已在对话里明确同意的，改用 ai confirm <id> --attested，留痕会如实标注来源。
  const confirmHit = cmd.match(/(?:^|[;&|]\s*|\$\(\s*)((?:node\s+|npx\s+)?(?:\S*\/)?ai(?:\.js)?\s+confirm\b[^\n;&|]*)/);
  if (confirmHit && !/--attested\b/.test(confirmHit[1])) {
    const id = (confirmHit[1].match(/confirm\s+([^\s-][^\s]*)/) || [])[1] || "<change-id>";
    console.error(
      "[ai-control] 已拦截：不带 --attested 的 ai confirm 表示「用户本人在终端敲的」，AI 不得冒充。\n" +
      `  · 若用户已在对话里明确同意 → 改用：ai confirm ${id} --attested（留痕标注 source: ai-attested）\n` +
      `  · 若还没确认 → 向用户输出确认单，把这条交给用户自己敲：ai confirm ${id}`
    );
    logInterception(findRoot(), { hook: "guard-bash", reason: "ai-confirm-impersonation", change: id });
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
    logInterception(findRoot(), { hook: "guard-bash", reason: "dangerous-sql", detail: hits.join("、") });
    process.exit(2);
  }
  process.exit(0);
});
