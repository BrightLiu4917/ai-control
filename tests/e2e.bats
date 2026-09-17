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
  # 测试不得污染开发者本机的使用记录与拦截记录（横幅与记账由 t27 单独验证）
  export AI_CONTROL_QUIET=1
  export AI_CONTROL_USAGE=off
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
  # 用户已在对话里明确同意 → 如实代记放行（留痕会标 ai-attested）
  run bash -c 'echo "{\"tool_input\":{\"command\":\"ai confirm my-change --attested\"}}" | node "$0"' "$PROJ/.ai/hooks/guard-bash.js"
  [ "$status" -eq 0 ]
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
  # --attested 只对它所属的那条命令生效：后一条带标记不能放行前一条的冒充
  run bash -c 'echo "{\"tool_input\":{\"command\":\"ai confirm x && ai test y --attested\"}}" | node "$0"' "$G"
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

# ── 12. 使用可见性：工牌 / 记账 / ai stats ────────────────

# 需求："我怎么知道这东西真的在被用"——每条命令一行工牌 + 本机账本 + ai stats 读账
@test "t27 usage banner and stats" {
  # setup 默认关掉记账（避免测试污染开发者本机），这里显式打开并指向临时文件
  export AI_CONTROL_QUIET=
  export AI_CONTROL_USAGE=
  export AI_CONTROL_USAGE_FILE="$BATS_TEST_TMPDIR/usage.jsonl"

  run $AI init --stack java
  [ "$status" -eq 0 ]
  grep -q 'bright-ai-coding' <<<"$output"   # 工牌（非 TTY 时走 stderr，不污染 stdout）
  grep -q '本机第 1 次' <<<"$output"         # 自带计数
  [ -f "$AI_CONTROL_USAGE_FILE" ]

  # 门禁拦截 / 失败同样进账（无论退出码是 1 还是 2）
  run $AI check nope
  [ "$status" -ne 0 ]

  run $AI stats
  [ "$status" -eq 0 ]
  grep -q '累计 2 次' <<<"$output"
  grep -q '非零退出' <<<"$output"
  grep -q 'ai init' <<<"$output"
  grep -q 'ai check' <<<"$output"

  # doctor 里也能看到使用量与框架版本
  run $AI doctor
  [ "$status" -eq 0 ]
  grep -q '本机使用' <<<"$output"
  grep -q '框架版本 v' <<<"$output"

  # 关掉工牌后不再打印，但账照记（--quiet 只关横幅，不关记账）
  export AI_CONTROL_QUIET=1
  run $AI check nope
  [ "$status" -ne 0 ]
  ! grep -q 'bright-ai-coding' <<<"$output"

  # 连记账一起关：日志不再增长
  export AI_CONTROL_QUIET=
  export AI_CONTROL_USAGE=off
  run $AI check nope
  [ "$status" -ne 0 ]
  run bash -c "wc -l < '$AI_CONTROL_USAGE_FILE'"
  [ "$(echo "$output" | tr -d ' ')" -eq 5 ]
}

# ── 13. 使用可见性：Claude Code 会话工牌 + 拦截留痕 ─────────

