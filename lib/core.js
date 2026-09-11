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
  return path.join(root, ".ai", "changes", id);
}

// 读取 .ai/config.json（缺失或解析失败返回空对象）
function loadConfig(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, ".ai", "config.json"), "utf8"));
  } catch { return {}; }
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

// 解析 proposal 影响范围里某个 key 的条目；返回非 none 的条目数组。
// 兼容两种 YAML 写法：行内标量（key: none / key: t_order）与块列表（key:\n  - xxx）。
// "无内容"的写法宽容匹配：none/None/无/暂无/N/A（P1-1：格式误伤会不断制造假失败）
const NONE_RE = /^[-~]?$|^(none|无|暂无|n\/a)$/i;
function scopeItems(proposalText, key) {
  const re = new RegExp(`^[ \\t]*${key}:[ \\t]*([^\\n]*)\\n?((?:[ \\t]*-[ \\t]*[^\\n]*\\n?)*)`, "m");
  const m = proposalText.match(re);
  if (!m) return null; // 字段缺失
  const items = [];
  if (m[1] && m[1].trim()) items.push(m[1].trim());
  for (const l of (m[2] || "").split("\n")) {
    const v = l.replace(/^[ \t]*-[ \t]*/, "").trim();
    if (v) items.push(v);
  }
  return items.filter((v) => !NONE_RE.test(v.replace(/[`'"]/g, "").trim()));
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
  findProjectRoot, requireProjectRoot, changeDir, loadConfig,
  die, read, exists, scopeItems, isLite, renderTemplate, copyDir,
};
