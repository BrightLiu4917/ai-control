// ai sync：导出多工具适配物（Claude Code + WorkBuddy）。
// Codex / Cursor / Kimi / Qoder 原生读 AGENTS.md，无需导出。
// 幂等：已存在跳过；--force 覆盖。WorkBuddy 技能自包含（内嵌被引用的规则快照）。
const fs = require("fs");
const path = require("path");

function sync(root, args) {
  const force = args.includes("--force");
  const ai = path.join(root, ".ai");
  const agentsDir = path.join(ai, "agents");
  const written = [];
  const skipped = [];

  function write(p, content) {
    if (fs.existsSync(p) && !force) { skipped.push(path.relative(root, p)); return; }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    written.push(path.relative(root, p));
  }

  const sec = (s, title) => (s.match(new RegExp(`^## ${title}\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m")) || [])[1]?.trim() || "";
  const firstLine = (s) => (s.trim().split("\n")[0] || "").replace(/。$/, "") + "。";

  const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.startsWith("agent-") && f.endsWith(".md"));

  // 1. CLAUDE.md
  write(path.join(root, "CLAUDE.md"),
`# 项目契约入口（Claude Code）

@AGENTS.md

- 角色手册已导出为 \`.claude/agents/\` 原生 subagent，匹配任务自动委派。
- OpenSpec 流程可通过 \`.claude/skills/\` 技能触发。
`);

  // 2. .claude/agents/
  for (const f of agentFiles) {
    const content = fs.readFileSync(path.join(agentsDir, f), "utf8");
    const id = f.replace(/\.md$/, "");
    const role = (content.match(/^# ([^（\n]+)/) || [, id])[1].trim();
    const duty = firstLine(sec(content, "职责"));
    const desc = `${role}。${duty}涉及对应场景时必须主动使用（use proactively）。`.replace(/\n/g, " ");
    write(path.join(root, ".claude", "agents", f), `---\nname: ${id}\ndescription: ${desc}\n---\n\n${content}`);
  }

  // 3. .claude/skills/
  const skills = {
    "new-feature": ["为新功能创建 change 骨架。用户说“加个XX”“帮我做XX”“改一下XX”等提出需求时使用；先影响探测判级（lite/完整）。",
      "# 新功能流程\n\n1. 与用户确认 change-id（小写中横线）。\n2. 运行 `ai new <id>`（小需求 `--lite`）。\n3. 按产品规格工程师手册补全 proposal 与验收用例，答掉待确认问题。\n4. `ai check <id>` 通过后，输出带级别与判级理由的确认单，等用户确认。\n5. 用户确认后运行 `ai confirm <id>` 写入确认留痕（ship 的前置）。\n"],
    "ready-check": ["校验 change 是否可请求确认。用户说“检查一下”“可以确认了吗”时使用。",
      "# 就绪校验\n\n运行 `ai check <id>`；失败逐项修复后重跑，通过后向用户输出确认单；用户点头后运行 `ai confirm <id>`。\n"],
    "release-ship": ["发布门禁。用户说“测一下”“能上线吗”“发布”时使用。",
      "# 发布流程\n\n1. `ai test` 跑测试（JUnit 报告即证据，可输出到 test-results/<change-id>/ 与其他变更隔离）。\n2. `ai ship <id>` 过证据门禁。\n3. 按 `.ai/rules/53-release.md` 清单过与本次变更相关的项。\n4. 高风险变更建议在新会话用 `.ai/templates/review-prompt.md` 做独立审查。\n"],
  };
  for (const [name, [desc, body]] of Object.entries(skills)) {
    write(path.join(root, ".claude", "skills", name, "SKILL.md"), `---\nname: ${name}\ndescription: ${desc}\n---\n\n${body}`);
  }

  // 4. workbuddy-skills/（自包含：内嵌被引用的 rules 与 dev 栈手册快照）
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
  console.log("WorkBuddy：项目级技能已写入 .workbuddy/skills/，重启 WorkBuddy 生效（无需复制；若曾装过 v1 全局技能，请从 ~/.workbuddy/skills/ 删除 agent-architect/agent-release 等残留）。Codex/Cursor/Kimi/Qoder 原生读 AGENTS.md 无需操作。");
}

module.exports = { sync };
