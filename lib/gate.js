// gate：check（结构与契约门禁）、confirm（确认留痕）与 ship（证据门禁）
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { requireProjectRoot, changeDir, loadConfig, die, read, exists, scopeItems, isLite } = require("./core");
const { parseReports, findReportDirs } = require("./junit");

const SCOPE_KEYS = ["affected_files", "affected_tables", "affected_apis", "affected_pages"];

// 覆盖闭环关键词：内置中英双语，可在 .ai/config.json 的 gateKeywords 覆盖（P2-6）
const DEFAULT_KEYWORDS = {
  exception: ["异常流", "异常", "exception", "invalid"],
  permission: ["权限", "permission", "unauthorized"],
  emptyOrError: ["空态", "错误态", "empty", "error"],
};
const MANUAL_RE = /手动|manual/i;

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

function requireChange(args, usage) {
  const id = args.find((a) => !a.startsWith("--"));
  if (!id) die(usage);
  const root = requireProjectRoot();
  const dir = changeDir(root, id);
  if (!exists(dir)) die(`change 不存在: ${id}`);
  return { id, root, dir };
}

// ── check 核心（cmdCheck 与 cmdConfirm 共用）──────────────
function runCheck(root, dir, id) {
  const { proposalText, casesText } = collect(dir);
  const cfg = loadConfig(root);
  const kw = (name) => (cfg.gateKeywords && cfg.gateKeywords[name]) || DEFAULT_KEYWORDS[name];
  const hasKw = (name) => kw(name).some((k) => casesText.toLowerCase().includes(k.toLowerCase()));
  const errors = [];

  // 影响范围字段齐全
  for (const k of SCOPE_KEYS) {
    if (scopeItems(proposalText, k) === null) errors.push(`影响范围缺少字段: ${k}`);
  }
  const tables = scopeItems(proposalText, "affected_tables") || [];
  const apis = scopeItems(proposalText, "affected_apis") || [];
  const pages = scopeItems(proposalText, "affected_pages") || [];

  // lite 越界门禁
  if (isLite(proposalText)) {
    if (tables.length) errors.push(`lite 变更不允许涉及数据库表；运行 ai new ${id} --upgrade 升级为完整流程（保留已写内容）`);
    if (apis.length) errors.push(`lite 变更不允许涉及 API 契约；运行 ai new ${id} --upgrade 升级为完整流程（保留已写内容）`);
  }

  // 用例存在与覆盖闭环
  const rows = tcRows(casesText);
  if (rows.length === 0) errors.push("test-cases.md 没有任何用例行（用例ID 须以 TC- 开头）");
  if (apis.length && !hasKw("exception"))
    errors.push("affected_apis 非 none：必须包含异常流用例（参数错误、数据不存在、状态不允许）");
  if (pages.length) {
    if (!hasKw("permission")) errors.push("affected_pages 非 none：必须包含权限用例");
    if (!hasKw("emptyOrError")) errors.push("affected_pages 非 none：必须包含空态或错误态用例");
  }
  // P0-1：高风险变更（碰表/接口）必须有自动化用例，否则证据门禁会因"全手动豁免"而失效
  if ((tables.length || apis.length) && rows.length && rows.every((r) => MANUAL_RE.test(r))) {
    errors.push("涉及数据库/API 的变更必须至少 1 条非手动（自动化）用例——发布门禁凭 JUnit 报告验收，全手动会让证据链失效");
  }

  // 待确认门禁：只查"## 待确认问题"章节内的未答条目（不全文扫字样）
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    const p = path.join(dir, String(f));
    if (!p.endsWith(".md") || !fs.statSync(p).isFile()) continue;
    for (const item of unresolvedItems(read(p))) {
      errors.push(`待确认问题未答（${path.basename(p)}）: ${item}`);
    }
  }
  return errors;
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

function cmdCheck(args) {
  const { id, root, dir } = requireChange(args, "用法: ai check <change-id>");
  const errors = runCheck(root, dir, id);
  if (errors.length) {
    errors.forEach((e) => console.error(`[FAIL] ${e}`));
    die(`check 未通过（${errors.length} 项）`, 2);
  }
  console.log("CHECK_PASSED：可向用户输出确认单（标注级别与判级理由）。");
}

