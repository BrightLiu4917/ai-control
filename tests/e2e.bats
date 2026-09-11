#!/usr/bin/env bats
# v2 验收测试（先于实现编写；实现向本文件收敛）
# 覆盖：安装 / lite 全手动 / 完整变更证据链 / lite 越界升级 / 高风险提示 / 待确认门禁 / 适配导出

REPO="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
AI="node $REPO/bin/ai.js"

setup() {
  PROJ="$BATS_TEST_TMPDIR/proj"
  mkdir -p "$PROJ"
  git -C "$PROJ" init -q
  cd "$PROJ"
}

install_here() {
  run $AI init --stack java
  [ "$status" -eq 0 ]
}

# ── 1. 安装 ──────────────────────────────────────────────

# init 安装：AGENTS.md + ai 入口 + .ai/ 资产齐全
@test "t01 install basic assets" {
  install_here
  [ -f "$PROJ/AGENTS.md" ]
  [ -d "$PROJ/.ai/rules" ]
  [ -d "$PROJ/.ai/agents" ]
  [ -d "$PROJ/.ai/templates" ]
  [ -f "$PROJ/.ai/config.json" ]
  grep -q '"stack": "java"' "$PROJ/.ai/config.json"
  # 契约预算：≤100 行
  [ "$(wc -l < "$PROJ/AGENTS.md")" -le 100 ]
}

# init 不覆盖已有 AGENTS.md；--update 只更新框架且先备份
@test "t02 no overwrite and update with backup" {
  echo "用户自己的契约" > "$PROJ/AGENTS.md"
  run $AI init --stack java
  [ "$status" -ne 0 ]
  grep -q '已存在' <<<"$output"
  [ "$(cat "$PROJ/AGENTS.md")" = "用户自己的契约" ]

  rm "$PROJ/AGENTS.md"
  install_here
  mkdir -p "$PROJ/.ai/changes/keep" && echo "用户数据" > "$PROJ/.ai/changes/keep/proposal.md"
  run $AI init --update
  [ "$status" -eq 0 ]
  [ "$(cat "$PROJ/.ai/changes/keep/proposal.md")" = "用户数据" ]
  ls "$PROJ/.ai/backup/" | grep -q 'update-'
}

# ── 2. lite 全手动路径（v1 曾经的死锁场景）─────────────────

# lite 改文案：两件套 → check → ship 全程无阻
@test "t03 lite all-manual flow passes" {
  install_here
  run $AI new fix-text --lite
  [ "$status" -eq 0 ]
  [ -f "$PROJ/.ai/changes/fix-text/proposal.md" ]
  [ -f "$PROJ/.ai/changes/fix-text/test-cases.md" ]
  [ ! -f "$PROJ/.ai/changes/fix-text/tasks.md" ]
  grep -q '^变更级别: lite' "$PROJ/.ai/changes/fix-text/proposal.md"

  # 模拟 AI 补全：影响文件 + 一条手动用例 + 答掉待确认
  python3 - "$PROJ/.ai/changes/fix-text" <<'PY'
import sys, re
d = sys.argv[1]
p = open(f"{d}/proposal.md", encoding="utf-8").read()
p = p.replace("- （补全：影响的文件）", "- src/views/Order.vue")
p = re.sub(r"## 待确认问题\n.*", "## 待确认问题\n- 无待确认\n", p, flags=re.S)
open(f"{d}/proposal.md", "w", encoding="utf-8").write(p)
t = open(f"{d}/test-cases.md", encoding="utf-8").read()
t = t.replace("| TC-01 | （补全） | 正常流 | （补全） | （补全） | （补全） | 手动 |",
              "| TC-01 | 按钮文案 | 正常流 | 打开订单页 | 查看按钮 | 文案为「导出」 | 手动 |")
open(f"{d}/test-cases.md", "w", encoding="utf-8").write(t)
PY
  run $AI check fix-text
  [ "$status" -eq 0 ]
  run $AI confirm fix-text
  [ "$status" -eq 0 ]
  run $AI ship fix-text
  [ "$status" -eq 0 ]
  grep -q 'SHIP_GATES_PASSED' <<<"$output"
  grep -q '手动' <<<"$output"
}

# ── 3. 完整变更证据链 ─────────────────────────────────────

