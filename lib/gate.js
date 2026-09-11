// gate：check（结构与契约门禁）与 ship（证据门禁）
const fs = require("fs");
const path = require("path");
const { requireProjectRoot, changeDir, die, read, exists, scopeItems, isLite } = require("./core");
const { parseReports, findReportDirs } = require("./junit");

const SCOPE_KEYS = ["affected_files", "affected_tables", "affected_apis", "affected_pages"];

function collect(dir) {
  const proposal = path.join(dir, "proposal.md");
  const cases = path.join(dir, "test-cases.md");
  if (!exists(proposal)) die("缺少 proposal.md");
  if (!exists(cases)) die("缺少 test-cases.md；验收用例必须在设计阶段产出并随 change 确认");
  return { proposalText: read(proposal), casesText: read(cases) };
}

function tcRows(casesText) {
  return casesText.split("\n").filter((l) => /^\|\s*TC-/i.test(l));
}

// ── ai check ──────────────────────────────────────────────
function cmdCheck(args) {
  const id = args.find((a) => !a.startsWith("--"));
  if (!id) die("用法: ai check <change-id>");
  const root = requireProjectRoot();
  const dir = changeDir(root, id);
  if (!exists(dir)) die(`change 不存在: ${id}`);
  const { proposalText, casesText } = collect(dir);
  const errors = [];

  // 影响范围字段齐全
  for (const k of SCOPE_KEYS) {
    if (scopeItems(proposalText, k) === null) errors.push(`影响范围缺少字段: ${k}`);
  }

  // lite 越界门禁
  if (isLite(proposalText)) {
    if ((scopeItems(proposalText, "affected_tables") || []).length)
      errors.push(`lite 变更不允许涉及数据库表；运行 ai new ${id} --upgrade 升级为完整流程（保留已写内容）`);
    if ((scopeItems(proposalText, "affected_apis") || []).length)
      errors.push(`lite 变更不允许涉及 API 契约；运行 ai new ${id} --upgrade 升级为完整流程（保留已写内容）`);
  }

  // 用例存在与覆盖闭环
  if (tcRows(casesText).length === 0) errors.push("test-cases.md 没有任何用例行（用例ID 须以 TC- 开头）");
  if ((scopeItems(proposalText, "affected_apis") || []).length && !casesText.includes("异常流"))
    errors.push("affected_apis 非 none：必须包含异常流用例（参数错误、数据不存在、状态不允许）");
  if ((scopeItems(proposalText, "affected_pages") || []).length) {
    if (!casesText.includes("权限")) errors.push("affected_pages 非 none：必须包含权限用例");
    if (!/空态|错误态/.test(casesText)) errors.push("affected_pages 非 none：必须包含空态或错误态用例");
  }

  // 待确认门禁：只查"## 待确认问题"章节内的未答条目（不全文扫字样）
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    const p = path.join(dir, String(f));
    if (!p.endsWith(".md") || !fs.statSync(p).isFile()) continue;
    for (const item of unresolvedItems(read(p))) {
      errors.push(`待确认问题未答（${path.basename(p)}）: ${item}`);
    }
  }

  if (errors.length) {
    errors.forEach((e) => console.error(`[FAIL] ${e}`));
    die(`check 未通过（${errors.length} 项）`, 2);
  }
  console.log("CHECK_PASSED：可向用户输出确认单（标注级别与判级理由）。");
}

function unresolvedItems(text) {
  const m = text.match(/^## 待确认问题\n([\s\S]*?)(?=^## |$(?![\s\S]))/m);
  if (!m) return [];
  return m[1]
    .split("\n")
    .filter((l) => /^\s*-\s*\S/.test(l))
    .map((l) => l.replace(/^\s*-\s*/, "").trim())
    .filter((v) => !/已确认|已解决|无待确认|暂无|（没有则写/.test(v));
}

// ── ai ship ──────────────────────────────────────────────
function cmdShip(args) {
  const id = args.find((a) => !a.startsWith("--"));
  if (!id) die("用法: ai ship <change-id> [junit-报告目录...]");
  const root = requireProjectRoot();
  const dir = changeDir(root, id);
  if (!exists(dir)) die(`change 不存在: ${id}`);
  const { proposalText, casesText } = collect(dir);
  const rows = tcRows(casesText);
  const autoRows = rows.filter((l) => !l.includes("手动"));

  if (autoRows.length === 0) {
    console.log("全部用例为手动验证：跳过 JUnit 报告核对，验收结果须逐条写入交付说明。");
  } else {
    const extraDirs = args.filter((a) => !a.startsWith("--") && a !== id);
    const reportDirs = extraDirs.length ? extraDirs : findReportDirs(root);
    if (!reportDirs.length) die("未找到 JUnit 报告目录；请先运行 ai test，或显式传入报告路径", 2);
    const { parsed, failures, passedIds } = parseReports(reportDirs);
    if (!parsed) die("报告目录中没有可解析的 JUnit XML", 2);
    const missing = autoRows
      .map((l) => l.split("|")[1].trim())
      .filter((tc) => {
        const n = parseInt(tc.replace(/^TC[-_]?0*/i, ""), 10);
        return !passedIds.has(n);
      });
    failures.forEach((f) => console.error(`FAILED_TEST: ${f}`));
    missing.forEach((c) => console.error(`MISSING_CASE: ${c}`));
    if (failures.length) die("存在失败的测试；修复后重跑（报告即证据）", 2);
    if (missing.length) die("以上非手动用例在报告中没有通过记录（测试名须含 TC-ID）", 2);
    console.log(`EVIDENCE_OK：报告 ${parsed} 份，非手动用例 ${autoRows.length} 条全部有通过记录。`);
  }

  // 高风险提示（结构化判定，防 v1 的 grep 越界误报）
  if ((scopeItems(proposalText, "affected_tables") || []).length) {
    console.log("提示：本变更涉及数据库，建议在新会话用 .ai/templates/review-prompt.md 做一次独立审查。");
  } else if (/支付|状态流转/.test(proposalText.split("## 待确认问题")[0])) {
    console.log("提示：本变更涉及支付/状态流，建议在新会话用 .ai/templates/review-prompt.md 做一次独立审查。");
  }

  console.log("SHIP_GATES_PASSED：门禁全部通过。手动用例结果与残余风险写入交付说明。");
}

module.exports = { cmdCheck, cmdShip };
