// ai init：把 payload 资产装进目标项目；--update 只更新框架文件（先备份，不碰用户数据）
const fs = require("fs");
const path = require("path");
const { PAYLOAD, die, exists, copyDir } = require("./core");

const FRAMEWORK_DIRS = ["agents", "rules", "templates", "hooks"]; // .ai/ 下属于框架的部分
const STACKS = ["java", "go", "php", "vue", "react", "node", "mixed"];

function init(args) {
  const root = process.cwd();
  const update = args.includes("--update");
  const force = args.includes("--force");
  const stackIdx = args.indexOf("--stack");
  const stack = stackIdx >= 0 ? args[stackIdx + 1] : detectStack(root);
  if (stackIdx >= 0 && !STACKS.includes(stack)) {
    die(`未知 stack "${stack || ""}"。可用值: ${STACKS.join(" | ")}（多语言混合项目用 mixed）`);
  }

  const agentsMd = path.join(root, "AGENTS.md");
  const aiDir = path.join(root, ".ai");
  const stampNow = () => new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

  if (!update) {
    // 项目原有 AGENTS.md（未装过本系统）是常见情况：--force 备份后覆盖，避免与 --update 互踢死锁
    if ((exists(agentsMd) || exists(aiDir)) && !force) {
      if (exists(aiDir)) die("已安装（存在 .ai/）。升级框架用: ai init --update");
      die("AGENTS.md 已存在（项目原有）。用 ai init --force 安装：原文件自动备份为 AGENTS.md.bak-<时间戳>，装完后请把原有内容手动合并回 AGENTS.md 尾部");
    }
    if (force && exists(agentsMd)) {
      const bak = `AGENTS.md.bak-${stampNow()}`;
      fs.copyFileSync(agentsMd, path.join(root, bak));
      console.log(`原 AGENTS.md 已备份为 ${bak}，请安装后手动合并需要保留的内容。`);
    }
  } else {
    if (!exists(aiDir)) die("未安装（缺 .ai/），--update 无从更新。全新安装用 ai init；项目已有自己的 AGENTS.md 时用 ai init --force（自动备份原文件）");
    // 备份框架部分（用户数据 .ai/changes/、config.json 不动）
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const backup = path.join(aiDir, "backup", `update-${stamp}`);
    fs.mkdirSync(backup, { recursive: true });
    for (const d of FRAMEWORK_DIRS) {
      const src = path.join(aiDir, d);
      if (exists(src)) copyDir(src, path.join(backup, d));
    }
    if (exists(agentsMd)) fs.copyFileSync(agentsMd, path.join(backup, "AGENTS.md"));
    console.log(`已备份到 .ai/backup/update-${stamp}/`);
  }

  // 拷贝框架资产
  for (const d of FRAMEWORK_DIRS) {
    copyDir(path.join(PAYLOAD, d), path.join(aiDir, d));
  }
  fs.copyFileSync(path.join(PAYLOAD, "AGENTS.md"), agentsMd);

  // config：首装写入；update 保留已有
  const cfgPath = path.join(aiDir, "config.json");
  if (!exists(cfgPath)) {
    fs.writeFileSync(cfgPath, JSON.stringify({ stack: stack || "unknown", testCommand: "" }, null, 2) + "\n");
  }
  fs.mkdirSync(path.join(root, ".ai", "changes"), { recursive: true });

  // 框架版本落盘：Claude Code 会话横幅要显示它，doctor 用它查"框架文件远落后于 CLI"。
  // --update 时同样刷新——它就是用来记录"项目里这份 .ai/ 是哪个版本装的"。
  fs.writeFileSync(path.join(aiDir, "VERSION"), `${require("../package.json").version}\n`);

  // .gitignore 补 .ai/backup 与拦截记录（本机运行痕迹不入库）
  const gi = path.join(root, ".gitignore");
  for (const line of [".ai/backup/", ".ai/interceptions.jsonl"]) {
    if (!exists(gi) || !fs.readFileSync(gi, "utf8").includes(line)) {
      fs.appendFileSync(gi, `${line}\n`);
    }
  }

  console.log(update ? "UPDATE_OK：框架已更新，用户数据未触碰（.ai/changes/、config.json）。"
                     : `INIT_OK：已安装（stack=${stack || "unknown"}）。日常命令: ai new / check / confirm / test / ship`);
}

function detectStack(root) {
  if (exists(path.join(root, "pom.xml"))) return "java";
  if (exists(path.join(root, "go.mod"))) return "go";
  if (exists(path.join(root, "composer.json"))) return "php";
  if (exists(path.join(root, "package.json"))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.vue) return "vue";
      if (deps.react) return "react";
    } catch { /* 忽略解析失败 */ }
    return "node";
  }
  return "";
}

module.exports = { init, detectStack };