full_change_fixture() {
  install_here
  mkdir -p "$PROJ/.ai/changes/order-export"
  cat > "$PROJ/.ai/changes/order-export/proposal.md" <<'EOF'
# 变更提案：order-export
## 影响范围
```yaml
affected_files:
  - src/OrderController.java
affected_tables:
  - none
affected_apis:
  - GET /api/admin/v1/order/export
affected_pages:
  - none
```
## 待确认问题
- 无待确认
EOF
  cat > "$PROJ/.ai/changes/order-export/test-cases.md" <<'EOF'
| 用例ID | 关联场景 | 类型 | 前置条件 | 步骤 | 预期结果 | 验证方式 |
|--------|----------|------|----------|------|----------|----------|
| TC-01 | 导出 | 正常流 | 有数据 | 调导出 | 返回文件 | 集成 |
| TC-02 | 参数错 | 异常流 | 已登录 | 传坏参 | 参数错误 | 单测 |
EOF
}

# 完整变更：报告齐全且全绿 → ship 过；缺 TC/有失败 → 拦
@test "t04 full change evidence chain" {
  full_change_fixture
  run $AI confirm order-export
  [ "$status" -eq 0 ]
  mkdir -p "$PROJ/test-results"

  # 只有 TC-01 → MISSING 拦截
  cat > "$PROJ/test-results/TEST-a.xml" <<'EOF'
<?xml version="1.0"?>
<testsuite tests="1"><testcase classname="T" name="test_TC01_ok"/></testsuite>
EOF
  run $AI ship order-export
  [ "$status" -ne 0 ]
  grep -q 'TC-02' <<<"$output"

  # TC-02 失败 → 拦截
  cat > "$PROJ/test-results/TEST-a.xml" <<'EOF'
<?xml version="1.0"?>
<testsuite tests="2">
  <testcase classname="T" name="test_TC01_ok"/>
  <testcase classname="T" name="test_TC02_bad"><failure message="boom"/></testcase>
</testsuite>
EOF
  run $AI ship order-export
  [ "$status" -ne 0 ]
  grep -qi 'fail' <<<"$output"

  # 全绿 → 通过
  cat > "$PROJ/test-results/TEST-a.xml" <<'EOF'
<?xml version="1.0"?>
<testsuite tests="2">
  <testcase classname="T" name="test_TC01_ok"/>
  <testcase classname="T" name="test_TC02_ok"/>
</testsuite>
EOF
  run $AI ship order-export
  [ "$status" -eq 0 ]
  grep -q 'SHIP_GATES_PASSED' <<<"$output"
}

# affected_apis 非 none 而用例缺异常流 → check 拦截
@test "t05 apis require exception-flow case" {
  full_change_fixture
  python3 - "$PROJ/.ai/changes/order-export/test-cases.md" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read().replace("异常流", "正常流")
open(p, "w", encoding="utf-8").write(s)
PY
  run $AI check order-export
  [ "$status" -ne 0 ]
  grep -q '异常流' <<<"$output"
}

# ── 4. lite 越界与升级 ────────────────────────────────────

# lite 声明数据库 → check 拦并指向 --upgrade；升级保留已写内容
@test "t06 lite db boundary and upgrade keeps content" {
  install_here
  $AI new tiny --lite >/dev/null
  python3 - "$PROJ/.ai/changes/tiny/proposal.md" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
s = s.replace("affected_tables:\n  - none", "affected_tables:\n  - t_user")
s = s.replace("- （补全：影响的文件）", "- src/a.java")
open(p, "w", encoding="utf-8").write(s)
PY
  echo "我的用例内容" >> "$PROJ/.ai/changes/tiny/test-cases.md"
  run $AI check tiny
  [ "$status" -ne 0 ]
  grep -q 'upgrade' <<<"$output"

  run $AI new tiny --upgrade
  [ "$status" -eq 0 ]
  ! grep -q '^变更级别: lite' "$PROJ/.ai/changes/tiny/proposal.md"
  grep -q '我的用例内容' "$PROJ/.ai/changes/tiny/test-cases.md"
  [ -f "$PROJ/.ai/changes/tiny/specs/tiny/spec.md" ]
}

# ── 5. 高风险提示（v1 曾经的误报场景）─────────────────────

