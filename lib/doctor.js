// ai doctor：环境与安装体检。原则"信任但验证"——sync 说装好了不算数，逐项实测。
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { findProjectRoot, loadConfig, exists } = require("./core");
const { contractHash, isShipped } = require("./gate");
const usage = require("./usage");

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

  // 钩子体检：守卫脚本在不在、各工具的配置里是不是真挂上了（防"文案说启用、实际没装"）
  const hookFiles = ["guard-write.js", "guard-bash.js"].every((f) => exists(path.join(root, ".ai", "hooks", f)));
  check(hookFiles, ".ai/hooks/ 守卫脚本", "ai init --update 恢复");
  const { HOOK_TARGETS } = require("../addons/export-adapters");
  const wired = [], broken = [], missing = [];
  for (const t of HOOK_TARGETS) {
    const p = path.join(root, t.file);
    if (!exists(p)) { missing.push(t.label); continue; }
    try {
      const txt = fs.readFileSync(p, "utf8");
      JSON.parse(txt); // 合法性
      if (txt.includes("guard-write.js")) wired.push(t.label);
      else broken.push(`${t.label}（配置里没有守卫脚本）`);
    } catch { broken.push(`${t.label}（JSON 非法）`); }
  }
  if (wired.length) {
    console.log(`OK   钩子已挂载 ${wired.length}/${HOOK_TARGETS.length} 个工具：${wired.join("、")}`);
    console.log("     拦截范围：未确认变更写业务代码 / 写范围外文件 / 危险 SQL / 不带 --attested 冒充用户敲 ai confirm");
  }
  if (missing.length) console.log(`提示  未装钩子：${missing.join("、")}——运行 ai sync（或 ai sync --tools=claude,codex 只装部分）`);
  broken.forEach((b) => { console.log(`FAIL 钩子配置异常：${b}`); bad++; });

  // 框架版本漂移：.ai/ 里这套框架文件是哪个版本装进去的（老安装没有 VERSION 文件）
  const vfile = path.join(root, ".ai", "VERSION");
  const installed = exists(vfile) ? fs.readFileSync(vfile, "utf8").trim() : "";
  const cliVersion = require("../package.json").version;
  if (!installed) {
    console.log("提示  .ai/VERSION 缺失（老版本安装）——运行 ai init --update 补齐");
  } else if (installed !== cliVersion) {
    console.log(`注意  项目里的框架文件是 v${installed}，当前 CLI 是 v${cliVersion}——运行 ai init --update 更新（先备份，不碰 .ai/changes/）`);
  } else {
    console.log(`OK   框架版本 v${installed}`);
  }

  // 变更概览：确认状态与失效检测
  const changesDir = path.join(root, ".ai", "changes");
  const ids = exists(changesDir)
    ? fs.readdirSync(changesDir).filter((d) => { try { return fs.statSync(path.join(changesDir, d)).isDirectory(); } catch { return false; } })
    : [];
  let confirmed = 0, stale = 0, shipped = 0;
  const srcCount = {};
  for (const id of ids) {
    const cdir = path.join(changesDir, id);
    if (isShipped(cdir)) { shipped++; continue; } // 已交付的不再体检
    const cp = path.join(cdir, "confirmed.json");
    if (!exists(cp)) continue;
    confirmed++;
    try {
      const conf = JSON.parse(fs.readFileSync(cp, "utf8"));
      const src = conf.source || "unknown";
      srcCount[src] = (srcCount[src] || 0) + 1;
      if (conf.hash && conf.hash !== contractHash(cdir)) {
        stale++; console.log(`FAIL 变更 ${id}: 契约内容在确认后被修改——确认已失效，需重新确认`); bad++;
      }
    } catch { console.log(`FAIL 变更 ${id}: confirmed.json 无效`); bad++; }
  }
  console.log(`OK   变更: ${ids.length} 个（进行中已确认 ${confirmed}，确认失效 ${stale}，已交付 ${shipped}）`);
  // 确认来源如实显示：cli = 用户本人敲的；ai-attested = AI 代记（门禁强度一样，来源不同）
  if (confirmed) {
    const parts = Object.entries(srcCount).map(([k, v]) => `${k === "unknown" ? "未记录（旧版本产物）" : k} ${v}`);
    console.log(`OK   确认来源: ${parts.join(" · ")}`);
  }

  // 使用情况：回答"这套东西到底有没有被用上"（本机日志，只看数量）
  const snap = usage.projectSnapshot(root);
  if (snap.intercepted) console.log(`OK   本项目被门禁拦下 ${snap.intercepted} 次（AI 想越界被当场按住）`);
  if (!usage.enabled(root)) {
    console.log("提示  使用记录已关闭（AI_CONTROL_USAGE=off 或 config 里 usage=off）");
  } else {
    const s = usage.summarize(usage.read());
    console.log(s.total
      ? `OK   本机使用: 累计 ${s.total} 次（最近 7 天 ${s.recent7}），非零退出 ${s.nonzero} 次 · 细分见 ai stats`
      : "提示  本机使用记录还是空的——跑一条 ai 命令就会开始记账（ai stats 查看）");
  }

  console.log(bad ? `\nDOCTOR_FAIL：${bad} 项需处理。` : "\nDOCTOR_OK：全部体检通过。");
  if (bad) process.exit(1);
}

module.exports = { cmdDoctor };
