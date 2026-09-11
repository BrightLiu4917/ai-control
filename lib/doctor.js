// ai doctor：环境与安装体检。原则"信任但验证"——sync 说装好了不算数，逐项实测。
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { findProjectRoot, loadConfig, exists } = require("./core");
const { contractHash, isShipped } = require("./gate");

function cmdDoctor() {
  const ok = (b, label, fix) => console.log(`${b ? "OK  " : "FAIL"} ${label}${b || !fix ? "" : `——${fix}`}`);
  let bad = 0;
  const check = (b, label, fix) => { ok(b, label, fix); if (!b) bad++; };

  // 环境
  const [maj, min] = process.versions.node.split(".").map(Number);
  check(maj > 18 || (maj === 18 && min >= 17), `node ${process.version}（需 ≥18.17）`, "升级 Node");
  let hasGit = true;
  try { execSync("command -v git", { stdio: "ignore", shell: true }); } catch { hasGit = false; }
  check(hasGit, "git", "安装 git（confirm 留痕与独立审查需要）");

  // 安装
  const root = findProjectRoot();
  if (!root) {
    console.log("FAIL 未安装（未找到 .ai/）——运行 ai init");
    process.exit(1);
  }
  console.log(`OK   项目根: ${root}`);
  const cfg = loadConfig(root);
  check(exists(path.join(root, "AGENTS.md")), "AGENTS.md 契约", "ai init --update 恢复");
  console.log(`OK   stack=${cfg.stack || "unknown"}  testCommand=${cfg.testCommand || "（自动探测）"}`);

  // 钩子体检：文件在不在、settings.json 里是不是真挂上了（防"文案说启用、实际没装"）
  const hookFiles = ["guard-write.js", "guard-bash.js"].every((f) => exists(path.join(root, ".ai", "hooks", f)));
  check(hookFiles, ".ai/hooks/ 守卫脚本", "ai init --update 恢复");
  const settingsPath = path.join(root, ".claude", "settings.json");
  if (exists(settingsPath)) {
    let wired = false, legal = true;
    try { wired = JSON.stringify(JSON.parse(fs.readFileSync(settingsPath, "utf8"))).includes("guard-write.js"); }
    catch { legal = false; }
    check(legal, ".claude/settings.json 是合法 JSON", "修复语法后重跑 ai sync");
    if (legal) check(wired, "PreToolUse 钩子已挂载（Claude Code 写入/执行瞬间拦截）", "运行 ai sync 合并钩子");
  } else {
    console.log("提示  未生成 Claude Code 适配（不用 Claude Code 可忽略；否则运行 ai sync）");
  }

  // 变更概览：确认状态与失效检测
  const changesDir = path.join(root, ".ai", "changes");
  const ids = exists(changesDir)
    ? fs.readdirSync(changesDir).filter((d) => { try { return fs.statSync(path.join(changesDir, d)).isDirectory(); } catch { return false; } })
    : [];
  let confirmed = 0, stale = 0, shipped = 0;
  for (const id of ids) {
    const cdir = path.join(changesDir, id);
    if (isShipped(cdir)) { shipped++; continue; } // 已交付的不再体检
    const cp = path.join(cdir, "confirmed.json");
    if (!exists(cp)) continue;
    confirmed++;
    try {
      const conf = JSON.parse(fs.readFileSync(cp, "utf8"));
      if (conf.hash && conf.hash !== contractHash(cdir)) {
        stale++; console.log(`FAIL 变更 ${id}: 契约内容在确认后被修改——确认已失效，需重新 ai confirm`); bad++;
      }
    } catch { console.log(`FAIL 变更 ${id}: confirmed.json 无效`); bad++; }
  }
  console.log(`OK   变更: ${ids.length} 个（进行中已确认 ${confirmed}，确认失效 ${stale}，已交付 ${shipped}）`);

  console.log(bad ? `\nDOCTOR_FAIL：${bad} 项需处理。` : "\nDOCTOR_OK：全部体检通过。");
  if (bad) process.exit(1);
}

module.exports = { cmdDoctor };