# 碰表提示独立审查；tables=none 不误报
@test "t07 db hint without false positive" {
  full_change_fixture
  run $AI confirm order-export
  [ "$status" -eq 0 ]
  mkdir -p "$PROJ/test-results"
  cat > "$PROJ/test-results/TEST-a.xml" <<'EOF'
<?xml version="1.0"?>
<testsuite tests="2">
  <testcase classname="T" name="test_TC01_ok"/>
  <testcase classname="T" name="test_TC02_ok"/>
</testsuite>
EOF
  # tables=none：不应提示涉库
  run $AI ship order-export
  [ "$status" -eq 0 ]
  ! grep -q '数据库' <<<"$output"

  # 改为碰表：提示建议独立审查（review-prompt 模板路径）
  python3 - "$PROJ/.ai/changes/order-export/proposal.md" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
s = s.replace("affected_tables:\n  - none", "affected_tables:\n  - t_order")
open(p, "w", encoding="utf-8").write(s)
PY
  run $AI confirm order-export
  [ "$status" -eq 0 ]
  touch "$PROJ/test-results/TEST-a.xml"
  run $AI ship order-export
  [ "$status" -eq 0 ]
  grep -q '独立审查' <<<"$output"
}

# ── 6. 待确认门禁（只查章节，不全文扫）───────────────────

# 待确认问题未答 → check 拦；正文出现'待确认'字样不拦
@test "t08 unresolved questions gate section-only" {
  install_here
  $AI new q-test --lite >/dev/null
  python3 - "$PROJ/.ai/changes/q-test" <<'PY'
import sys, re
d = sys.argv[1]
p = open(f"{d}/proposal.md", encoding="utf-8").read()
p = p.replace("- （补全：影响的文件）", "- src/a.vue")
# 正文含"待确认"字样但待确认章节已答——不应被拦
p = p.replace("## 待确认问题", "备注：历史上这里曾标待确认。\n\n## 待确认问题")
p = re.sub(r"## 待确认问题\n(?!备)(.*)", "## 待确认问题\n- 无待确认\n", p, flags=re.S)
open(f"{d}/proposal.md", "w", encoding="utf-8").write(p)
t = open(f"{d}/test-cases.md", encoding="utf-8").read()
t = t.replace("（补全）", "x")
open(f"{d}/test-cases.md", "w", encoding="utf-8").write(t)
PY
  run $AI check q-test
  [ "$status" -eq 0 ]

  # 加一条未答问题 → 拦
  printf -- '- 状态枚举有哪几个值？\n' >> "$PROJ/.ai/changes/q-test/proposal.md"
  run $AI check q-test
  [ "$status" -ne 0 ]
  grep -q '待确认' <<<"$output"
}

# ── 7. 适配导出 ───────────────────────────────────────────

# sync 生成 Claude 与 WorkBuddy 适配物且自包含
@test "t09 sync claude and workbuddy self-contained" {
  install_here
  run $AI sync
  [ "$status" -eq 0 ]
  grep -q '@AGENTS.md' "$PROJ/CLAUDE.md"
  [ "$(ls "$PROJ/.claude/agents/" | wc -l | tr -d ' ')" -eq 4 ]
  [ -f "$PROJ/.claude/skills/new-feature/SKILL.md" ]
  [ "$(ls "$PROJ/.workbuddy/skills/" | wc -l | tr -d ' ')" -eq 5 ]
  grep -q '规则快照' "$PROJ/.workbuddy/skills/agent-dba/SKILL.md"
  grep -q 'pk_id' "$PROJ/.workbuddy/skills/agent-dba/SKILL.md"
}

# ── 8. 外部审计第一批修复的回归 ─────────────────────────────

# init: 已有 AGENTS.md 不死锁——提示 --force，--force 备份后安装成功
@test "t10 init force resolves AGENTS.md deadlock" {
  echo "# 我原有的契约" > "$PROJ/AGENTS.md"
  run $AI init --stack java
  [ "$status" -ne 0 ]
  grep -q -- '--force' <<<"$output"          # 错误信息必须给出可执行的下一步
  run $AI init --stack java --force
  [ "$status" -eq 0 ]
  ls "$PROJ"/AGENTS.md.bak-* >/dev/null       # 原文件已备份
  grep -q '红线' "$PROJ/AGENTS.md"            # 新契约已就位
}