# AI 工具才是真正改代码的人——用 SessionStart 钩子让"在岗"每次会话可见，
# 并把被拦下的事件记在项目里（比任何口号都更能证明工具在管事）
@test "t28 session banner and interception log" {
  full_change_fixture
  export AI_CONTROL_QUIET=          # setup 里为免污染关掉了工牌，这里要验工牌
  export AI_CONTROL_USAGE=
  export AI_CONTROL_USAGE_FILE="$BATS_TEST_TMPDIR/usage.jsonl"

  run $AI sync
  [ "$status" -eq 0 ]
  grep -q 'session-banner.js' "$PROJ/.claude/settings.json"
  grep -q 'SessionStart' "$PROJ/.claude/settings.json"
  grep -q 'SessionStart 钩子已启用' "$PROJ/CLAUDE.md"
  node -e "JSON.parse(require('fs').readFileSync('$PROJ/.claude/settings.json','utf8'))"

  # 会话工牌：systemMessage 给人看，additionalContext 给 Claude 看（带上进行中变更）
  run bash -c 'echo "{\"hook_event_name\":\"SessionStart\",\"cwd\":\"'"$PROJ"'\"}" | CLAUDE_PROJECT_DIR='"$PROJ"' node "$0"' "$PROJ/.ai/hooks/session-banner.js"
  [ "$status" -eq 0 ]
  grep -q 'bright-ai-coding' <<<"$output"
  grep -q 'systemMessage' <<<"$output"
  grep -q 'additionalContext' <<<"$output"
  grep -q 'order-export' <<<"$output"

  # 关掉后安静退出，绝不干扰会话启动
  run bash -c 'echo "{}" | AI_CONTROL_QUIET=1 CLAUDE_PROJECT_DIR='"$PROJ"' node "$0"' "$PROJ/.ai/hooks/session-banner.js"
  [ "$status" -eq 0 ]
  [ -z "$output" ]

  # 被拦下的写入留痕（回答"这工具到底有没有在管事"）
  run bash -c 'echo "{\"tool_input\":{\"file_path\":\"src/OrderController.java\"}}" | node "$0"' "$PROJ/.ai/hooks/guard-write.js"
  [ "$status" -eq 2 ]
  [ -f "$PROJ/.ai/interceptions.jsonl" ]
  grep -q 'unconfirmed-change' "$PROJ/.ai/interceptions.jsonl"
  grep -q '.ai/interceptions.jsonl' "$PROJ/.gitignore"   # 运行痕迹不入库

  run $AI stats
  [ "$status" -eq 0 ]
  grep -q '钩子拦截' <<<"$output"
  grep -q '被当场按住' <<<"$output"

  # 记账关了就不留痕（可关是一致行为）
  rm -f "$PROJ/.ai/interceptions.jsonl"
  export AI_CONTROL_USAGE=off
  run bash -c 'echo "{\"tool_input\":{\"file_path\":\"src/OrderController.java\"}}" | AI_CONTROL_USAGE=off node "$0"' "$PROJ/.ai/hooks/guard-write.js"
  [ "$status" -eq 2 ]                                     # 拦截判定不受记账开关影响
  [ ! -f "$PROJ/.ai/interceptions.jsonl" ]
}

# ── 14. 项目级开关 + 框架版本漂移 ─────────────────────────

# banner / usage 两个开关是分开的（横幅静音但照记账 vs 连记录一起关），
# 以及"项目里的框架文件落后于 CLI"要被 doctor 指出来
@test "t29 project config switches and framework version drift" {
  export AI_CONTROL_QUIET=
  export AI_CONTROL_USAGE=
  export AI_CONTROL_USAGE_FILE="$BATS_TEST_TMPDIR/usage.jsonl"

  run $AI init --stack java
  [ "$status" -eq 0 ]
  [ -f "$PROJ/.ai/VERSION" ]                              # 版本落盘（会话工牌与漂移检查要用）
  grep -q "$(node -p "require('$REPO/package.json').version")" "$PROJ/.ai/VERSION"

  # banner=off：工牌静音，但账照记
  python3 -c "import json;p='$PROJ/.ai/config.json';c=json.load(open(p));c['banner']='off';json.dump(c,open(p,'w'))"
  run $AI check nope
  [ "$status" -ne 0 ]
  ! grep -q 'bright-ai-coding' <<<"$output"
  run bash -c "wc -l < '$AI_CONTROL_USAGE_FILE'"
  BEFORE="$(echo "$output" | tr -d ' ')"

  # usage=off：连记录一起关，日志不再增长
  python3 -c "import json;p='$PROJ/.ai/config.json';c=json.load(open(p));c['usage']='off';json.dump(c,open(p,'w'))"
  run $AI check nope
  [ "$status" -ne 0 ]
  run bash -c "wc -l < '$AI_CONTROL_USAGE_FILE'"
  [ "$(echo "$output" | tr -d ' ')" -eq "$BEFORE" ]

  # 本项目被门禁拦下的事件也不再留痕（与 usage 开关一致）
  mkdir -p "$PROJ/.ai/changes/c1"
  printf '# c\n## 影响范围\n```yaml\naffected_files:\n  - src/A.java\naffected_tables:\n  - none\naffected_apis:\n  - none\naffected_pages:\n  - none\n```\n## 待确认问题\n- 无待确认\n' > "$PROJ/.ai/changes/c1/proposal.md"
  run bash -c 'echo "{\"tool_input\":{\"file_path\":\"src/A.java\"}}" | node "$0"' "$PROJ/.ai/hooks/guard-write.js"
  [ "$status" -eq 2 ]
  [ ! -f "$PROJ/.ai/interceptions.jsonl" ]

  # 框架版本漂移：doctor 要指出来，而不是沉默
  echo "1.0.0" > "$PROJ/.ai/VERSION"
  run $AI doctor
  [ "$status" -eq 0 ]
  grep -q '框架文件是 v1.0.0' <<<"$output"
  grep -q 'ai init --update' <<<"$output"
}

