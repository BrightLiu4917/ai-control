// JUnit XML 解析（零依赖，正则级；JUnit testcase 结构足够规整）
const fs = require("fs");
const path = require("path");

const TC_RE = /TC[-_]?0*(\d+)/gi;

function findReportDirs(root, changeId) {
  // 按变更隔离的报告目录优先：存在则只用它，避免别的变更/上次迭代的旧报告串号（P0-2）
  if (changeId) {
    const scoped = path.join(root, "test-results", changeId);
    if (fs.existsSync(scoped)) return [scoped];
  }
  return [
    "target/surefire-reports",
    "target/failsafe-reports",
    "build/test-results",
    "test-results",
    "reports/junit",
  ]
    .map((d) => path.join(root, d))
    .filter((d) => fs.existsSync(d));
}

function xmlFiles(dirs) {
  const out = [];
  for (const d of dirs) {
    const st = fs.statSync(d);
    if (st.isFile() && d.endsWith(".xml")) { out.push(d); continue; }
    if (!st.isDirectory()) continue;
    for (const f of fs.readdirSync(d, { recursive: true })) {
      const p = path.join(d, String(f));
      if (p.endsWith(".xml") && fs.statSync(p).isFile()) out.push(p);
    }
  }
  return out;
}

// 返回 { parsed, failures, passedIds, newestMtime: 最新报告的修改时间(ms) }
function parseReports(dirs) {
  let parsed = 0;
  let newestMtime = 0;
  const failures = [];
  const passedIds = new Set();

  for (const file of xmlFiles(dirs)) {
    const xml = fs.readFileSync(file, "utf8");
    // 匹配自闭合与含子元素两种 testcase
    const caseRe = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
    let m, found = false;
    while ((m = caseRe.exec(xml)) !== null) {
      found = true;
      const attrs = m[1] || "";
      const inner = m[2] || "";
      // 边界防护：name= 不能匹配到 classname= 内部（v1 grep 越界的同类坑）
      const name = (attrs.match(/(?:^|[^a-zA-Z])name="([^"]*)"/) || [])[1] || "";
      const cls = (attrs.match(/classname="([^"]*)"/) || [])[1] || "";
      const failed = /<(failure|error)\b/.test(inner);
      const skipped = /<skipped\b/.test(inner);
      if (failed) failures.push(name || "?");
      if (skipped) continue;
      let t;
      TC_RE.lastIndex = 0;
      const hay = `${name} ${cls}`;
      while ((t = TC_RE.exec(hay)) !== null) {
        if (!failed) passedIds.add(parseInt(t[1], 10));
      }
    }
    if (found) {
      parsed++;
      newestMtime = Math.max(newestMtime, fs.statSync(file).mtimeMs);
    }
  }
  return { parsed, failures, passedIds, newestMtime };
}

module.exports = { findReportDirs, parseReports };