// ── ai confirm：把"用户点头"变成可审计留痕（by/at/sha）────
function cmdConfirm(args) {
  const { id, root, dir } = requireChange(args, "用法: ai confirm <change-id>（用户确认变更单后执行）");
  const errors = runCheck(root, dir, id);
  if (errors.length) {
    errors.forEach((e) => console.error(`[FAIL] ${e}`));
    die("check 未通过，禁止确认；修复后重试", 2);
  }
  const git = (cmd) => { try { return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
  const record = {
    by: git("git config user.name") || process.env.USER || "unknown",
    at: new Date().toISOString(),
    sha: git("git rev-parse HEAD"),
  };
  fs.writeFileSync(path.join(dir, "confirmed.json"), JSON.stringify(record, null, 2) + "\n");
  console.log(`CONFIRM_OK：已留痕（by=${record.by}）。开始实现；proposal/test-cases 再改动需重新确认。`);
}

// 读取确认留痕；proposal/test-cases/specs 在确认后被改动 → 确认失效
function requireFreshConfirm(dir, id) {
  const confPath = path.join(dir, "confirmed.json");
  if (!exists(confPath)) die(`变更未确认：向用户输出确认单，用户点头后运行 ai confirm ${id}`, 2);
  let confAt = 0;
  try { confAt = Date.parse(JSON.parse(read(confPath)).at) || 0; } catch { /* 落入下方校验 */ }
  if (!confAt) die("confirmed.json 无效；重新运行 ai confirm", 2);
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    const rel = String(f);
    const p = path.join(dir, rel);
    const base = path.basename(rel);
    const isContract = base === "proposal.md" || base === "test-cases.md" || rel.startsWith("specs");
    if (!isContract || !p.endsWith(".md") || !fs.statSync(p).isFile()) continue;
    if (fs.statSync(p).mtimeMs > confAt) {
      die(`确认已过期：${rel} 在确认后被修改；重新向用户确认并运行 ai confirm ${id}`, 2);
    }
  }
  return confAt;
}

// ── ai ship ──────────────────────────────────────────────
function cmdShip(args) {
  const { id, root, dir } = requireChange(args, "用法: ai ship <change-id> [junit-报告目录...]");
  const { proposalText, casesText } = collect(dir);
  const confAt = requireFreshConfirm(dir, id);
  const rows = tcRows(casesText);
  const autoRows = rows.filter((l) => !MANUAL_RE.test(l));

  if (autoRows.length === 0) {
    console.log("全部用例为手动验证：跳过 JUnit 报告核对，验收结果须逐条写入交付说明。");
  } else {
    const extraDirs = args.filter((a) => !a.startsWith("--") && a !== id);
    // N-3 串号收口：存在多个变更时，全局报告目录无法证明"这是本变更的证据"——
    // 必须用隔离目录（ai test <id> 自动生成）或显式传入报告路径
    const scoped = path.join(root, "test-results", id);
    const allChanges = fs.readdirSync(path.join(root, ".ai", "changes"))
      .filter((d) => { try { return fs.statSync(path.join(root, ".ai", "changes", d)).isDirectory(); } catch { return false; } });
    if (!extraDirs.length && !exists(scoped) && allChanges.length > 1) {
      die(`存在多个变更（${allChanges.join(", ")}）：证据必须按变更隔离。运行 ai test ${id}（报告自动写入 test-results/${id}/），或显式传入报告目录`, 2);
    }
    const reportDirs = extraDirs.length ? extraDirs : findReportDirs(root, id);
    if (!reportDirs.length) die(`未找到 JUnit 报告目录；请先运行 ai test ${id}`, 2);
    const { parsed, failures, passedIds, newestMtime } = parseReports(reportDirs);
    if (!parsed) die("报告目录中没有可解析的 JUnit XML", 2);
    // P0-2：报告必须晚于确认时间——旧迭代/别的变更的残留报告不算证据
    if (newestMtime < confAt) die("测试报告早于本变更的确认时间——疑似旧报告；重跑 ai test 后再 ship", 2);
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

module.exports = { cmdCheck, cmdConfirm, cmdShip };
