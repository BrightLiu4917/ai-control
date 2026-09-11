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

@test "init 安装：AGENTS.md + ai 入口 + .ai/ 资产齐全" {
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

@test "init 不覆盖已有 AGENTS.md；--update 只更新框架且先备份" {
  echo "用户自己的契约" > "$PROJ/AGENTS.md"
  run $AI init --stack java
  [ "$status" -ne 0 ]
  grep -q '已存在' <<<"$output"
  [ "$(cat "$PROJ/AGENTS.md")" = "用户自己的契约" ]

  rm "$PROJ/AGENTS.md"
  install_here
  mkdir -p "$PROJ/openspec/changes/keep" && echo "用户数据" > "$PROJ/openspec/changes/keep/proposal.md"
  run $AI init --update
  [ "$status" -eq 0 ]
  [ "$(cat "$PROJ/openspec/changes/keep/proposal.md")" = "用户数据" ]
  ls "$PROJ/.ai/backup/" | grep -q 'update-'
}

# ── 2. lite 全手动路径（v1 曾经的死锁场景）─────────────────

@test "lite 改文案：两件套 → check → ship 全程无阻" {
  install_here
  run $AI new fix-text --lite
  [ "$status" -eq 0 ]
  [ -f "$PROJ/openspec/changes/fix-text/proposal.md" ]
  [ -f "$PROJ/openspec/changes/fix-text/test-cases.md" ]
  [ ! -f "$PROJ/openspec/changes/fix-text/tasks.md" ]
  grep -q '^变更级别: lite' "$PROJ/openspec/changes/fix-text/proposal.md"

  # 模拟 AI 补全：影响文件 + 一条手动用例 + 答掉待确认
  python3 - "$PROJ/openspec/changes/fix-text" <<'PY'
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
  run $AI ship fix-text
  [ "$status" -eq 0 ]
  grep -q 'SHIP_GATES_PASSED' <<<"$output"
  grep -q '手动' <<<"$output"
}

# ── 3. 完整变更证据链 ─────────────────────────────────────

full_change_fixture() {
  install_here
  mkdir -p "$PROJ/openspec/changes/order-export"
  cat > "$PROJ/openspec/changes/order-export/proposal.md" <<'EOF'
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
  cat > "$PROJ/openspec/changes/order-export/test-cases.md" <<'EOF'
| 用例ID | 关联场景 | 类型 | 前置条件 | 步骤 | 预期结果 | 验证方式 |
|--------|----------|------|----------|------|----------|----------|
| TC-01 | 导出 | 正常流 | 有数据 | 调导出 | 返回文件 | 集成 |
| TC-02 | 参数错 | 异常流 | 已登录 | 传坏参 | 参数错误 | 单测 |
EOF
}

@test "完整变更：报告齐全且全绿 → ship 过；缺 TC/有失败 → 拦" {
  full_change_fixture
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

@test "affected_apis 非 none 而用例缺异常流 → check 拦截" {
  full_change_fixture
  python3 - "$PROJ/openspec/changes/order-export/test-cases.md" <<'PY'
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

@test "lite 声明数据库 → check 拦并指向 --upgrade；升级保留已写内容" {
  install_here
  $AI new tiny --lite >/dev/null
  python3 - "$PROJ/openspec/changes/tiny/proposal.md" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
s = s.replace("affected_tables:\n  - none", "affected_tables:\n  - t_user")
s = s.replace("- （补全：影响的文件）", "- src/a.java")
open(p, "w", encoding="utf-8").write(s)
PY
  echo "我的用例内容" >> "$PROJ/openspec/changes/tiny/test-cases.md"
  run $AI check tiny
  [ "$status" -ne 0 ]
  grep -q 'upgrade' <<<"$output"

  run $AI new tiny --upgrade
  [ "$status" -eq 0 ]
  ! grep -q '^变更级别: lite' "$PROJ/openspec/changes/tiny/proposal.md"
  grep -q '我的用例内容' "$PROJ/openspec/changes/tiny/test-cases.md"
  [ -f "$PROJ/openspec/changes/tiny/specs/tiny/spec.md" ]
}

# ── 5. 高风险提示（v1 曾经的误报场景）─────────────────────

@test "碰表提示独立审查；tables=none 不误报" {
  full_change_fixture
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
  python3 - "$PROJ/openspec/changes/order-export/proposal.md" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
s = s.replace("affected_tables:\n  - none", "affected_tables:\n  - t_order")
open(p, "w", encoding="utf-8").write(s)
PY
  run $AI ship order-export
  [ "$status" -eq 0 ]
  grep -q '独立审查' <<<"$output"
}

# ── 6. 待确认门禁（只查章节，不全文扫）───────────────────

@test "待确认问题未答 → check 拦；正文出现'待确认'字样不拦" {
  install_here
  $AI new q-test --lite >/dev/null
  python3 - "$PROJ/openspec/changes/q-test" <<'PY'
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
  printf -- '- 状态枚举有哪几个值？\n' >> "$PROJ/openspec/changes/q-test/proposal.md"
  run $AI check q-test
  [ "$status" -ne 0 ]
  grep -q '待确认' <<<"$output"
}

# ── 7. 适配导出 ───────────────────────────────────────────

@test "sync 生成 Claude 与 WorkBuddy 适配物且自包含" {
  install_here
  run $AI sync
  [ "$status" -eq 0 ]
  grep -q '@AGENTS.md' "$PROJ/CLAUDE.md"
  [ "$(ls "$PROJ/.claude/agents/" | wc -l | tr -d ' ')" -eq 4 ]
  [ -f "$PROJ/.claude/skills/openspec-feature/SKILL.md" ]
  [ "$(ls "$PROJ/workbuddy-skills/" | wc -l | tr -d ' ')" -eq 5 ]
  grep -q '规则快照' "$PROJ/workbuddy-skills/agent-dba/SKILL.md"
  grep -q 'pk_id' "$PROJ/workbuddy-skills/agent-dba/SKILL.md"
}

# ── 8. 外部审计第一批修复的回归 ─────────────────────────────

@test "init: 已有 AGENTS.md 不死锁——提示 --force，--force 备份后安装成功" {
  echo "# 我原有的契约" > "$PROJ/AGENTS.md"
  run $AI init --stack java
  [ "$status" -ne 0 ]
  grep -q -- '--force' <<<"$output"          # 错误信息必须给出可执行的下一步
  run $AI init --stack java --force
  [ "$status" -eq 0 ]
  ls "$PROJ"/AGENTS.md.bak-* >/dev/null       # 原文件已备份
  grep -q '红线' "$PROJ/AGENTS.md"            # 新契约已就位
}

@test "init: --stack 白名单校验，拼错立即报错" {
  run $AI init --stack javas
  [ "$status" -ne 0 ]
  grep -q 'mixed' <<<"$output"                # 报错需列出可用值
  [ ! -d "$PROJ/.ai" ]                        # 未留下半安装状态
}
