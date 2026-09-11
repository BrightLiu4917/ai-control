#!/usr/bin/env node
// 预算门禁：防止 v2 重蹈 v1 覆辙（复杂度无止损点地膨胀）。
// 超预算 = 非零退出 = CI 红。加新功能前先想删什么。

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const BUDGETS = [
  { name: "内核 JS（bin/ + lib/）", glob: ["bin", "lib"], ext: ".js", max: 1500 },
  { name: "addons JS（含 payload/hooks）", glob: ["addons", "payload/hooks"], ext: ".js", max: 600 },
  { name: "AGENTS.md 契约", file: "payload/AGENTS.md", max: 100 },
  { name: "使用文档份数（根 *.md，治理文件除外）", docsMax: 1 },
];

function countLines(file) {
  return fs.readFileSync(file, "utf8").split("\n").length;
}

function walk(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p, ext);
    return e.name.endsWith(ext) ? [p] : [];
  });
}

let fail = false;
for (const b of BUDGETS) {
  if (b.docsMax !== undefined) {
    const GOVERNANCE = ["CHANGELOG.md", "SECURITY.md", "CODE_OF_CONDUCT.md", "CONTRIBUTING.md"]; // 治理文件不算使用文档
    const docs = fs.readdirSync(ROOT).filter((f) => f.endsWith(".md") && !GOVERNANCE.includes(f));
    const ok = docs.length <= b.docsMax;
    console.log(`${ok ? "OK " : "超支"} ${b.name}: ${docs.length}/${b.docsMax} (${docs.join(", ")})`);
    if (!ok) fail = true;
  } else if (b.file) {
    const p = path.join(ROOT, b.file);
    const n = fs.existsSync(p) ? countLines(p) : 0;
    const ok = n <= b.max;
    console.log(`${ok ? "OK " : "超支"} ${b.name}: ${n}/${b.max} 行`);
    if (!ok) fail = true;
  } else {
    const files = b.glob.flatMap((d) => walk(path.join(ROOT, d), b.ext));
    const n = files.reduce((s, f) => s + countLines(f), 0);
    const ok = n <= b.max;
    console.log(`${ok ? "OK " : "超支"} ${b.name}: ${n}/${b.max} 行（${files.length} 个文件）`);
    if (!ok) fail = true;
  }
}

if (fail) {
  console.error("\n预算超支：加新功能前先删旧的。这条规矩防的就是复杂度失控。");
  process.exit(1);
}
console.log("\n预算全部达标。");