# init: --stack 白名单校验，拼错立即报错
@test "t11 init stack whitelist" {
  run $AI init --stack javas
  [ "$status" -ne 0 ]
  grep -q 'mixed' <<<"$output"                # 报错需列出可用值
  [ ! -d "$PROJ/.ai" ]                        # 未留下半安装状态
}

# ── 9. 外部审计第二批修复的回归 ─────────────────────────────

# P0-1: 碰接口却全手动用例 → check 拦（升级绕过被堵）
@test "t12 P0-1 all-manual blocked for db-api change" {
  full_change_fixture
  python3 - "$PROJ/.ai/changes/order-export/test-cases.md" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read().replace("| 集成 |", "| 手动 |").replace("| 单测 |", "| 手动 |")
open(p, "w", encoding="utf-8").write(s)
PY
  run $AI check order-export
  [ "$status" -ne 0 ]
  grep -q '非手动' <<<"$output"
}

# confirm 门禁：未确认不能 ship；确认后偷改变更单 → 确认失效
@test "t13 confirm gate and stale confirm" {
  full_change_fixture
  mkdir -p "$PROJ/test-results"
  cat > "$PROJ/test-results/TEST-a.xml" <<'EOF'
<?xml version="1.0"?>
<testsuite tests="2">
  <testcase classname="T" name="test_TC01_ok"/>
  <testcase classname="T" name="test_TC02_ok"/>
</testsuite>
EOF
  run $AI ship order-export
  [ "$status" -ne 0 ]
  grep -q 'confirm' <<<"$output"               # 未确认 → 拦并指路

  run $AI confirm order-export
  [ "$status" -eq 0 ]
  [ -f "$PROJ/.ai/changes/order-export/confirmed.json" ]
  sleep 1 && touch "$PROJ/test-results/TEST-a.xml"
  run $AI ship order-export
  [ "$status" -eq 0 ]                          # 确认 + 新报告 → 过

  sleep 1 && echo "偷改" >> "$PROJ/.ai/changes/order-export/proposal.md"
  run $AI ship order-export
  [ "$status" -ne 0 ]
  grep -q '确认已过期' <<<"$output"            # 确认后改动 → 失效
}

# P0-2: 旧报告顶包 → ship 拦（报告须晚于确认时间）
@test "t14 P0-2 old report blocked" {
  full_change_fixture
  mkdir -p "$PROJ/test-results"
  cat > "$PROJ/test-results/TEST-a.xml" <<'EOF'
<?xml version="1.0"?>
<testsuite tests="2">
  <testcase classname="T" name="test_TC01_ok"/>
  <testcase classname="T" name="test_TC02_ok"/>
</testsuite>
EOF
  touch -t 202001010000 "$PROJ/test-results/TEST-a.xml"   # 报告造旧
  run $AI confirm order-export
  [ "$status" -eq 0 ]
  run $AI ship order-export
  [ "$status" -ne 0 ]
  grep -q '旧报告' <<<"$output"
}

# P1-1: 行内 YAML（affected_tables: none）不再误伤
@test "t15 P1-1 inline yaml none accepted" {
  full_change_fixture
  python3 - "$PROJ/.ai/changes/order-export/proposal.md" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
s = s.replace("affected_tables:\n  - none", "affected_tables: none")
s = s.replace("affected_pages:\n  - none", "affected_pages: 无")
open(p, "w", encoding="utf-8").write(s)
PY
  run $AI check order-export
  [ "$status" -eq 0 ]
}

# ── 10. 第三批：hooks 前移与团队门禁 ────────────────────────

# sync 生成 PreToolUse 钩子配置；guard-bash 拦危险 SQL、放行安全命令
@test "t16 sync hooks and guard-bash sql block" {
  install_here
  run $AI sync
  [ "$status" -eq 0 ]
  grep -q 'guard-write' "$PROJ/.claude/settings.json"
  [ -f "$PROJ/.ai/hooks/guard-bash.js" ]

  run bash -c 'echo "{\"tool_input\":{\"command\":\"mysql -e \\\"DROP TABLE t_user\\\"\"}}" | node "$0"' "$PROJ/.ai/hooks/guard-bash.js"
  [ "$status" -eq 2 ]
  grep -q '两阶段确认' <<<"$output"

  run bash -c 'echo "{\"tool_input\":{\"command\":\"UPDATE t_user SET x=1\"}}" | node "$0"' "$PROJ/.ai/hooks/guard-bash.js"
  [ "$status" -eq 2 ]

  run bash -c 'echo "{\"tool_input\":{\"command\":\"git status && UPDATE t_user SET x=1 WHERE id=3\"}}" | node "$0"' "$PROJ/.ai/hooks/guard-bash.js"
  [ "$status" -eq 0 ]
}

