// ai init：把 payload 资产装进目标项目；--update 只更新框架文件（先备份，不碰用户数据）
const fs = require("fs");
const path = require("path");
const { PAYLOAD, die, exists, copyDir } = require("./core");

const FRAMEWORK_DIRS = ["agents", "rules", "templates"]; // .ai/ 下属于框架的部分

function init(args) {
  const root = process.cwd();
  const update = args.includes("--update");
  const stackIdx = args.indexOf("--stack");
  const stack = stackIdx >= 0 ? args[stackIdx + 1] : detectStack(root);

  const agentsMd = path.join(root, "AGENTS.md");
  const aiDir = path.join(root, ".ai");

  if (!update) {
    if (exists(agentsMd)) die("AGENTS.md 已存在，拒绝覆盖。已安装项目请用: ai init --update");
    if (exists(aiDir)) die(".ai/ 已存在，拒绝覆盖。已安装项目请用: ai init --update");
  } else {
    if (!exists(aiDir)) die("未安装（缺 .ai/），--update 无从更新。先运行 ai init");
    // 备份框架部分（用户数据 openspec/、config.json 不动）
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
  fs.mkdirSync(path.join(root, "openspec", "changes"), { recursive: true });

  // .gitignore 补 .ai/backup
  const gi = path.join(root, ".gitignore");
  const line = ".ai/backup/";
  if (!exists(gi) || !fs.readFileSync(gi, "utf8").includes(line)) {
    fs.appendFileSync(gi, `${line}\n`);
  }

  console.log(update ? "UPDATE_OK：框架已更新，用户数据未触碰（openspec/、config.json）。"
                     : `INIT_OK：已安装（stack=${stack || "unknown"}）。日常命令: ai new / check / test / ship`);
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
