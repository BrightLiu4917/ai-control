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

// 契约内容哈希：proposal + test-cases + specs 的内容指纹。
// 用哈希而非 mtime 判定"确认后是否被改动"——git clone/换机器/checkout 会刷新
// mtime 导致全体确认假失效（团队场景不可用），内容哈希两个方向都准。
function contractHash(dir) {
  const crypto = require("crypto");
  const h = crypto.createHash("sha256");
  const files = [];
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    const rel = String(f).replace(/\\/g, "/");
    const base = path.basename(rel);
    const isContract = base === "proposal.md" || base === "test-cases.md" || rel.startsWith("specs");
    const p = path.join(dir, rel);
    if (isContract && p.endsWith(".md") && fs.statSync(p).isFile()) files.push(rel);
  }
  for (const rel of files.sort()) {
    h.update(rel).update("\0").update(fs.readFileSync(path.join(dir, rel))).update("\0");
  }
  return h.digest("hex");
}

function isShipped(dir) {
  return exists(path.join(dir, "shipped.json"));
}

// 活跃变更 = 目录存在且尚未交付
function activeChanges(root) {
  const base = path.join(root, ".ai", "changes");
  if (!exists(base)) return [];
  return fs.readdirSync(base).filter((d) => {
    try { return fs.statSync(path.join(base, d)).isDirectory() && !isShipped(path.join(base, d)); } catch { return false; }
  });
}

// ── ai confirm：把"用户点头"变成可审计留痕（by/at/sha/契约哈希/source）────
// 两条路，都不改变门禁强度，只影响留痕的诚实标注：
//   ai confirm <id>              → source: cli          （用户本人在终端敲的）
//   ai confirm <id> --attested   → source: ai-attested  （用户在对话里同意、AI 代记）
// 为什么不强制"必须用户本人敲"：AI 有 shell 权限，本地无法强制（拦得住普通代跑，
// 拦不住有心绕过）。与其给假的安全感，不如把来源如实写下来——见 README「确认留痕」。
const SOURCE_LABEL = {
  cli: "cli（用户本人敲的）",
  "ai-attested": "ai-attested（用户在对话里同意，AI 代记）",
};

function sourceLabel(src) {
  if (!src) return "未记录（旧版本产物）";
  return SOURCE_LABEL[src] || src;
}

function cmdConfirm(args) {
  const { id, root, dir } = requireChange(args, "用法: ai confirm <change-id> [--attested]（用户确认变更单后执行）");
  const attested = args.includes("--attested");
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
    hash: contractHash(dir),
    source: attested ? "ai-attested" : "cli",
  };
  fs.writeFileSync(path.join(dir, "confirmed.json"), JSON.stringify(record, null, 2) + "\n");
  console.log(`CONFIRM_OK：已留痕（by=${record.by}）。开始实现；proposal/test-cases 再改动需重新确认。`);
  if (attested) {
    console.log("来源：ai-attested（AI 代记）——留痕据此标注，门禁强度不变。");
  }
}

// 读取确认留痕；契约文件内容在确认后被改动 → 确认失效（按哈希，不受 mtime 影响）
function requireFreshConfirm(dir, id) {
  const confPath = path.join(dir, "confirmed.json");
  if (!exists(confPath)) {
    die(`变更未确认：向用户输出确认单。终端里由用户敲 ai confirm ${id}；GUI/app 场景可让用户在对话里回一句同意，再代记 ai confirm ${id} --attested`, 2);
  }
  let conf = {};
  try { conf = JSON.parse(read(confPath)); } catch { /* 落入下方校验 */ }
  const confAt = Date.parse(conf.at) || 0;
  if (!confAt) die("confirmed.json 无效；重新运行 ai confirm", 2);
  if (conf.hash) {
    if (contractHash(dir) !== conf.hash) {
      die(`确认已过期：proposal/test-cases/specs 在确认后被修改；重新向用户确认并运行 ai confirm ${id}`, 2);
    }
  } else {
    die(`confirmed.json 缺少契约哈希（旧版本产物）；重新运行 ai confirm ${id}`, 2);
  }
  return conf;
}