# guard-write：未确认拦业务代码；确认后只放行影响范围内文件
@test "t17 guard-write scope enforcement" {
  full_change_fixture
  cd "$PROJ"
  G="$PROJ/.ai/hooks/guard-write.js"

  # 有变更但未确认 → 拦业务代码；放行文档
  run bash -c 'echo "{\"tool_input\":{\"file_path\":\"src/OrderController.java\"}}" | node "$0"' "$G"
  [ "$status" -eq 2 ]
  grep -q '未确认' <<<"$output"
  run bash -c 'echo "{\"tool_input\":{\"file_path\":\"README.md\"}}" | node "$0"' "$G"
  [ "$status" -eq 0 ]

  run $AI confirm order-export
  [ "$status" -eq 0 ]

  # 确认后：范围内放行，范围外拦截，测试文件放行
  run bash -c 'echo "{\"tool_input\":{\"file_path\":\"src/OrderController.java\"}}" | node "$0"' "$G"
  [ "$status" -eq 0 ]
  run bash -c 'echo "{\"tool_input\":{\"file_path\":\"src/PayService.java\"}}" | node "$0"' "$G"
  [ "$status" -eq 2 ]
  grep -q 'affected_files' <<<"$output"
  run bash -c 'echo "{\"tool_input\":{\"file_path\":\"src/test/OrderTest.java\"}}" | node "$0"' "$G"
  [ "$status" -eq 0 ]

  # 逃生阀
  run bash -c 'echo "{\"tool_input\":{\"file_path\":\"src/PayService.java\"}}" | AI_CONTROL_HOOKS=off node "$0"' "$G"
  [ "$status" -eq 0 ]
}

# ── 11. 第二轮外部审计（N-1/N-2/N-3）回归 ───────────────────

# N-1: 已有 settings.json 时 sync 做 JSON 合并，不覆盖用户配置
@test "t18 N-1 settings json merge preserves user config" {
  install_here
  mkdir -p "$PROJ/.claude"
  cat > "$PROJ/.claude/settings.json" <<'XML1'
{
  "permissions": { "allow": ["Bash(npm test)"] },
  "hooks": { "PreToolUse": [ { "matcher": "Bash", "hooks": [ { "type": "command", "command": "echo user-own-hook" } ] } ] }
}
XML1
  run $AI sync
  [ "$status" -eq 0 ]
  grep -q 'user-own-hook' "$PROJ/.claude/settings.json"     # 用户自己的钩子还在
  grep -q 'npm test' "$PROJ/.claude/settings.json"          # 用户 permissions 还在
  grep -q 'guard-write' "$PROJ/.claude/settings.json"       # 我们的钩子已合并
  grep -q '钩子已启用' "$PROJ/CLAUDE.md"                    # 文案与实际一致
  node -e "JSON.parse(require('fs').readFileSync('$PROJ/.claude/settings.json','utf8'))"  # 仍是合法 JSON

  run $AI sync --force
  [ "$status" -eq 0 ]
  [ "$(grep -c 'guard-bash' "$PROJ/.claude/settings.json")" -eq 1 ]   # 幂等：不重复追加
}

# N-3: 多变更并存时全局报告不算证据，必须按变更隔离
@test "t19 N-3 multi-change requires scoped evidence" {
  full_change_fixture
  mkdir -p "$PROJ/.ai/changes/other-x"          # 存在第二个变更
  run $AI confirm order-export
  [ "$status" -eq 0 ]
  mkdir -p "$PROJ/test-results"
  cat > "$PROJ/test-results/TEST-other.xml" <<'XML2'
<?xml version="1.0"?>
<testsuite tests="2">
  <testcase classname="T" name="test_other_TC01_x"/>
  <testcase classname="T" name="test_other_TC02_x"/>
</testsuite>
XML2
  run $AI ship order-export
  [ "$status" -ne 0 ]
  grep -q '按变更隔离' <<<"$output"            # 别的变更的新鲜报告不再能顶包

  mkdir -p "$PROJ/test-results/order-export"
  cat > "$PROJ/test-results/order-export/TEST-a.xml" <<'XML3'
<?xml version="1.0"?>
<testsuite tests="2">
  <testcase classname="T" name="test_TC01_ok"/>
  <testcase classname="T" name="test_TC02_ok"/>
</testsuite>
XML3
  run $AI ship order-export
  [ "$status" -eq 0 ]                          # 隔离目录内的证据 → 过
}

