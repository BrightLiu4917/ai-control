// ai sync：导出多工具适配物，并把"未确认变更不许写业务代码"前移成机械拦截。
//
// 钩子：六个工具（Claude Code / Codex / Qoder / Trae / Cursor / WorkBuddy）装的是同一份守卫脚本——
//   它们的 PreToolUse 都是「stdin 收 JSON（{tool_name, tool_input}）→ exit 2 阻断并把 stderr 回传模型」，
//   所以 .ai/hooks/guard-*.js 逻辑一行不改，差异只在各工具的配置文件格式。
// 规则与技能：CLAUDE.md、.claude/agents、.claude/skills、.workbuddy/skills；
//   Codex / Cursor / Kimi / Qoder / Trae 同时原生读 AGENTS.md。
// 幂等：已存在跳过；--force 覆盖（覆盖前备份）。WorkBuddy 技能自包含（内嵌被引用的规则快照）。
const fs = require("fs");
const path = require("path");

/* ── 多工具钩子目标表（依据各工具官方文档核实，2026-09）───────────────
 *   Claude Code  .claude/settings.json    { hooks: { PreToolUse: [...] } }
 *   Codex        .codex/hooks.json        事件直接在根、无 hooks 包裹；需在 config.toml 开
 *                                         [features] codex_hooks = true，项目级钩子还要在 /hooks 信任一次
 *   Qoder        .qoder/settings.json     { hooks: { PreToolUse: [...] } }
 *   Trae         .trae/hooks.json         { version: 1, hooks: { PreToolUse: [...] } }；shell 工具名是 RunCommand
 *   Cursor       .cursor/hooks.json       { version: 1, hooks: { preToolUse: [...] } }；事件名小驼峰、shell 工具名 Shell
 *   WorkBuddy    .workbuddy/settings.json { hooks: { PreToolUse: [...] } }（官方称完全兼容 Claude Code Hooks 规范）
 *
 * matchers 里的工具名取自各自文档；若某工具改版导致不匹配，把该 matcher 删掉即为「匹配全部工具」
 * （脚本对不含目标字段的输入会立刻放行，只是多一次进程启动开销）。
 * session：是否注入 SessionStart 会话工牌——只给输出格式已确认兼容的工具开；Trae / Cursor 的
 * SessionStart 输出约束未确认，先不装，免得把 JSON 当纯文本塞进上下文（待实测后可开）。
 */
const HOOK_TARGETS = [
  { id: "claude", label: "Claude Code", file: ".claude/settings.json", session: true,
    events: ["PreToolUse", "SessionStart"], matchers: ["Write|Edit|MultiEdit|NotebookEdit", "Bash"],
    sessionMatcher: "startup|resume|clear|compact",
    cmd: (s) => `node "\${CLAUDE_PROJECT_DIR:-.}/.ai/hooks/${s}"` },

  { id: "codex", label: "Codex", file: ".codex/hooks.json", rootEvents: true, session: true,
    events: ["PreToolUse", "SessionStart"], matchers: ["Write|Edit|apply_patch", "Bash"],
    sessionMatcher: "startup|resume", cmd: (s) => `node ".ai/hooks/${s}"` },

  { id: "qoder", label: "Qoder", file: ".qoder/settings.json", session: true,
    events: ["PreToolUse", "SessionStart"], matchers: ["Write|Edit", "Bash|run_in_terminal"],
    sessionMatcher: "startup|resume", cmd: (s) => `node ".ai/hooks/${s}"` },

  { id: "trae", label: "Trae", file: ".trae/hooks.json", version: 1, session: false,
    events: ["PreToolUse", "SessionStart"], matchers: ["Write|Edit|SearchReplace|Create", "RunCommand"],
    sessionMatcher: "", cmd: (s) => `node ".ai/hooks/${s}"` },

  { id: "cursor", label: "Cursor", file: ".cursor/hooks.json", version: 1, session: false,
    events: ["preToolUse", "sessionStart"], matchers: ["Write|Edit", "Shell"],
    sessionMatcher: "", cmd: (s) => `node ".ai/hooks/${s}"` },

  { id: "workbuddy", label: "WorkBuddy", file: ".workbuddy/settings.json", session: true,
    events: ["PreToolUse", "SessionStart"], matchers: ["Write|Edit|MultiEdit", "Bash"],
    sessionMatcher: "startup|resume", cmd: (s) => `node ".ai/hooks/${s}"` },
];

