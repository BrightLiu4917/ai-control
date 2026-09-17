// 钩子共用：项目根定位 + 项目级拦截记录。
// 只记"被拦下"的事件（不是每次工具调用）——否则日志会被正常操作灌满，反而看不出信号。
// 两条硬约束：
//   - fail-open：本模块任何异常都不许改变钩子的判定结果；
//   - 可缺省：老版本安装里没有本文件时，钩子照常工作（只是不记录）。
const fs = require("fs");
const path = require("path");

// 项目根：Claude Code 注入的 CLAUDE_PROJECT_DIR 优先；否则从 cwd 向上找 .ai/
// （子目录启动 Claude 时 cwd 不是项目根，相对路径会失效）
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

// 留痕文件上限：只保留尾部 N 行（与 lib/usage.js 的使用日志同口径）。
// 为什么要裁：AI 可能陷在"反复尝试写被拦文件"的循环里，不裁就会无限增长。
const MAX_LINES = 2000;

function logInterception(root, entry) {
  if (!root) return;
  if (["off", "0", "false", "no"].includes(String(process.env.AI_CONTROL_USAGE || "").trim().toLowerCase())) return;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, ".ai", "config.json"), "utf8"));
    if (String(cfg.usage || "").trim().toLowerCase() === "off") return;
  } catch { /* 没配置就按默认开 */ }
  try {
    const file = path.join(root, ".ai", "interceptions.jsonl");
    fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    if (lines.length > MAX_LINES) fs.writeFileSync(file, lines.slice(-MAX_LINES).join("\n") + "\n");
  } catch { /* 记不上就算了，绝不能因此影响拦截判定 */ }
}

// 进行中（未交付）的变更 id
function activeChangeIds(root) {
  const base = path.join(root, ".ai", "changes");
  try {
    return fs.readdirSync(base).filter((d) => {
      try {
        return fs.statSync(path.join(base, d)).isDirectory()
          && !fs.existsSync(path.join(base, d, "shipped.json"));
      } catch { return false; }
    });
  } catch { return []; }
}

module.exports = { findRoot, logInterception, activeChangeIds };
