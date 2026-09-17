// 单元测试：核心解析函数（node 原生 assert，零依赖）
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { scopeItems, isLite } = require("../lib/core");
const { parseReports } = require("../lib/junit");
const { parseGoTestOutput, buildJUnitXml } = require("../lib/testrun");

let passed = 0;
function t(name, fn) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

// ── scopeItems ──
const proposal = `# p
## 影响范围
\`\`\`yaml
affected_files:
  - src/a.java
affected_tables:
  - none
affected_apis:
  - GET /api/x
  - POST /api/y
\`\`\`
`;
t("scopeItems 提取非 none 条目", () => {
  assert.deepStrictEqual(scopeItems(proposal, "affected_files"), ["src/a.java"]);
  assert.deepStrictEqual(scopeItems(proposal, "affected_tables"), []);
  assert.strictEqual(scopeItems(proposal, "affected_apis").length, 2);
  assert.strictEqual(scopeItems(proposal, "affected_pages"), null); // 字段缺失
});

t("scopeItems 兼容行内标量与中英文 none（P1-1 回归）", () => {
  const p2 = "## 影响范围\n```yaml\naffected_tables: none\naffected_apis: GET /api/x\naffected_pages: 无\naffected_files:\n  - None\n  - src/b.go\n```\n";
  assert.deepStrictEqual(scopeItems(p2, "affected_tables"), []);
  assert.deepStrictEqual(scopeItems(p2, "affected_apis"), ["GET /api/x"]);
  assert.deepStrictEqual(scopeItems(p2, "affected_pages"), []);
  assert.deepStrictEqual(scopeItems(p2, "affected_files"), ["src/b.go"]);
});

t("isLite 识别级别标记", () => {
  assert.ok(isLite("变更级别: lite\nxx"));
  assert.ok(!isLite("# 提案\n正文提到 lite 不算"));
});

// ── junit 解析 ──
function withXml(xml, fn) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "ut-"));
  fs.writeFileSync(path.join(d, "TEST-x.xml"), xml);
  fn(d);
}

t("junit: 自闭合与失败用例", () => {
  withXml(
    `<testsuite><testcase classname="T" name="test_TC01_ok"/><testcase name="test_TC02_bad" classname="T"><failure/></testcase></testsuite>`,
    (d) => {
      const r = parseReports([d]);
      assert.strictEqual(r.parsed, 1);
      assert.deepStrictEqual(r.failures, ["test_TC02_bad"]);
      assert.ok(r.passedIds.has(1) && !r.passedIds.has(2));
    }
  );
});

t("junit: name 不误取 classname（边界回归）", () => {
  withXml(`<testsuite><testcase classname="TC99Suite" name="no_id_here"/></testsuite>`, (d) => {
    const r = parseReports([d]);
    // classname 含 TC99 也计入（类名带 ID 是允许的约定）——但 name 提取不能取到 classname 的值
    assert.ok(r.passedIds.has(99));
  });
  withXml(`<testsuite><testcase classname="Plain" name="test_TC03_x"/></testsuite>`, (d) => {
    const r = parseReports([d]);
    assert.ok(r.passedIds.has(3));
  });
});

t("junit: skipped 不计入通过", () => {
  withXml(`<testsuite><testcase name="test_TC05_s" classname="T"><skipped/></testcase></testsuite>`, (d) => {
    const r = parseReports([d]);
    assert.ok(!r.passedIds.has(5));
  });
});

t("junit: TC 命名变体 TC01/TC-01/TC_01", () => {
  withXml(
    `<testsuite><testcase name="TC01_a" classname="T"/><testcase name="tc-02 b" classname="T"/><testcase name="TC_03_c" classname="T"/></testsuite>`,
    (d) => {
      const r = parseReports([d]);
      assert.ok(r.passedIds.has(1) && r.passedIds.has(2) && r.passedIds.has(3));
    }
  );
});

// ── go test -v 输出 → JUnit（多栈证据注入）──
t("go 输出解析：PASS/FAIL/SKIP 与子测试", () => {
  const out = [
    "=== RUN   TestTC01_Export",
    "--- PASS: TestTC01_Export (0.01s)",
    "    --- FAIL: TestTC02_Bad/子用例 (0.00s)",
    "--- SKIP: TestSkip (0.00s)",
    "PASS",
  ].join("\n");
  const cases = parseGoTestOutput(out);
  assert.strictEqual(cases.length, 3);
  assert.deepStrictEqual(cases.map(c => c.status), ["PASS", "FAIL", "SKIP"]);
  const xml = buildJUnitXml("go", cases);
  assert.ok(xml.includes('name="TestTC01_Export"'));
  assert.ok(xml.includes("<failure/>") && xml.includes("<skipped/>"));
  // 转出的 XML 必须能被自家 ship 解析回来（链路闭环）
  const os2 = require("os");
  const d = fs.mkdtempSync(path.join(os2.tmpdir(), "go-"));
  fs.writeFileSync(path.join(d, "go.xml"), xml);
  const r = parseReports([d]);
  assert.ok(r.passedIds.has(1) && !r.passedIds.has(2));
  assert.strictEqual(r.failures.length, 1);
});