# ── 15. 确认来源：cli / ai-attested ───────────────────────

# "必须用户本人敲"在本地强制不了（AI 有 shell 权限），所以改为**要求留痕如实标注来源**：
# 两条路门禁强度完全一样，区别只在诚实标注；不带 --attested 的冒充在 Claude Code 被钩子拦。
@test "t30 confirm source cli vs ai-attested" {
  full_change_fixture
  C="$PROJ/.ai/changes/order-export/confirmed.json"

  # 用户本人在终端敲 → source: cli
  run $AI confirm order-export
  [ "$status" -eq 0 ]
  grep -q '"source": "cli"' "$C"

  # 用户在对话里只回了一句同意 → AI 代记 --attested，留痕如实标注
  run $AI confirm order-export --attested
  [ "$status" -eq 0 ]
  grep -q 'ai-attested' <<<"$output"
  grep -q '"source": "ai-attested"' "$C"

  # 来源在 doctor 里可见
  run $AI doctor
  [ "$status" -eq 0 ]
  grep -q '确认来源' <<<"$output"
  grep -q 'ai-attested 1' <<<"$output"

  # 门禁强度不因来源变化：报告齐全 → ship 过，并把来源打出来
  mkdir -p "$PROJ/test-results"
  cat > "$PROJ/test-results/TEST-a.xml" <<'EOF'
<testsuite tests="2">
  <testcase classname="T" name="test_TC01_ok"/>
  <testcase classname="T" name="test_TC02_ok"/>
</testsuite>
EOF
  run $AI ship order-export
  [ "$status" -eq 0 ]
  grep -q '确认来源' <<<"$output"
  grep -q 'ai-attested' <<<"$output"

  # 旧版本产物（没有 source 字段）不报错，只标注"未记录"
  node -e "
const fs=require('fs');const p='$C';const c=JSON.parse(fs.readFileSync(p,'utf8'));delete c.source;
fs.writeFileSync(p, JSON.stringify(c,null,2)+'\n');
"
  run $AI ship order-export
  [ "$status" -eq 0 ]
  grep -q '未记录' <<<"$output"
}