// 某工具要写入的「事件 → 条目」
function hookSpecsFor(t) {
  const mk = (matcher, script) => {
    const hooks = [{ type: "command", command: t.cmd(script) }];
    return matcher ? { matcher, hooks } : { hooks };
  };
  const specs = {
    [t.events[0]]: [mk(t.matchers[0], "guard-write.js"), mk(t.matchers[1], "guard-bash.js")],
  };
  if (t.session) specs[t.events[1]] = [mk(t.sessionMatcher, "session-banner.js")];
  return specs;
}

// 条目里引用的脚本名，用作去重键（升级时能替换旧写法，不重复追加）
function scriptName(entry) {
  const m = String(((entry.hooks || [])[0] || {}).command || "").match(/([\w.-]+\.js)/);
  return m ? m[1] : "";
}

function fileHas(root, rel, needle) {
  try { return fs.readFileSync(path.join(root, rel), "utf8").includes(needle); } catch { return false; }
}

// 合并某工具的钩子配置：只补/更新我们这三个脚本的条目，用户自己的 hooks 与其它字段原样保留。
// 非法 JSON 时不动该文件并返回 ok=false；写入后读回校验三个脚本都在。
function mergeHooksFile(root, t, written, skipped) {
  const p = path.join(root, t.file);
  let obj = {};
  if (fs.existsSync(p)) {
    try { obj = JSON.parse(fs.readFileSync(p, "utf8")); }
    catch {
      console.error(`警告：${t.file} 不是合法 JSON，已跳过 ${t.label} 钩子注入（未改动该文件）。`);
      return { tool: t, ok: false, added: 0 };
    }
  }
  // version 先落，保持与各工具官方示例一致的键顺序（Trae / Cursor 的示例都是 version 在前）
  if (t.version !== undefined && obj.version === undefined) obj.version = t.version;
  // Codex 的事件直接在根；其余工具挂在 hooks 下
  const container = t.rootEvents ? obj : (obj.hooks = obj.hooks || {});

  const specs = hookSpecsFor(t);
  let added = 0;
  for (const [event, entries] of Object.entries(specs)) {
    container[event] = container[event] || [];
    for (const entry of entries) {
      const base = scriptName(entry);
      if (!base) continue;
      const same = container[event].filter((e) => JSON.stringify(e).includes(base));
      if (same.length === 1 && JSON.stringify(same[0]) === JSON.stringify(entry)) continue; // 已是最新
      container[event] = container[event].filter((e) => !JSON.stringify(e).includes(base));
      container[event].push(entry);
      added++;
    }
  }
  if (added) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
    written.push(`${t.file}（${t.label}：合并 ${added} 条钩子，用户配置保留）`);
  } else if (fs.existsSync(p)) {
    skipped.push(`${t.file}（${t.label}：钩子已在）`);
  }
  const want = Object.values(specs).flat().map(scriptName);
  const text = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  const ok = want.every((s) => text.includes(s));
  if (!ok) console.error(`警告：${t.file} 写入后未找到全部钩子，请运行 ai doctor 复查。`);
  return { tool: t, ok, added };
}