# N-2: ai test <id> 把新报告收进隔离目录，端到端链路全绿
@test "t20 N-2 ai test id harvests into scoped dir" {
  full_change_fixture
  run $AI confirm order-export
  [ "$status" -eq 0 ]
  python3 - "$PROJ/.ai/config.json" <<'PYCFG'
import json, sys
p = sys.argv[1]
cfg = json.load(open(p))
cfg["testCommand"] = ("mkdir -p target/surefire-reports && printf '%s' "
  "'<testsuite tests=\"2\"><testcase classname=\"T\" name=\"test_TC01_ok\"/>"
  "<testcase classname=\"T\" name=\"test_TC02_ok\"/></testsuite>' "
  "> target/surefire-reports/TEST-h.xml")
json.dump(cfg, open(p, "w"))
PYCFG
  run $AI test order-export
  [ "$status" -eq 0 ]
  [ -f "$PROJ/test-results/order-export/TEST-h.xml" ]   # 收割进了隔离目录
  run $AI ship order-export
  [ "$status" -eq 0 ]
  grep -q 'SHIP_GATES_PASSED' <<<"$output"
}

# guard-bash: AI 代跑 ai confirm 被拦
@test "t21 guard-bash blocks ai confirm by AI" {
  install_here
  run bash -c 'echo "{\"tool_input\":{\"command\":\"ai confirm my-change\"}}" | node "$0"' "$PROJ/.ai/hooks/guard-bash.js"
  [ "$status" -eq 2 ]
  grep -q '用户本人' <<<"$output"
}

# guard-bash: ai confirm 只拦真执行，不拦提交信息等文本（假阳性回归）
@test "t22 guard-bash no false positive on confirm in message text" {
  install_here
  G="$PROJ/.ai/hooks/guard-bash.js"
  run bash -c 'echo "{\"tool_input\":{\"command\":\"git commit -m \\\"docs: ai confirm usage\\\"\"}}" | node "$0"' "$G"
  [ "$status" -eq 0 ]
  run bash -c 'echo "{\"tool_input\":{\"command\":\"cd x && ai confirm my-change\"}}" | node "$0"' "$G"
  [ "$status" -eq 2 ]
  run bash -c 'echo "{\"tool_input\":{\"command\":\"node .ai/../bin/ai.js confirm y\"}}" | node "$0"' "$G"
  [ "$status" -eq 2 ]
}

# ── 12. 生命周期/哈希/密钥/软核验（本轮自审修复）────────────

# shipped 后：不再触发多变更强制隔离，guard-write 也不再连坐
@test "t23 shipped change stops constraining gates and hooks" {
  full_change_fixture
  run $AI confirm order-export
  mkdir -p "$PROJ/test-results/order-export"
  cat > "$PROJ/test-results/order-export/TEST-a.xml" <<'XML1'
<testsuite tests="2"><testcase classname="T" name="test_TC01_ok"/><testcase classname="T" name="test_TC02_ok"/></testsuite>
XML1
  run $AI ship order-export
  [ "$status" -eq 0 ]
  [ -f "$PROJ/.ai/changes/order-export/shipped.json" ]

  # 第二个变更：旧变更已交付不计数 → 全局报告即可，不被逼隔离
  mkdir -p "$PROJ/.ai/changes/next-one"
  cp "$PROJ/.ai/changes/order-export/proposal.md" "$PROJ/.ai/changes/next-one/proposal.md"
  cp "$PROJ/.ai/changes/order-export/test-cases.md" "$PROJ/.ai/changes/next-one/test-cases.md"
  rm -rf "$PROJ/test-results"
  run $AI confirm next-one
  [ "$status" -eq 0 ]
  mkdir -p "$PROJ/test-results"
  cat > "$PROJ/test-results/TEST-b.xml" <<'XML2'
<testsuite tests="2"><testcase classname="T" name="test_TC01_ok"/><testcase classname="T" name="test_TC02_ok"/></testsuite>
XML2
  run $AI ship next-one
  [ "$status" -eq 0 ]

  # 已交付变更声明过的文件不再进 guard-write 白名单/锁定（无活跃变更 → 放行）
  cd "$PROJ"
  run bash -c 'echo "{\"tool_input\":{\"file_path\":\"src/Anything.java\"}}" | node "$0"' "$PROJ/.ai/hooks/guard-write.js"
  [ "$status" -eq 0 ]
}

