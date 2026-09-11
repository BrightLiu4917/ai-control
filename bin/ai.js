#!/usr/bin/env node
// ai —— 控制系统统一入口（npm 全局命令）
//
//   ai init [--stack <java|go|php|vue|react|node|mixed>] [--update|--force]   安装/更新到当前项目
//   ai new <id> [--lite|--upgrade]                          建变更骨架（lite 两件套）
//   ai check <id>                                           契约门禁：影响范围/lite越界/用例覆盖/待确认
//   ai confirm <id>                                         用户确认后留痕（by/at/sha），ship 的前置
//   ai test                                                 跑项目测试（JUnit 报告即证据）
//   ai ship <id> [报告目录...]                               证据门禁：报告直查 + 高风险提示
//   ai sync [--force]                                       导出 Claude/WorkBuddy 适配物
//   ai doctor                                               环境体检

const { die, requireProjectRoot, PKG_ROOT } = require("../lib/core");

const [cmd, ...args] = process.argv.slice(2);

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
  case "doctor": {
    const { execSync } = require("child_process");
    const has = (c) => { try { execSync(`command -v ${c}`, { stdio: "ignore", shell: true }); return true; } catch { return false; } };
    console.log(`node: ${process.version}`);
    console.log(`git:  ${has("git") ? "OK" : "缺失（必需）"}`);
    console.log(`项目: ${require("../lib/core").findProjectRoot() || "未安装（ai init）"}`);
    break;
  }
  case "version":
  case "--version":
  case "-v":
    console.log(require(`${PKG_ROOT}/package.json`).version);
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined: {
    const fs = require("fs");
    const self = fs.readFileSync(__filename, "utf8");
    console.log(self.split("\n").slice(1, 11).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    break;
  }
  default:
    die(`未知命令: ${cmd}（ai help 查看用法）`);
}