// ── usage：使用统计与工牌（回答"到底有没有被用到"）──
const usage = require("../lib/usage");

t("usage.summarize 聚合命令/项目/退出码/近 7 天", () => {
  const iso = new Date().toISOString();
  const rows = [
    { ts: iso, cmd: "ship", proj: "a", code: 0 },
    { ts: iso, cmd: "ship", proj: "a", code: 2 },
    { ts: iso, cmd: "test", proj: "b", code: 0 },
    { ts: "2020-01-01T00:00:00.000Z", cmd: "init", proj: "a", code: 0 },
  ];
  const s = usage.summarize(rows);
  assert.strictEqual(s.total, 4);
  assert.strictEqual(s.byCmd.ship, 2);
  assert.strictEqual(s.byProj.a, 3);
  assert.strictEqual(s.nonzero, 1);        // 只有 code=2 那条算非零退出
  assert.strictEqual(s.recent7, 3);        // 2020 年那条不算最近 7 天
  assert.strictEqual(s.first, iso);        // 首次 = 文件首行，不做时间排序
  assert.strictEqual(s.recent.length, 4);
});

t("usage.summarize 容错：空日志与缺字段不炸", () => {
  assert.strictEqual(usage.summarize([]).total, 0);
  const s = usage.summarize([{}]);
  assert.strictEqual(s.total, 1);
  assert.strictEqual(s.byCmd["?"], 1);
  assert.strictEqual(s.byProj["（项目外）"], 1);
});

t("usage 工牌：品牌+版本+命令+计数；stats/version 不打、可关", () => {
  const keys = ["AI_CONTROL_QUIET", "AI_CONTROL_BANNER"];
  const saved = keys.map((k) => process.env[k]);
  keys.forEach((k) => delete process.env[k]);
  try {
    const line = usage.bannerText({ cmd: "ship", version: "9.9.9", count: 37 });
    assert.ok(line.startsWith("◆ bright-ai-coding · "), line);
    assert.ok(line.includes("ai-control v9.9.9"));
    assert.ok(line.includes("ai ship"));
    assert.ok(line.includes("本机第 37 次"));
    // 统计命令自己不打牌，否则输出会被自己的工牌盖住
    assert.strictEqual(usage.bannerText({ cmd: "stats", version: "9.9.9", count: 1 }), "");
    assert.strictEqual(usage.bannerText({ cmd: "version", version: "9.9.9", count: 1 }), "");
    // 计数缺失（如记账关闭）时不该出现"本机第 0 次"
    assert.ok(!usage.bannerText({ cmd: "ship", version: "9.9.9", count: 0 }).includes("本机第"));
    process.env.AI_CONTROL_QUIET = "1";
    assert.strictEqual(usage.bannerText({ cmd: "ship", version: "9.9.9", count: 1 }), "");
  } finally {
    keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; });
  }
});

t("usage 工牌：项目 config 里 banner=off 即静音", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-"));
  fs.mkdirSync(path.join(d, ".ai"), { recursive: true });
  fs.writeFileSync(path.join(d, ".ai", "config.json"), JSON.stringify({ banner: "off" }));
  const keys = ["AI_CONTROL_QUIET", "AI_CONTROL_BANNER"];
  const saved = keys.map((k) => process.env[k]);
  keys.forEach((k) => delete process.env[k]);
  try {
    assert.strictEqual(usage.bannerText({ cmd: "ship", version: "9.9.9", count: 1, root: d }), "");
    assert.ok(usage.bannerText({ cmd: "ship", version: "9.9.9", count: 1 }).length > 0); // 无项目上下文时按默认开
  } finally {
    keys.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; });
  }
});

