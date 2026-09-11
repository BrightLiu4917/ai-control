// ai test：跑项目测试（config.testCommand 优先，否则按栈自动探测）
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { requireProjectRoot, die, exists } = require("./core");

function cmdTest() {
  const root = requireProjectRoot();
  let cmd = "";
  const cfgPath = path.join(root, ".ai", "config.json");
  if (exists(cfgPath)) {
    try { cmd = JSON.parse(fs.readFileSync(cfgPath, "utf8")).testCommand || ""; } catch { /* 忽略 */ }
  }
  if (!cmd) {
    if (exists(path.join(root, "pom.xml"))) cmd = "mvn test";
    else if (exists(path.join(root, "go.mod"))) cmd = "go test ./...";
    else if (exists(path.join(root, "package.json"))) cmd = "npm test";
    else if (exists(path.join(root, "composer.json"))) cmd = "vendor/bin/phpunit";
  }
  if (!cmd) die("无法确定测试命令；在 .ai/config.json 的 testCommand 中配置");

  console.log(`==> ${cmd}`);
  const r = spawnSync(cmd, { shell: true, stdio: "inherit", cwd: root });
  if (r.status !== 0) die(`TEST_FAILED（exit=${r.status}）；修复后重跑。报告即验收证据`, r.status || 1);
  console.log("TEST_PASSED（JUnit 报告即验收证据，ai ship 时核对）");
}

module.exports = { cmdTest };
