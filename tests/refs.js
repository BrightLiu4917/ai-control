#!/usr/bin/env node
// 引用存在性校验：payload 内所有 markdown 引用的文件必须真实存在。
// 防止重构删文件后规则/手册留下悬空引用——AI 读到"必须读取 X"而 X 不存在时会编造或空转。
// （v2 首次外部审计发现 9+ 处悬空引用，本校验固化为 CI 门禁防止再退化。）

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PAYLOAD = path.join(ROOT, "payload");

const problems = [];

function mdFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return mdFiles(p);
    return e.name.endsWith(".md") ? [p] : [];
  });
}

// v1 时代的路径/文件，v2 已不存在——出现即报错
const FORBIDDEN = [
  ".ai-control/",
  ".agent/",
  "ai-dev.sh",
  "run-tests.sh",
  "summarize-log.sh",
  "test-cases-check.sh",
  "test-cases-sync.sh",
  "openspec/config.yaml",
  "project.env",
  "codegen.toml",
  "CONTEXT-MAP.md",
  "TASK_TEMPLATE.md",
  "AGENT_ROUTING",
  "openspec/", // 目录已迁移到 .ai/changes 与 .ai/specs
];

for (const file of mdFiles(PAYLOAD)) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, "utf8");

  // 1. v1 残留 token
  for (const tok of FORBIDDEN) {
    if (text.includes(tok)) {
      problems.push(`${rel}: 含 v1 残留引用 "${tok}"`);
    }
  }

  // 2. .ai/ 路径必须在 payload 中真实存在（文件或目录）
  // 运行时由 ai init 生成、不随 payload 分发的文件
  const RUNTIME_OK = [".ai/config.json", ".ai/backup", ".ai/changes", ".ai/specs"];
  for (const m of text.matchAll(/\.ai\/[\w./一-龥-]+/g)) {
    const ref = m[0].replace(/[。，、；：)）\]】]+$/, ""); // 去掉句尾标点
    if (RUNTIME_OK.some((ok) => ref.startsWith(ok))) continue;
    const target = path.join(PAYLOAD, ref.slice(4)); // 去掉 ".ai/"
    if (!fs.existsSync(target)) {
      problems.push(`${rel}: 悬空引用 "${ref}"`);
    }
  }
}

if (problems.length) {
  [...new Set(problems)].forEach((p) => console.error(`[FAIL] ${p}`));
  console.error(`\n共 ${new Set(problems).size} 处引用问题：AI 读到不存在的"必须读取"会编造或空转。`);
  process.exit(1);
}
console.log("引用存在性校验通过：payload 无悬空引用、无 v1 残留。");
