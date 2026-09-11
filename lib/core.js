// 公共函数：项目根定位、change 目录、YAML 段解析
const fs = require("fs");
const path = require("path");

const PKG_ROOT = path.join(__dirname, "..");
const PAYLOAD = path.join(PKG_ROOT, "payload");

// 从 cwd 向上找 .ai/ 定位项目根
function findProjectRoot(from = process.cwd()) {
  let dir = from;
  while (true) {
    if (fs.existsSync(path.join(dir, ".ai"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function requireProjectRoot() {
  const root = findProjectRoot();
  if (!root) die("当前目录不在已安装项目内（未找到 .ai/）。先运行: ai init --stack <java|vue|react|go|php>");
  return root;
}

function changeDir(root, id) {
  return path.join(root, "openspec", "changes", id);
}

function die(msg, code = 1) {
  console.error(`[FAIL] ${msg}`);
  process.exit(code);
}

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function exists(p) {
  return fs.existsSync(p);
}

// 解析 proposal 影响范围里某个 key 的条目；返回非 none 的条目数组
function scopeItems(proposalText, key) {
  const re = new RegExp(`^\\s*${key}:\\s*\\n((?:\\s*-\\s*.*\\n?)*)`, "m");
  const m = proposalText.match(re);
  if (!m) return null; // 字段缺失
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^\s*-\s*/, "").trim())
    .filter((v) => v && v !== "none");
}

function isLite(proposalText) {
  return /^变更级别:\s*lite/m.test(proposalText);
}

// 渲染模板：{{KEY}} 替换
function renderTemplate(name, vars) {
  let s = read(path.join(PAYLOAD, "templates", name));
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{{${k}}}`).join(v);
  }
  return s;
}

// 递归拷贝目录
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

module.exports = {
  PKG_ROOT, PAYLOAD,
  findProjectRoot, requireProjectRoot, changeDir,
  die, read, exists, scopeItems, isLite, renderTemplate, copyDir,
};
