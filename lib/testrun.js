// ai test：跑项目测试（config.testCommand 优先，否则按栈自动探测）
// 多栈 JUnit 自动注入（P1-2）：证据门禁靠 JUnit 报告，但只有 Maven 自带——
// 其余栈在此自动补齐报告输出，统一落到 test-results/，用户零配置。
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { requireProjectRoot, loadConfig, die, exists } = require("./core");

const OUT_DIR = "test-results";

function cmdTest() {
  const root = requireProjectRoot();
  const custom = loadConfig(root).testCommand || "";
  if (custom) return run(root, custom, "自定义命令不注入报告参数；请确保命令本身输出 JUnit XML");

  if (exists(path.join(root, "pom.xml"))) return run(root, "mvn test"); // surefire 自带报告
  if (exists(path.join(root, "go.mod"))) return runGo(root);
  if (exists(path.join(root, "package.json"))) return runNode(root);
  if (exists(path.join(root, "composer.json")))
    return run(root, `vendor/bin/phpunit --log-junit ${OUT_DIR}/phpunit.xml`);
  die("无法确定测试命令；在 .ai/config.json 的 testCommand 中配置");
}

function run(root, cmd, note) {
  console.log(`==> ${cmd}`);
  if (note) console.log(`（${note}）`);
  const r = spawnSync(cmd, { shell: true, stdio: "inherit", cwd: root });
  if (r.status !== 0) die(`TEST_FAILED（exit=${r.status}）；修复后重跑。报告即验收证据`, r.status || 1);
  console.log("TEST_PASSED（JUnit 报告即验收证据，ai ship 时核对）");
}

// ── Go：go test 原生不产 XML；捕获 -v 输出自转 JUnit（零依赖，无需 gotestsum）──
function runGo(root) {
  const cmd = "go test ./... -v";
  console.log(`==> ${cmd}（输出将转为 JUnit 报告：${OUT_DIR}/go.xml）`);
  const r = spawnSync(cmd, { shell: true, cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "") + (r.stderr || "");
  process.stdout.write(out);
  const cases = parseGoTestOutput(out);
  if (cases.length) {
    fs.mkdirSync(path.join(root, OUT_DIR), { recursive: true });
    fs.writeFileSync(path.join(root, OUT_DIR, "go.xml"), buildJUnitXml("go", cases));
    console.log(`已生成 ${OUT_DIR}/go.xml（${cases.length} 条用例）`);
  }
  if (r.status !== 0) die(`TEST_FAILED（exit=${r.status}）；修复后重跑。报告即验收证据`, r.status || 1);
  console.log("TEST_PASSED（JUnit 报告即验收证据，ai ship 时核对）");
}

// 解析 `go test -v` 的 --- PASS/FAIL/SKIP 行（含子测试缩进）
function parseGoTestOutput(out) {
  const cases = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*--- (PASS|FAIL|SKIP): (\S+) \(([\d.]+)s\)/);
    if (m) cases.push({ name: m[2], status: m[1], time: m[3] });
  }
  return cases;
}

function buildJUnitXml(suite, cases) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const failures = cases.filter((c) => c.status === "FAIL").length;
  const body = cases
    .map((c) => {
      const inner = c.status === "FAIL" ? "<failure/>" : c.status === "SKIP" ? "<skipped/>" : "";
      return inner
        ? `  <testcase classname="${esc(suite)}" name="${esc(c.name)}" time="${c.time}">${inner}</testcase>`
        : `  <testcase classname="${esc(suite)}" name="${esc(c.name)}" time="${c.time}"/>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${esc(suite)}" tests="${cases.length}" failures="${failures}">\n${body}\n</testsuite>\n`;
}

// ── Node：Vitest 用内置 junit reporter；Jest 需 jest-junit（缺则给一行安装指引）──
function runNode(root) {
  let deps = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    deps = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch { /* 按 npm test 兜底 */ }

  if (deps.vitest) {
    return run(root, `npx vitest run --reporter=default --reporter=junit --outputFile=${OUT_DIR}/vitest.xml`);
  }
  if (deps.jest) {
    if (!deps["jest-junit"]) {
      console.log("提示：Jest 无内置 JUnit 输出。运行 `npm i -D jest-junit` 后重跑 ai test，报告将自动生成。");
      return run(root, "npm test", "本次无 JUnit 报告，ship 的证据门禁将无法通过");
    }
    console.log(`==> npx jest --reporters=default --reporters=jest-junit（报告：${OUT_DIR}/jest.xml）`);
    const r = spawnSync("npx jest --reporters=default --reporters=jest-junit", {
      shell: true, stdio: "inherit", cwd: root,
      env: { ...process.env, JEST_JUNIT_OUTPUT_DIR: OUT_DIR, JEST_JUNIT_OUTPUT_NAME: "jest.xml" },
    });
    if (r.status !== 0) die(`TEST_FAILED（exit=${r.status}）；修复后重跑。报告即验收证据`, r.status || 1);
    return console.log("TEST_PASSED（JUnit 报告即验收证据，ai ship 时核对）");
  }
  return run(root, "npm test", "未识别测试框架，无法自动注入 JUnit 输出；如需证据门禁请配置 junit reporter");
}

module.exports = { cmdTest, parseGoTestOutput, buildJUnitXml };