# 哈希化确认：mtime 变化（git clone/换机器场景）不再假失效；内容变了才失效
@test "t24 hash-based confirm survives mtime churn" {
  full_change_fixture
  run $AI confirm order-export
  mkdir -p "$PROJ/test-results"
  cat > "$PROJ/test-results/TEST-a.xml" <<'XML3'
<testsuite tests="2"><testcase classname="T" name="test_TC01_ok"/><testcase classname="T" name="test_TC02_ok"/></testsuite>
XML3
  sleep 1 && touch "$PROJ/.ai/changes/order-export/proposal.md"   # 只动 mtime，内容不变
  run $AI ship order-export
  [ "$status" -eq 0 ]                                             # 旧版 mtime 方案这里会假失效

  echo "实质修改" >> "$PROJ/.ai/changes/order-export/proposal.md"
  run $AI ship order-export
  [ "$status" -ne 0 ]
  grep -q '确认已过期' <<<"$output"
}

# 简单任务通道：未确认草稿只锁自己声明的文件，无关文件放行；子目录+环境变量下仍工作
@test "t25 draft locks only declared files and root env works" {
  full_change_fixture
  cd "$PROJ"
  G="$PROJ/.ai/hooks/guard-write.js"
  # 未确认：声明内拦、声明外放（简单任务不被烂尾草稿连坐）
  run bash -c 'echo "{\"tool_input\":{\"file_path\":\"src/OrderController.java\"}}" | node "$0"' "$G"
  [ "$status" -eq 2 ]
  run bash -c 'echo "{\"tool_input\":{\"file_path\":\"src/config/Timeout.java\"}}" | node "$0"' "$G"
  [ "$status" -eq 0 ]
  # 从子目录跑（模拟子目录启动 Claude），靠 CLAUDE_PROJECT_DIR 找根
  mkdir -p "$PROJ/sub" && cd "$PROJ/sub"
  run bash -c 'echo "{\"tool_input\":{\"file_path\":\"src/OrderController.java\"}}" | CLAUDE_PROJECT_DIR="'"$PROJ"'" node "$0"' "$G"
  [ "$status" -eq 2 ]
}

# 密钥扫描 + 声明诚实性软核验（需 git 提交历史）
@test "t26 secret scan blocks and drift check warns" {
  full_change_fixture
  cd "$PROJ"
  git add -A && git -c user.email=t@t -c user.name=t commit -qm init
  run $AI confirm order-export
  [ "$status" -eq 0 ]
  mkdir -p "$PROJ/test-results"
  cat > "$PROJ/test-results/TEST-a.xml" <<'XML4'
<testsuite tests="2"><testcase classname="T" name="test_TC01_ok"/><testcase classname="T" name="test_TC02_ok"/></testsuite>
XML4

  # 未声明的业务文件改动 → 软核验警告但不拦
  mkdir -p src && echo "public class Sneaky {}" > src/Sneaky.java
  git add -A
  run $AI ship order-export
  [ "$status" -eq 0 ]
  grep -q '未在影响范围声明' <<<"$output"
  grep -q 'Sneaky' <<<"$output"

  # diff 里出现密钥 → 拦
  echo 'key = "AKIAIOSFODNN7EXAMPLE"' >> src/Sneaky.java
  run $AI ship order-export
  [ "$status" -ne 0 ]
  grep -q 'SECRET_HIT' <<<"$output"

  # 明示关闭后放行（测试假数据场景的逃生阀）
  python3 -c "import json;p='$PROJ/.ai/config.json';c=json.load(open(p));c['secretScan']='off';json.dump(c,open(p,'w'))"
  run $AI ship order-export
  [ "$status" -eq 0 ]
}