# 多工具钩子：六个工具的配置格式各不相同（路径 / 包裹层 / 事件名大小写 / matcher 工具名），
# 但装的是同一份守卫脚本
@test "t31 sync installs hooks for all six AI tools" {
  install_here
  run $AI sync
  [ "$status" -eq 0 ]

  for f in .claude/settings.json .codex/hooks.json .qoder/settings.json \
           .trae/hooks.json .cursor/hooks.json .workbuddy/settings.json; do
    [ -f "$PROJ/$f" ]
  done

  # Codex：事件直接在根，且没有 hooks 包裹层
  node -e "const fs=require('fs');const o=JSON.parse(fs.readFileSync('$PROJ/.codex/hooks.json','utf8'));
    if(!o.PreToolUse||o.hooks)process.exit(1)"
  # Cursor：事件名小驼峰 + version 在
  node -e "const fs=require('fs');const o=JSON.parse(fs.readFileSync('$PROJ/.cursor/hooks.json','utf8'));
    if(!o.hooks.preToolUse||o.version!==1)process.exit(1)"
  # Trae：shell 工具名是 RunCommand
  grep -q 'RunCommand' "$PROJ/.trae/hooks.json"
  # 三个脚本按工具能力分配：拦截给全部，工牌只给输出契约已确认的工具
  grep -q 'guard-write.js' "$PROJ/.claude/settings.json"
  grep -q 'guard-bash.js' "$PROJ/.workbuddy/settings.json"
  grep -q 'session-banner.js' "$PROJ/.qoder/settings.json"
  ! grep -q 'session-banner.js' "$PROJ/.cursor/hooks.json"
  ! grep -q 'session-banner.js' "$PROJ/.trae/hooks.json"
  # 覆盖摘要如实反映结果
  grep -q 'Claude Code ✓拦截+工牌' <<<"$output"

  # 幂等：再跑一次不重复追加
  run $AI sync
  grep -q 'written=0' <<<"$output"

  # --tools 只装指定子集
  rm -rf "$PROJ/.codex" "$PROJ/.qoder"
  run $AI sync --tools=claude,codex
  [ "$status" -eq 0 ]
  [ -f "$PROJ/.codex/hooks.json" ]
  [ ! -f "$PROJ/.qoder/settings.json" ]
}

@test "t32 sync hook merge preserves user config and tolerates broken json" {
  install_here
  run $AI sync
  [ "$status" -eq 0 ]

  # 用户在自己的工具配置里已有字段与钩子
  node -e "
const fs=require('fs');const p='$PROJ/.qoder/settings.json';
const o=JSON.parse(fs.readFileSync(p,'utf8'));
o.myOwnField={keep:true};
o.hooks.PreToolUse.push({matcher:'MyTool',hooks:[{type:'command',command:'echo user-own-hook'}]});
fs.writeFileSync(p, JSON.stringify(o,null,2)+'\n');
"
  run $AI sync
  [ "$status" -eq 0 ]
  grep -q 'user-own-hook' "$PROJ/.qoder/settings.json"
  grep -q 'myOwnField' "$PROJ/.qoder/settings.json"
  [ "$(grep -c 'guard-write.js' "$PROJ/.qoder/settings.json")" -eq 1 ]   # 不重复追加

  # 配置损坏：不动该文件、给出警告、摘要标未就位，且不让 sync 失败
  printf '{broken json' > "$PROJ/.trae/hooks.json"
  run $AI sync
  [ "$status" -eq 0 ]
  grep -q '不是合法 JSON' <<<"$output"
  grep -q 'Trae ✗未就位' <<<"$output"
  [ "$(<"$PROJ/.trae/hooks.json")" = "{broken json" ]
}

# 留痕保护：.ai/ 整体放行，但 confirmed.json / shipped.json 例外——
# 否则 AI 可以手写一份 source: "cli" 的留痕，把"用户本人敲过"凭空造出来
@test "t33 forged confirm record is blocked" {
  install_here
  run $AI new demo-forge
  [ "$status" -eq 0 ]

  run bash -c "echo '{\"tool_input\":{\"file_path\":\"$PROJ/.ai/changes/demo-forge/confirmed.json\"}}' | node \"$PROJ/.ai/hooks/guard-write.js\""
  [ "$status" -eq 2 ]
  grep -q '伪造用户确认' <<<"$output"

  run bash -c "echo '{\"tool_input\":{\"file_path\":\"$PROJ/.ai/changes/demo-forge/shipped.json\"}}' | node \"$PROJ/.ai/hooks/guard-write.js\""
  [ "$status" -eq 2 ]

  # 其它 .ai/ 文件照旧放行（改配置、写模板不该被拦）
  run bash -c "echo '{\"tool_input\":{\"file_path\":\"$PROJ/.ai/config.json\"}}' | node \"$PROJ/.ai/hooks/guard-write.js\""
  [ "$status" -eq 0 ]

  # 正常路径不受影响：ai confirm 自己写留痕（它不是 AI 的工具调用）
  run $AI check demo-forge
  [ "$status" -eq 2 ]   # 草稿没补全，先拦下（这也说明门禁仍在）
}