t("usage 工牌配色：TTY 上色；NO_COLOR 与管道不上色", () => {
  const line = "◆ bright-ai-coding · ai-control v9.9.9 · ai ship";
  const saved = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  try {
    const colored = usage.colorize(line, { isTTY: true });
    assert.ok(colored.includes("\x1b[36m"), "TTY 下品牌应带青色");
    assert.ok(colored.includes("\x1b[2m"), "TTY 下其余应压暗");
    assert.strictEqual(usage.colorize(line, { isTTY: false }), line); // 管道/CI：原样，不带转义
    process.env.NO_COLOR = "1";
    assert.strictEqual(usage.colorize(line, { isTTY: true }), line);  // NO_COLOR 优先
  } finally {
    if (saved === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = saved;
  }
});

t("usage 项目配置 usage=off 停记账（env 之外的团队口径）", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "cfg2-"));
  fs.mkdirSync(path.join(d, ".ai"), { recursive: true });
  const saved = process.env.AI_CONTROL_USAGE;
  delete process.env.AI_CONTROL_USAGE;
  try {
    assert.strictEqual(usage.enabled(d), true);  // 没配置默认开
    fs.writeFileSync(path.join(d, ".ai", "config.json"), JSON.stringify({ usage: "off" }));
    assert.strictEqual(usage.enabled(d), false);
    assert.strictEqual(usage.enabled(), true);   // 无项目上下文时只看 env
  } finally {
    if (saved === undefined) delete process.env.AI_CONTROL_USAGE; else process.env.AI_CONTROL_USAGE = saved;
  }
});

t("usage 日志超 1MB 自动只留尾部（防无限膨胀）", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "usg-"));
  const file = path.join(d, "usage.jsonl");
  const row = JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", cmd: "check", id: "x", proj: "p", code: 0 });
  fs.writeFileSync(file, (row + "\n").repeat(20000));
  const savedFile = process.env.AI_CONTROL_USAGE_FILE;
  const savedUsage = process.env.AI_CONTROL_USAGE;
  process.env.AI_CONTROL_USAGE_FILE = file;
  delete process.env.AI_CONTROL_USAGE;
  try {
    assert.ok(fs.statSync(file).size > 1024 * 1024, "前置：文件确实超过 1MB");
    assert.strictEqual(usage.record({ ts: "2026-01-02T00:00:00.000Z", cmd: "ship", proj: "p", code: 0 }), true);
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    assert.ok(lines.length <= 2001, `裁剪后仍有 ${lines.length} 行`);
    assert.ok(lines[lines.length - 1].includes('"ship"'), "保留尾部、最新一条还在");
    assert.ok(usage.total() <= 2001);
  } finally {
    if (savedFile === undefined) delete process.env.AI_CONTROL_USAGE_FILE; else process.env.AI_CONTROL_USAGE_FILE = savedFile;
    if (savedUsage === undefined) delete process.env.AI_CONTROL_USAGE; else process.env.AI_CONTROL_USAGE = savedUsage;
  }
});

t("usage.read 跳过坏行（半截 JSON 不该让统计崩掉）", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "usg2-"));
  const file = path.join(d, "usage.jsonl");
  fs.writeFileSync(file, '{"ts":"2026-01-01T00:00:00.000Z","cmd":"ship","proj":"p","code":0}\n{"ts":"broken\n\nnot json at all\n');
  const saved = process.env.AI_CONTROL_USAGE_FILE;
  process.env.AI_CONTROL_USAGE_FILE = file;
  try {
    const rows = usage.read();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(usage.summarize(rows).byCmd.ship, 1);
  } finally {
    if (saved === undefined) delete process.env.AI_CONTROL_USAGE_FILE; else process.env.AI_CONTROL_USAGE_FILE = saved;
  }
});

t("拦截留痕：超上限只保留尾部（AI 反复撞门禁也不会无限增长）", () => {
  const { logInterception } = require("../payload/hooks/usage-log");
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "icp-"));
  fs.mkdirSync(path.join(d, ".ai"), { recursive: true });
  const saved = process.env.AI_CONTROL_USAGE;
  delete process.env.AI_CONTROL_USAGE;
  try {
    const file = path.join(d, ".ai", "interceptions.jsonl");
    const row = JSON.stringify({ ts: "2026-01-01T00:00:00.000Z", hook: "guard-write", reason: "x" });
    fs.writeFileSync(file, (row + "\n").repeat(2500));
    logInterception(d, { hook: "guard-write", reason: "unconfirmed-change", file: "src/A.java" });
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    assert.strictEqual(lines.length, 2000);
    assert.ok(lines[lines.length - 1].includes("unconfirmed-change"), "保留的是最新一条");
  } finally {
    if (saved === undefined) delete process.env.AI_CONTROL_USAGE; else process.env.AI_CONTROL_USAGE = saved;
  }
});

console.log(`\n${passed} 个单测全部通过。`);