function sync(root, args) {
  const force = args.includes("--force");
  const ai = path.join(root, ".ai");
  const agentsDir = path.join(ai, "agents");
  const written = [];
  const skipped = [];

  // 目标工具：默认全装；--tools=claude,codex 只装子集
  const toolsArg = (args.find((a) => a.startsWith("--tools=")) || "").split("=")[1] || "";
  const wanted = toolsArg.split(",").map((s) => s.trim()).filter(Boolean);
  const picked = wanted.length ? HOOK_TARGETS.filter((t) => wanted.includes(t.id)) : HOOK_TARGETS;

  function write(p, content) {
    if (fs.existsSync(p) && !force) { skipped.push(path.relative(root, p)); return; }
    if (fs.existsSync(p) && force && fs.readFileSync(p, "utf8") !== content) {
      // 覆盖前备份：用户手改过的生成物不许静默丢失
      const bak = `${p}.bak-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`;
      fs.copyFileSync(p, bak);
      written.push(path.relative(root, bak) + "（原文件备份）");
    }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    written.push(path.relative(root, p));
  }

  const sec = (s, title) => (s.match(new RegExp(`^## ${title}\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m")) || [])[1]?.trim() || "";
  const firstLine = (s) => (s.trim().split("\n")[0] || "").replace(/。$/, "") + "。";

  const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.startsWith("agent-") && f.endsWith(".md"));

  // 1. 多工具钩子注入（每个工具一份配置文件，合并而非覆盖）
  const hookResults = picked.map((t) => mergeHooksFile(root, t, written, skipped));
  const claudeRes = hookResults.find((r) => r.tool.id === "claude");
  const hooksOk = !!(claudeRes && claudeRes.ok);
  const bannerOk = hooksOk && fileHas(root, ".claude/settings.json", "session-banner.js");

  // 2. CLAUDE.md（钩子状态按合并的实际结果措辞，不许说大话）
  write(path.join(root, "CLAUDE.md"),
`# 项目契约入口（Claude Code）

@AGENTS.md

- 角色手册已导出为 \`.claude/agents/\` 原生 subagent，匹配任务自动委派。
- 变更流程可通过 \`.claude/skills/\` 技能触发。
${!claudeRes
    ? "- 本次 `ai sync --tools` 未包含 claude：Claude Code 的钩子未安装（要装就跑 `ai sync` 不带 --tools）。"
    : hooksOk
    ? "- PreToolUse 钩子已启用：未确认变更时写业务代码、写影响范围外文件、执行危险 SQL、**不带 --attested 代跑 ai confirm**（冒充用户本人敲）会被当场拦截（临时停用：AI_CONTROL_HOOKS=off）。"
    : "- 注意：PreToolUse 钩子未安装（.claude/settings.json 无法合并）；上述拦截不生效，仅靠契约约束。"}
${!bannerOk
    ? "- 注意：SessionStart 会话横幅未安装；不影响流程，只是看不到工牌。"
    : "- SessionStart 钩子已启用：每次开新会话/恢复/clear 会打印一行 bright-ai-coding 工牌，并把本项目进行中变更注入上下文（关掉：AI_CONTROL_QUIET=1）。"}
`);

  // 3. .claude/agents/
  for (const f of agentFiles) {
    const content = fs.readFileSync(path.join(agentsDir, f), "utf8");
    const id = f.replace(/\.md$/, "");
    const role = (content.match(/^# ([^（\n]+)/) || [, id])[1].trim();
    const duty = firstLine(sec(content, "职责"));
    const desc = `${role}。${duty}涉及对应场景时必须主动使用（use proactively）。`.replace(/\n/g, " ");
    write(path.join(root, ".claude", "agents", f), `---\nname: ${id}\ndescription: ${desc}\n---\n\n${content}`);
  }

  // 4. .claude/skills/
  const skills = {
    "new-feature": ["为新功能创建 change 骨架。用户说“加个XX”“帮我做XX”“改一下XX”等提出需求时使用；先影响探测判级（lite/完整）。",
      "# 新功能流程\n\n1. 与用户确认 change-id（小写中横线）。\n2. 运行 `ai new <id>`（小需求 `--lite`）。\n3. 按产品规格工程师手册补全 proposal 与验收用例，答掉待确认问题。\n4. `ai check <id>` 通过后，输出带级别与判级理由的确认单，等用户确认。\n5. 用户确认后写留痕：把 `ai confirm <id>` 交给用户自己敲，或用户已在对话里同意时代记 `ai confirm <id> --attested`（ship 的前置）。\n"],
    "ready-check": ["校验 change 是否可请求确认。用户说“检查一下”“可以确认了吗”时使用。",
      "# 就绪校验\n\n运行 `ai check <id>`；失败逐项修复后重跑，通过后向用户输出确认单；确认留痕把 `ai confirm <id>` 交给用户自己敲，或用户已同意时代记 `ai confirm <id> --attested`。\n"],
    "release-ship": ["发布门禁。用户说“测一下”“能上线吗”“发布”时使用。",
      "# 发布流程\n\n1. `ai test <change-id>` 跑测试（报告自动写入 test-results/<change-id>/，与其他变更隔离）。\n2. `ai ship <id>` 过证据门禁。\n3. 按 `.ai/rules/53-release.md` 清单过与本次变更相关的项。\n4. 高风险变更建议在新会话用 `.ai/templates/review-prompt.md` 做独立审查。\n"],
  };
  for (const [name, [desc, body]] of Object.entries(skills)) {
    write(path.join(root, ".claude", "skills", name, "SKILL.md"), `---\nname: ${name}\ndescription: ${desc}\n---\n\n${body}`);
  }

  // 5. .workbuddy/skills/（自包含：内嵌被引用的 rules 与 dev 栈手册快照）
  const NOTE = "\n\n---\n\n# 附录：内嵌快照\n\n> 本技能自包含；框架更新后需重跑 `ai sync --force` （项目级技能就地生效）。\n> 正文中的命令仅在安装了控制系统的项目内可执行。\n\n";
  const embed = (content) => {
    const refs = [...new Set([...content.matchAll(/\.ai\/(rules\/[0-9A-Za-z._-]+\.md|agents\/dev\/[a-z]+\.md)/g)].map((m) => m[1]))];
    const parts = refs
      .map((r) => path.join(ai, r))
      .filter((p) => fs.existsSync(p))
      .map((p) => `## 规则快照：${path.relative(ai, p)}\n\n${fs.readFileSync(p, "utf8").trim()}\n`);
    return parts.length ? content + NOTE + parts.join("\n") : content;
  };

  const contract = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  write(path.join(root, ".workbuddy", "skills", "ai-control-contract", "SKILL.md"),
    `---\nname: ai-control-contract\ndescription: AI 全栈控制系统总契约：红线、两个确认点、任务分级、验收契约。在装有本控制系统的项目内开发时必须先应用。\nversion: 2.0.0\ntags: contract, workflow, gates\n---\n\n${embed(contract)}`);
  for (const f of agentFiles) {
    const content = fs.readFileSync(path.join(agentsDir, f), "utf8");
    const id = f.replace(/\.md$/, "");
    const role = (content.match(/^# ([^（\n]+)/) || [, id])[1].trim();
    const duty = firstLine(sec(content, "职责"));
    write(path.join(root, ".workbuddy", "skills", id, "SKILL.md"),
      `---\nname: ${id}\ndescription: ${role}。${duty}\nversion: 2.0.0\ntags: ai-control, ${id.replace("agent-", "")}\n---\n\n${embed(content)}`);
  }

  console.log(`SYNC_OK written=${written.length} skipped=${skipped.length}`);
  written.forEach((p) => console.log(`  + ${p}`));

  // 钩子覆盖摘要：直接回答"我这样用，到底拦不拦得住"
  const cover = hookResults.map((r) =>
    `${r.tool.label}${r.ok ? (r.tool.session ? " ✓拦截+工牌" : " ✓拦截") : " ✗未就位"}`).join(" · ");
  console.log(`钩子覆盖：${cover}`);
  console.log("  钩子把「未确认变更就写业务代码 / 写范围外文件 / 危险 SQL / 冒充用户敲 ai confirm」变成机械拦截（逃生阀 AI_CONTROL_HOOKS=off）。");
  console.log("  生效条件：WorkBuddy 需 Cmd+Q 完全重启（关窗无效）；Codex 需在 config.toml 开 [features] codex_hooks = true，并在 /hooks 信任本项目钩子；Trae / Qoder / Cursor 装完重开 IDE 或新开会话。");
  console.log("  WorkBuddy 项目级技能已写入 .workbuddy/skills/（重启生效）。Codex / Cursor / Kimi / Qoder / Trae 同时原生读 AGENTS.md。");
}

module.exports = { sync, HOOK_TARGETS };