// 密钥扫描：交付前扫描本变更引入的 diff（禁止密钥入库/外发是红线）。
// 只用低误报的具体格式；关闭：config.json "secretScan": "off"
const SECRET_RES = [
  [/AKIA[0-9A-Z]{16}/, "AWS Access Key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "私钥"],
  [/gh[pos]_[A-Za-z0-9]{36}/, "GitHub Token"],
  [/npm_[A-Za-z0-9]{36}/, "npm Token"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, "Slack Token"],
  [/sk-[A-Za-z0-9_-]{32,}/, "API Key（sk- 前缀）"],
  [/jdbc:[^\s'"]*password=[^\s'"&]+/i, "带密码的连接串"],
];

function changeDiff(root, sinceSha) {
  const git = (cmd) => { try { return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).toString(); } catch { return ""; } };
  let out = git("git diff HEAD"); // 未提交部分
  if (sinceSha) out += git(`git diff ${sinceSha} HEAD`); // 确认以来已提交部分
  return out;
}

function scanSecrets(root, diffText) {
  if ((loadConfig(root).secretScan || "") === "off") return [];
  const hits = [];
  for (const line of diffText.split("\n")) {
    if (!line.startsWith("+") || line.startsWith("+++")) continue; // 只看新增行
    for (const [re, label] of SECRET_RES) {
      if (re.test(line)) hits.push(`${label}: ${line.slice(0, 80)}`);
    }
  }
  return [...new Set(hits)];
}

// ── ai ship ──────────────────────────────────────────────
function cmdShip(args) {
  const { id, root, dir } = requireChange(args, "用法: ai ship <change-id> [junit-报告目录...]");
  const { proposalText, casesText } = collect(dir);
  const conf = requireFreshConfirm(dir, id);
  // 确认来源如实显示（cli / ai-attested）——门禁强度不因来源而变，只让来源可见
  console.log(`确认来源：${sourceLabel(conf.source)}`);
  const confAt = Date.parse(conf.at);
  const rows = tcRows(casesText);
  const autoRows = rows.filter((l) => !MANUAL_RE.test(l));

  // 红线：本变更引入的 diff 不得含密钥（入库即泄露；独立审查外发前也靠这道拦）
  const diffText = changeDiff(root, conf.sha);
  const secrets = scanSecrets(root, diffText);
  if (secrets.length) {
    secrets.forEach((s) => console.error(`SECRET_HIT: ${s}`));
    die('diff 中检测到疑似密钥（见上）。移除或改用环境变量后重试；确属测试假数据可在 .ai/config.json 设 "secretScan": "off"', 2);
  }

  if (autoRows.length === 0) {
    console.log("全部用例为手动验证：跳过 JUnit 报告核对，验收结果须逐条写入交付说明。");
  } else {
    const extraDirs = args.filter((a) => !a.startsWith("--") && a !== id);
    // N-3 串号收口：存在多个"活跃"变更时（已交付的不算——防止历史变更永久触发强制隔离），
    // 全局报告目录无法证明"这是本变更的证据"——必须用隔离目录或显式传报告路径
    const scoped = path.join(root, "test-results", id);
    const active = activeChanges(root);
    if (!extraDirs.length && !exists(scoped) && active.length > 1) {
      die(`存在多个进行中变更（${active.join(", ")}）：证据必须按变更隔离。运行 ai test ${id}（报告自动写入 test-results/${id}/），或显式传入报告目录`, 2);
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

  // 声明诚实性软核验：实际改动 vs affected_files（只警告不拦——硬拦会造成
  // "改文件→补声明→确认失效→重确认"的死循环式打扰；清单供用户与独立审查参考）
  const undeclared = driftFiles(root, dir, conf.sha, proposalText);
  if (undeclared.length) {
    console.log(`注意：以下改动未在影响范围声明（软核验，不拦截）：`);
    undeclared.forEach((f) => console.log(`  ? ${f}`));
  }

  // 高风险提示（结构化判定，防 v1 的 grep 越界误报）
  if ((scopeItems(proposalText, "affected_tables") || []).length) {
    console.log("提示：本变更涉及数据库，建议在新会话用 .ai/templates/review-prompt.md 做一次独立审查。");
  } else if (/支付|状态流转/.test(proposalText.split("## 待确认问题")[0])) {
    console.log("提示：本变更涉及支付/状态流，建议在新会话用 .ai/templates/review-prompt.md 做一次独立审查。");
  }

  // 交付留痕：变更生命周期到此终结——guard-write 白名单与多变更隔离计数不再包含它
  fs.writeFileSync(path.join(dir, "shipped.json"),
    JSON.stringify({ at: new Date().toISOString(), evidence: autoRows.length ? "junit" : "manual" }, null, 2) + "\n");
  console.log("SHIP_GATES_PASSED：门禁全部通过（已写入 shipped.json）。手动用例结果与残余风险写入交付说明。");
}

// 确认以来实际改动、但未在 affected_files 声明的业务文件
function driftFiles(root, dir, sinceSha, proposalText) {
  const git = (cmd) => { try { return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch { return ""; } };
  let names = git("git diff --name-only HEAD");
  if (sinceSha) names += git(`git diff --name-only ${sinceSha} HEAD`);
  const changed = [...new Set(names.split("\n").map((s) => s.trim()).filter(Boolean))];
  if (!changed.length) return [];
  const declared = scopeItems(proposalText, "affected_files") || [];
  const FREE = [/\.md$/i, /(^|\/)\.(ai|claude|workbuddy|github)\//, /(^|\/)(tests?|__tests__|test-results)\//, /\.(test|spec)\.[jt]sx?$/, /Test\.(java|kt|php)$/, /_test\.go$/];
  return changed.filter((f) => {
    if (FREE.some((re) => re.test(f))) return false;
    return !declared.some((e) => {
      const d = e.replace(/^\.\//, "");
      if (d.endsWith("/")) return f.startsWith(d) || f.includes("/" + d);
      return f === d || f.endsWith("/" + d) || d.endsWith("/" + f) || f.endsWith(d);
    });
  });
}

module.exports = { cmdCheck, cmdConfirm, cmdShip, contractHash, activeChanges, isShipped, sourceLabel };
