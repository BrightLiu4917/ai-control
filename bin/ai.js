#!/usr/bin/env node
// ai —— 控制系统统一入口（npm 全局命令）
//
//   ai init [--stack <java|go|php|vue|react|node|mixed>] [--update|--force]   安装/更新到当前项目
//   ai new <id> [--lite|--upgrade]                          建变更骨架（lite 两件套）
//   ai check <id>                                           契约门禁：影响范围/lite越界/用例覆盖/待确认
//   ai confirm <id> [--attested]                            确认留痕；--attested = 用户已同意、AI 代记
//   ai test [<id>]                                          跑项目测试（带 id 时报告按变更隔离）
//   ai ship <id> [报告目录...]                               证据门禁：报告直查 + 高风险提示
//   ai sync [--force] [--tools=<ids>]                       导出各工具适配物与钩子（claude/codex/qoder/trae/cursor/workbuddy，默认为全部）
//   ai doctor                                               环境体检
//   ai stats                                                本机使用统计（跑了多少次、拦了几次）
//
const path = require("path");
const { die, PKG_ROOT, findProjectRoot, requireProjectRoot } = require("../lib/core");
const usage = require("../lib/usage");

const VERSION = require(`${PKG_ROOT}/package.json`).version;
const [cmd, ...args] = process.argv.slice(2);

// ── 使用记录（本机、离线、可关；fail-open，绝不影响命令本身）──────────
// 横幅在人看的场景（TTY）走 stdout，在脚本 / CI / AI 调用场景走 stderr——
// stdout 的机器契约（单行大写结果标记）不受影响。
// 关闭方式：AI_CONTROL_QUIET=1（只关横幅）/ AI_CONTROL_USAGE=off（连记录一起关）。
const SILENT = ["help", "version", "--version", "-v", undefined];
let root = null;
try { root = findProjectRoot(); } catch { root = null; }

// 位置参数（变更 id）：要跳过取值型开关的值，否则 `ai init --stack java` 会把 java 记成 id
const VALUE_FLAGS = ["--stack"];
function positionalId(list) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (VALUE_FLAGS.includes(a)) { i++; continue; }
    if (a.startsWith("--")) continue;
    return a;
  }
  return "";
}

if (!SILENT.includes(cmd)) {
  try {
    const on = usage.enabled(root);
    const count = on ? usage.total() + 1 : 0;
    usage.emitBanner(usage.bannerText({ cmd, version: VERSION, count, root }));
    if (on) {
      const entry = { ts: new Date().toISOString(), v: VERSION, cmd, id: positionalId(args) };
      // 项目名在退出时才算：ai init 之前这个目录还不是项目（跑完才成为项目）
      // 退出码即"这次门禁过没过"（die() 的 process.exit 也会触发）
      process.on("exit", (code) => {
        let p = "";
        try { const r = findProjectRoot(); p = r ? path.basename(r) : ""; } catch { p = ""; }
        usage.record({ ...entry, proj: p, code: code || 0 });
      });
    }
  } catch { /* 记录失败不拦命令 */ }
}

switch (cmd) {
  case "init":
    require("../lib/init").init(args);
    break;
  case "new":
    require("../lib/change").cmdNew(args);
    break;
  case "confirm":
    require("../lib/gate").cmdConfirm(args);
    break;
  case "check":
    require("../lib/gate").cmdCheck(args);
    break;
  case "test":
    require("../lib/testrun").cmdTest(args);
    break;
  case "ship":
    require("../lib/gate").cmdShip(args);
    break;
  case "sync":
    require("../addons/export-adapters").sync(requireProjectRoot(), args);
    break;
  case "doctor":
    require("../lib/doctor").cmdDoctor();
    break;
  case "stats":
    usage.renderStats({ version: VERSION, rows: usage.read(), project: usage.projectSnapshot(root) });
    break;
  case "version":
  case "--version":
  case "-v":
    console.log(VERSION);
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined: {
    const fs = require("fs");
    const self = fs.readFileSync(__filename, "utf8");
    console.log(self.split("\n").slice(1, 12).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    break;
  }
  default:
    die(`未知命令: ${cmd}（ai help 查看用法）`);
}
