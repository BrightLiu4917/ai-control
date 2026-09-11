// 单元测试：核心解析函数（node 原生 assert，零依赖）
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { scopeItems, isLite } = require("../lib/core");
const { parseReports } = require("../lib/junit");

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

console.log(`\n${passed} 个单测全部通过。`);
