#!/usr/bin/env node
// Claude Code SessionStart 钩子：每次开新会话（或 /clear、compact、resume）时，
// 在会话里打一行"守规矩的工牌"，并顺手把项目状态注入上下文。
//
// 为什么需要它：真正改代码的往往是 AI 工具而不是人，`ai` 命令的横幅未必被看见。
// SessionStart 是 Claude Code 里唯一"每次会话都会响"的事件，正好用来回答
// "我装的东西到底有没有在岗"。
//
// 输出协议（Claude Code hooks）：
//   systemMessage        —— 展示给用户的消息（就是那行工牌）
//   hookSpecificOutput.additionalContext —— 注入 Claude 上下文，让它一开始就知道
//                                            本项目在受管状态、有哪些进行中变更
// 原则：出任何问题都安静退出（fail-open），绝不干扰会话启动。
//
// 关闭：AI_CONTROL_QUIET=1 或 .ai/config.json 里 "banner": "off"。

const fs = require("fs");
const path = require("path");
const { findRoot, activeChangeIds } = require("./usage-log");

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => main(raw));

// 默认关的开关：给了非假值才算开（AI_CONTROL_QUIET=1 / AI_CONTROL_BANNER=1）
function isOn(name) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  return v !== "" && !["off", "0", "false", "no"].includes(v);
}

function main(input) {
  try {
    JSON.parse(input || "{}"); // 协议校验；解析失败就走安静退出
    if (process.env.AI_CONTROL_HOOKS === "off") process.exit(0);
    if (isOn("AI_CONTROL_QUIET") || isOn("AI_CONTROL_BANNER")) process.exit(0);

    const root = findRoot();
    if (!root) process.exit(0);

    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(path.join(root, ".ai", "config.json"), "utf8")); } catch { /* 无配置按默认 */ }
    if (cfg.banner === "off") process.exit(0);

    let version = "";
    try { version = fs.readFileSync(path.join(root, ".ai", "VERSION"), "utf8").trim(); } catch { /* 老安装没这个文件 */ }
    const versionText = version ? `ai-control v${version}` : "ai-control";

    const active = activeChangeIds(root);
    const project = path.basename(root);

    let intercepted = 0;
    try {
      intercepted = fs.readFileSync(path.join(root, ".ai", "interceptions.jsonl"), "utf8").split("\n").filter(Boolean).length;
    } catch { /* 还没被拦过 */ }

    // 工牌：品牌 + 版本 + 项目 + 当前状态
    const state = active.length
      ? `进行中变更 ${active.length} 个（${active.slice(0, 3).join("、")}${active.length > 3 ? " 等" : ""}）`
      : "没有进行中的变更";
    const badge = `◆ bright-ai-coding · ${versionText} · 本项目受管控 · ${state}`;

    // 注入上下文：让 Claude 一上来就知道自己在受约束的项目里工作，不用用户提醒
    const context = [
      `本项目（${project}）已安装 ai-control（bright-ai-coding）控制系统。`,
      active.length
        ? `进行中变更：${active.join("、")}。开工前先读对应 .ai/changes/<id>/，未经用户确认不得写业务代码；用户同意后写确认留痕：ai confirm <id>（用户自己敲）或 ai confirm <id> --attested（用户已在对话里同意时代记）。`
        : "当前没有进行中的变更；新需求先走 ai new 建变更单。",
      intercepted ? `本项目历史上被门禁拦下 ${intercepted} 次（详见 .ai/interceptions.jsonl）。` : "",
      "变更全貌与本机使用统计：ai stats。",
    ].filter(Boolean).join(" ");

    process.stdout.write(JSON.stringify({
      systemMessage: badge,
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
    }) + "\n");
    process.exit(0);
  } catch {
    process.exit(0);
  }
}
