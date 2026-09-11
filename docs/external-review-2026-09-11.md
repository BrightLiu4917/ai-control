# ai-control 项目分析报告

> 对象：`https://github.com/BrightLiu4917/ai-control`（npm 包名 `@brightliu/ai-control`，版本 2.0.0）
> 分析时间：2026-09-11
> 分析方式：GitHub API 全量拉取 main 分支 51 个文件 + **本地实跑 CLI 做行为验证**（本机 Node 22，因网络代理无法 git clone，改用 GitHub API 逐文件下载原始内容）
> 验证基线：`main@8defcb6`（commit message：`init: v2 彻底重构——npm 分发的 Node 零依赖内核`）

---

## 一、结论摘要

**一句话**：这是一个「规格先行 + 可执行门禁」的 AI 编码控制层，**理念和规则库质量明显高于同类开源项目，工程精度和分发成熟度明显低于同类开源项目**。当前状态是"内核很好、外围很脆"，最大的风险不是设计错，而是**文档与实现不一致、门禁存在可实测的绕过路径**——这两点会直接损害它最核心的卖点（"报告即证据"）。

| 维度 | 评分 | 说明 |
|---|---|---|
| 理念与定位 | ★★★★☆ | 约束放 prompt 层、机械门禁只保留不可逆处，取舍清晰 |
| 规则库质量（核心资产） | ★★★★☆ | 20 份规则 + 4 角色手册，中文全栈踩坑密度高，同类少见 |
| 代码质量 | ★★★★☆ | 578 行零依赖，结构清晰，可读性好 |
| 门禁有效性（卖点） | ★★☆☆☆ | **存在 2 条可实测的绕过路径**，且 DB 确认并非机械门禁 |
| 一致性（文档↔实现） | ★☆☆☆☆ | **9+ 处悬空引用**，README 对门禁能力的描述与代码不符 |
| 分发与上手 | ★☆☆☆☆ | npm 未发布、默认分支是空 README、`npm test` 缺依赖 |
| 生态与社区 | ☆☆☆☆☆ | 0 star，无 release/CHANGELOG/CONTRIBUTING，作者 5 个相关仓库认知分散 |

---

## 二、优点（确认有效的部分）

### 1. 复杂度预算是同类项目里最独特的设计
`tests/budget.js` 把"内核 ≤1500 行 / addons ≤600 行 / 契约 ≤100 行 / 根文档 ≤1 份"写成 **CI 门禁**，超预算直接红。实测：内核 498/1500、addons 88/600、契约 63/100、根文档 1/1，全部达标。
这是对 v1（bash 5000 行）的机制性反思——**"加功能前先删旧的"被固化成了流水线**，而不是靠自律。这个点值得单独写进 README 首页，是它对成熟框架的真实差异化。

### 2. 门禁是"可执行代码"而不是"提示词"
578 行里有 121 行是 `lib/gate.js`：lite 越界拦截、用例覆盖闭环、待确认章节解析、JUnit 证据核对，都是真代码。
对比：GitHub Spec Kit / OpenSpec / BMAD 提供的是**流程模板和命令**，验证仍靠模型自觉。ai-control 的"机械门禁"是这条赛道上稀有的东西——**方向完全正确，只是实现还漏了三处（见第三章 P0）**。

### 3. 规则库是真正不可替代的资产
2020 行 payload 文档里，有价值密度很高的中文实战规则：
- `10-db-schema.md`：`pk_id`/`id` 分离、前端长整型按字符串、JOIN 禁止"先连后分页"、`DISTINCT/GROUP BY` 不得当修重复的默认手段、多表 JOIN 每张表补齐租户与软删除条件、表结构设计审查的字段必要性/索引/冗余/删除四段式；
- `41-spring-boot.md`（8.8KB）+ `44-java-enum.md`：枚举 code+desc 双字段、禁止裸值比较、禁止 `ordinal()` 入库；
- `agent-dba.md` 的两阶段确认（表结构审查 → 变更确认包 + 回滚 SQL → 才执行）；
- `templates/review-prompt.md`：新会话 + diff 做独立审查，输出机读 `VERDICT: PASS | PASS_WITH_RISKS | BLOCK`，零 API key、零额外服务。

这些是通用框架（BMAD/Spec Kit）**不会写、也写不出来**的颗粒度。护城河在这里，不在 CLI。

### 4. lite 快速通道解决了真实的采用阻力
`ai new <id> --lite` 两件套 + `--upgrade` 保留已写内容平滑升级。多数 spec 框架只有"重流程"，导致小改动被仪式拖死、团队弃用。成本分层 + 越界强制升级的设计思路是对的。

### 5. 测试基础在同类项目里偏扎实（已实测通过）
- 6 个单测（含 v1 "grep 越界"的回归用例）：本地实跑，**exit=0，6/6 通过**；
- 9 个 E2E（bats 真跑 CLI 全链路，含反例：越界拦截、误报防护、缺用例拦截、待确认门禁）：数量与 README 声明一致；
- CI 三关（单测 / 预算 / E2E）。
- 核对 README 声明：9 个 E2E ✓、6 个单测 ✓、20 份规则 ✓、契约 63 行 ✓——**声明数字没有注水，这点很难得**。

### 6. 多工具适配方向正确
以 `AGENTS.md` 为单一事实源 + 为 Claude Code / WorkBuddy 生成适配物。核查 2026-09 各工具官方文档后的结论：Codex、Cursor、GitHub Copilot、Qoder 原生自动读取 AGENTS.md；Claude Code 确需 `CLAUDE.md @AGENTS.md` 导入（与工具设计一致）。**唯一需修正的是 Kimi**——公开资料未确认其原生支持，"前四家零适配"的表述建议改为"Codex / Cursor / Qoder 零适配"。

### 7. 零运行时依赖 + 零构建
只需 Node + git，`files` 白名单干净，安装即可用，无供应链负担。适合塞进企业内网。

---

## 三、不足与缺陷

按"会不会真的造成损失"排序。**P0 均已本地复现，附可复现命令。**

### P0-1 证据门禁有实测绕过路径：lite → upgrade 后零证据可 ship

**现象**：lite 变更的 `test-cases.md` 模板行被写成"手动"验证方式；`--upgrade` 只删 lite 标记、补 spec.md，**不修改用例行**。而 `ai ship` 的规则是"全部用例为手动 → 跳过 JUnit 核对"。

**复现**：
```bash
ai init --stack java && ai new f1 --lite && ai new f1 --upgrade
# 补全 proposal 待确认问题后
ai ship f1     # 项目里没有任何测试报告
```
**实测输出**：`全部用例为手动验证：跳过 JUnit 报告核对` → `SHIP_GATES_PASSED`，**exit=0，零证据通过**。

**影响**：越界升级恰恰是"涉及 DB/API 契约"的高风险变更——**最需要证据的场景，恰好是门禁失效的场景**。这是当前版本最严重的问题，因为它打穿了唯一可机械验证的卖点。

**修复**：升级时把用例行的"手动"重新标记为待定；`ai ship` 对非 lite 变更强制要求"至少 1 条非手动用例且全部有通过记录"，否则拒绝并提示补测试。同时把 check 的"覆盖要求"（写操作必须有并发用例等）也落成校验。

---

### P0-2 证据不绑定变更、不校验时效

**现象**：`findReportDirs()` 全局扫描固定的 5 个目录；TC 通过性只按**数字编号**匹配（`TC_RE = /TC[-_]?0*(\d+)/`），不携带 change-id；无"报告 mtime 晚于代码修改"的校验。

**复现**：建两个变更 g1、h1（用例编号都是 TC-01/TC-02），只放入 g1 的测试报告，然后：
```bash
ai ship h1
```
**实测输出**：`EVIDENCE_OK：报告 1 份，非手动用例 2 条全部有通过记录` → 通过，**exit=0**。

**影响**：
1. 任何变更都能被**别的变更（甚至上次迭代残留）的旧报告**顶替；
2. 改了代码但不重跑测试，旧报告照样过；
3. README 宣称"**谎报无效**"属过度承诺——手写一个 XML 同样能过（我的复现里 XML 就是手写的）。

**修复**：① 报告按 change-id 隔离（`test-results/<change-id>/` 或 ship 时校验 XML 内 `change-id` 标记）；② 强制 `报告 mtime ≥ HEAD commit 时间 / 变更目录内最新修改时间`；③ 校验报告内的 TC 全名含 change-id（如 `test_<change-id>_TC01_xxx`）。

---

### P0-3 规则文件里有 9+ 处悬空引用（v2 重构删文件没同步改文档）

AI 被明确要求"必须读取"的文件，实际不存在也不会被安装：

| 被引用的文件 | 出自 |
|---|---|
| `.ai/docs/AGENT_ROUTING.md`、`.ai/docs/`、`.ai/tools/` | `agent-spec.md`、`rules/00-agent-base.md` |
| `.ai/rules/02-business.md`、`.ai/rules/03-product.md` | `agent-spec.md` |
| `CONTEXT.md`、`CONTEXT-MAP.md`、`TASK_TEMPLATE.md`、`openspec/config.yaml` | `agent-spec.md` |
| `.ai/scripts/run-tests.sh`、`.ai/scripts/summarize-log.sh`、`templates/project.env.example`、`.agent/project.env`、`.agent/logs/test.log` | `rules/50-testing.md` |
| `test-cases-check.sh --evidence` | `rules/53-release.md`（发布必查清单！） |
| `.agent/codegen.toml` | `agents/agent-dev.md` |
| `.ai-control/project.env` | `rules/22-rbac.md`（第三套配置路径，实际是 `.ai/config.json`） |

**影响**：模型读到"必须读取 X"会去读，读不到就可能**编造**或空转；更糟的是 `50-testing.md` 让 AI **优先**执行 `bash .ai/scripts/run-tests.sh`，与 v2 的 `ai test` 命令**正面冲突**；`53-release.md` 让 AI 运行不存在的 `test-cases-check.sh`。这是当前**修复成本最低、收益最高**的一项。

**修复**：全库替换为 v2 真实路径；并在 `tests/budget.js` 或 `ai check` 里加一条"引用存在性校验"，防止再退化（这条校验本身也是差异化功能：**规则库自检**）。

---

### P0-4 README 对门禁能力的描述与代码不符；"两个确认点"零留痕

**实测（Grep 全 lib）**：`rollback|回滚|DDL|migration|表结构` **零命中**；`确认` 相关逻辑 **零命中**。`affected_tables` 非空时，代码只做了一件事：`console.log("提示：本变更涉及数据库，建议…独立审查")`。

**影响**：
1. README 说"机械门禁只留三处（**DB 确认**、lite 越界、测试证据）"——**DB 确认根本不是机械门禁**，只是打印一行提示。真实机械门禁只有 2 处。
2. "change 确认"完全靠模型自觉：`ai check`、`ai ship` 都不校验"是否真的确认过"。我在复现时新建的 g1/h1 **未经任何用户确认**就通过了 check + ship。
3. 无 `confirmed: {by, at, sha}` 留痕 → 无法审计、无法回答"这行代码是哪次确认后写的"，而 `53-release.md` 自己的必查项就写着"高风险 SQL 是否已获得用户确认"。

**修复**：README 措辞改准（这点诚实比宣传重要）；增加 `ai confirm <id>` 写入确认记录（确认人/时间/commit sha）到 proposal frontmatter，`ship` 校验存在且**晚于最后一次代码变更**，把"确认点"从提示词变成可审计事实。

---

### P0-5 分发链条是断的

| 问题 | 证据 |
|---|---|
| npm 包未发布 | `registry.npmjs.org/@brightliu/ai-control` → `{"error":"Not found"}`；npm 搜索 `brightliu` → 0 命中。README 的 `npm install -g @brightliu/ai-control` / `npx` **两条路都是死路** |
| 默认分支是空的 | 默认分支 `master`，README 仅 **12 字节**（`# ai-control`）。用户点开仓库看到的是空项目，v2 内容全在 `main` |
| 无 LICENSE 文件 | `package.json` 写 `"license": "MIT"`，仓库中无 LICENSE |
| 无 description / topics / homepage | 均为 null，GitHub 搜索基本搜不到 |

### P1-1 影响范围解析只认一种 YAML 写法

`scopeItems()` 用正则只接受块列表。**实测**：把 `affected_tables` 写成 `affected_tables: none`（最自然的 YAML 写法）→ `[FAIL] 影响范围缺少字段: affected_tables`，**check 直接失败**，而内容其实完全正确。
反向问题：`- none` 的过滤是严格字符串比较，`- None` / `- 无` 会被当作真实条目 → **lite 误拦**。

**修复**：改用 YAML 解析（或宽松兼容：标量/inline/大小写/中文"无"）；这类"格式误伤"在真实使用中会不断产生假失败，非常伤信任。

### P1-2 证据门禁只在 Java 生态开箱可用

`findReportDirs()` 硬编码 5 个目录（surefire / failsafe / build/test-results / test-results / reports/junit）。而：
- `go test ./...` 默认**不产 XML**；
- PHPUnit 需显式 `--log-junit`；
- Vitest/Jest 需配 reporter 才有 JUnit。

README 宣称支持 java/vue/react/go/php，但除了 Maven 之外的栈，`ai ship` 会直接 `die("未找到 JUnit 报告目录")`。而 `50-testing.md` 也没有给出各栈 JUnit 配置指引。

**修复**：内置各栈 JUnit 输出配置（`ai test --junit` 自动注入 reporter / 生成 surefire+gradle+vitest+jest+gotestsum+phpunit 的配置片段），或在 `ai init` 时按栈写进 `.ai/config.json`。

### P1-3 安装引导存在死锁

**实测**：
```bash
echo "# 我原有的契约" > AGENTS.md
ai init --stack java    # [FAIL] AGENTS.md 已存在…请用: ai init --update   (exit=1)
ai init --update        # [FAIL] 未安装（缺 .ai/），--update 无从更新      (exit=1)
```
两条命令互踢。而"项目里已有 AGENTS.md"在 2026 年是很常见的情况（Codex/Cursor 生态普及）。

**修复**：提供 `--merge`（在既有 AGENTS.md 前插入契约区块并留标记）/ `--force`（备份后覆盖）；至少把第一条错误信息改成可执行的下一步。

### P1-4 stack 处理过于简单，与"全栈"定位不符

- `--stack` **不校验枚举**：`ai init --stack javas` 静默写入 `config.json`（实测 exit=0）；
- `detectStack()` 只看根目录：后端 `pom.xml` + 前端 `frontend/package.json` 会被判成 `java` 或 `unknown`；
- `config.json` 只有**一个** `stack` 字段——但规则库同时提供 `41-spring-boot` 与 `31-vue3/32-react`。一个"Java + Vue"的全栈项目**无法同时声明两个栈**，与产品名"中文全栈"自相矛盾。
- **修复**：`stack` 改为数组（`stacks: ["java","vue"]`），或按目录声明 `stackMap`；`--stack` 做白名单校验并报错提示可用值。

### P1-5 开发者体验与声明不符

- `npm test` 依赖 `bats`，但 bats **既没写进 devDependencies 也无法通过 npm 安装**，README 无安装说明（本机实测：`bats not found` → 贡献者克隆后 `npm test` 直接失败）。CI 里用 `sudo npm i -g bats` 且**未锁版本**。
- `engines: node >=18` 偏乐观：`gate.js` 用了 `fs.readdirSync(dir, {recursive:true})`，该选项 **Node 18.17.0 才加入**。实际要求应写 `>=18.17`（或替换实现）。CI 只用 Node 20，测不出这个边界。
- CI 无 lint、无 `npm pack` 冒烟、无跨平台（macOS/Windows）矩阵，而 Windows 是这类工具的重要用户群。

### P1-6 WorkBuddy 适配方式有架构问题（且你本地已踩到）

`ai sync` 生成 `workbuddy-skills/` 后，提示用户**手动复制到全局** `~/.workbuddy/skills/`。但：
1. 技能内容是**本项目专属**（引用 `.ai/rules/...` 且内嵌该项目的规则快照）——项目 A 装完，项目 B 再装会**静默覆盖** A 的快照；
2. 技能名固定（`agent-spec`/`agent-dba`/`agent-dev`/`agent-test`），多项目/多栈共用同一组名字必然冲突；
3. `ai-control-contract` 的描述写着"**本项目内**任何开发任务前必须先应用"，却装在全局作用域——作用域与措辞矛盾；
4. WorkBuddy 已支持**项目级技能**（`{workspace}/.workbuddy/skills/`），而工具只给了全局安装指引，明显更该优先导出到项目级；
5. **你本机现状已经不一致**：`~/.workbuddy/skills/` 里是 v1 产物——6 个角色（多出 `agent-architect`、`agent-release`）+ `ai-control-contract` 546 行、`version: 1.0.0`；而 v2 是 4 角色 + 63 行契约、`version: 2.0.0`。v2 的 `ai sync` 只会产出 5 个技能，**旧的 architect/release 会变成孤儿**，与新契约并存还有冲突风险。

**修复**：`ai sync --scope project|global`，默认 project；升级说明里明确写"卸载 v1 残留技能"；技能描述去掉"本项目内"这类作用域矛盾措辞。

### P1-7 与真 OpenSpec 目录撞名但格式不兼容

变更落在 `openspec/changes/<id>/`，但文件集与 OpenSpec 现行规范不同：OpenSpec 为 `proposal.md + design.md + tasks.md + specs/<capability>/spec.md + .openspec.yaml`，归档到 `openspec/changes/archive/YYYY-MM-DD-<id>/`；ai-control 是 `proposal.md + test-cases.md + specs/<id>/spec.md`，**无 tasks.md、无 .openspec.yaml、无 archive 流程**（`agent-spec.md` 与 `AGENTS.md` 都提到"归档到 openspec/specs/"，但 CLI 里没有对应命令）。

**影响**：两者同装时 `openspec list/validate` 可能把 ai-control 的变更当成格式错误；用户无法用 OpenSpec 的 diff/archive 能力，也无法声称"兼容 OpenSpec"。
**修复**：二选一——要么对齐 OpenSpec 格式（真互通，且能白拿它的 archive/validate 能力），要么把目录改成 `.ai/changes/` 避免撞名。**当前"用它的名字、不用它的格式"是最差选项。**

### P2 级问题（不致命，影响上限）

| # | 问题 | 说明 |
|---|---|---|
| P2-1 | 命令语义与实现不一致 | `ai test <id>` 的 id 参数被完全忽略（`cmdTest()` 不接收参数），而 `AGENTS.md` 与三个 Claude 技能都写 `ai test <id>`——用户以为能按变更过滤，实际跑全量 |
| P2-2 | 缺常用命令 | 无 `ai list/status`（看有哪些变更、各自到哪一步）、无 `ai archive`、无 `ai uninstall`、无 `--dry-run` |
| P2-3 | 无机器可读输出 | 全靠中文文本信号（`CHECK_PASSED`/`SHIP_GATES_PASSED`）字符串匹配，无 `--json`；退出码（1=用法错、2=门禁失败）未文档化 → 难以接入 CI/脚本 |
| P2-4 | 门禁时机偏后 | 全部是"事后检查"。真正的护城河应该是**前移拦截**：为 Claude Code / WorkBuddy 生成 hooks（PreToolUse）拦越界文件写入、拦非授权 SQL，而不是等写完再复查 |
| P2-5 | 覆盖要求未机械化 | "涉及写操作必须有并发/重复提交用例"等只是文档文字；机械检查只有 3 个关键词（`异常流`/`权限`/`空态,错误态`）。关键词门禁既会漏（换个说法就逃过），也会过（写一句"权限"就满足） |
| P2-6 | 全中文硬编码 | 输出、门禁关键词（"手动""异常流""权限""空态"）全部中文硬编码。英文团队/英文用例 → 门禁**误报为缺用例**。应把关键词放进 `config.json` 可配置 |
| P2-7 | 无团队/合规能力 | 无变更状态机、无确认留痕、无审计日志、无 CI/PR 集成（没有可用的 GitHub Action 让 ship 门禁在 PR 上跑）、无 SARIF/机器报告 → 不能作为团队合规凭证 |
| P2-8 | 仓库治理缺位 | 无 CONTRIBUTING、无 CHANGELOG、无 release/tag、无 issue/PR 模板、无 demo 仓库或录屏、无 CODE_OF_CONDUCT |
| P2-9 | 品牌与资产分散 | 作者近半年有 5 个相关仓库：`ai-fullstack-control-system`(2★) → `ai-dev-guardrails`(0★) → `ai-coding-fun`(6★) → `ai-control`(0★) + `bmo-low-code`。v1 拿到 6★ 后被弃用，老用户不知该跟谁；对外叙事被稀释 |

---

## 四、与市面成熟项目的对比

> 星标数据为 2026-09-11 通过 GitHub API 实时抓取。

| 维度 | **ai-control** | OpenSpec | GitHub Spec Kit | BMAD-METHOD | Agent OS | Taskmaster |
|---|---|---|---|---|---|---|
| Star | 0 | ~67.9k | ~135.4k | ~52.9k | ~5.4k | ~28.1k |
| 形态 | npm CLI + AGENTS.md 契约 | npm CLI + 斜杠命令 | 命令集 + 模板 | 提示词/角色包 | 标准 + 子代理 | CLI + MCP server |
| 规格事实源 | `openspec/changes/<id>/`（proposal+test-cases，格式与 OpenSpec 不兼容） | ✅ spec delta + validate + archive | ✅ spec/plan/tasks | ✅ PRD/架构/故事 | ✅ product specs | ⚠️ 任务图（非规格） |
| **可执行门禁** | ✅ **lite 越界 / 证据核对 / 待确认**（但 DB 确认与证据绑定有洞） | ⚠️ 仅 spec 结构校验 | ❌ 无 | ❌ 无 | ❌ 无 | ⚠️ 仅任务依赖 |
| 测试证据机制 | ✅ JUnit 报告直查（**仅 Java 栈开箱可用**） | ❌ | ❌ | ❌ | ❌ | ❌ |
| 成本分层 | ✅ lite 两件套 / 完整三件套 + upgrade | ✅ 液体式、可迭代 | ⚠️ 全流程偏重 | ⚠️ 偏重 | ⚠️ | ✅ 任务粒度 |
| 多工具适配 | ✅ AGENTS.md 单源 + Claude/WorkBuddy 导出 | ✅ 多工具（含 skills/agents 导出） | ✅ 30+ 工具 | ⚠️ 以 Claude 为主 | ✅ | ✅ MCP 通用 |
| 复杂度自控 | ✅ **预算写进 CI（独有）** | ⚠️ | ⚠️ | ❌ 扩张包易膨胀 | ⚠️ | ⚠️ |
| 中文全栈规则 | ✅ **2000 行实战规则（独有护城河）** | ❌ | ❌ | ❌ | ❌ | ❌ |
| 分发成熟度 | ❌ 未发布 npm、默认分支空 | ✅ npm + Discord + 文档站 | ✅ 官方维护 | ✅ 社区活跃 | ✅ | ✅ |
| 生态 | ❌ 0 贡献者、无 release | ✅ 贡献者/下载量/CI 徽章 | ✅ 微软背书 | ✅ 扩展包生态 | ⚠️ | ✅ |

### 差异分析

1. **同类都没有"可执行门禁"，这是 ai-control 唯一的结构性优势**。Spec Kit / OpenSpec / BMAD / Agent OS 本质是"流程 + 模板 + 提示词"，是否真的跑了测试、是否真的没越界，全靠模型自觉。ai-control 用 121 行代码做了别人没做的事。**但目前 P0-1/P0-2 让它漏气，先把洞补上，这个优势才成立。**
2. **中文全栈规则库是第二个不可复制的优势**。`pk_id/id` 分离、JOIN 禁止先连后分页、枚举 code+desc、两阶段 DB 确认——海外框架的抽象层里永远不会有这些。但它同时也是**局限**：全中文 + 硬编码关键词，决定了它很难走出中文团队。
3. **和 OpenSpec 的关系最尴尬**：直接用了对方的目录名，却不用对方的格式，还缺 tasks.md/.openspec.yaml/archive。**要么真兼容（能白拿 validate/archive 和多工具导出），要么改目录名**（`.ai/changes/`）。现在的状态是"借名不借壳"，两边好处都没拿到，还多了混淆。
4. **差距不在理念，在分发与生态。** 理念（约束层 + 机械门禁 + 成本分层）比大厂方案更有想法；但 0 star、npm 未发布、默认分支空 README、无 release/CHANGELOG/社区——**当前一个陌生开发者从 README 点进来，5 分钟内走不完"看到 → 装上 → 跑通"这条链**。这是它和 13 万星项目之间唯一的实质差距，而且这个差距**不需要重新设计就能补**。
5. **面向国际市场的选择**：BMAD 靠角色扮演 + 扩展包做"团队仿真"，OpenSpec 靠"液体式流程 + 归档"做事实源，Spec Kit 靠"命令集 + 官方背书"做覆盖面。ai-control 若想差异化到国际，唯一能立住的是**"可机械验证的证据链"**——即：把"AI 说自己测过了"变成"报告存在、无失败、用例覆盖、时间晚于改动、且绑定本次变更"。这是全行业都缺的，也正好是它已经在做的。

---

## 五、改进路线图（按投入产出排序）

### 第一优先（今天就能做完，收益最大）
1. **清掉 9+ 处悬空引用**，全部改为 v2 真实路径；`50-testing.md` 的脚本改为 `ai test`；`53-release.md` 的 `test-cases-check.sh --evidence` 改为 `ai ship <id>`；统一配置路径为 `.ai/config.json`（删掉 `.agent/project.env`、`.ai-control/project.env`、`openspec/config.yaml` 三套说法）。
2. **加一条"引用存在性校验"进 CI**：扫描 payload 内所有 `.ai/…`、`CONTEXT*.md`、`*.sh` 引用，不存在即 CI 红。这条校验本身就是卖点（规则库自检），也能防止下次重构再退化。
3. **README 措辞改准**：机械门禁 = lite 越界 + 测试证据（2 处），DB 确认是"提示 + 建议独立审查"；把"谎报无效"改为"可检测的伪造（手写 XML 仍可绕过）"。
4. **补 LICENSE、description、topics**；**把默认分支切到 main**（删 master 或合并），否则仓库首页等于空的。
5. **发布 npm 包**，或在 README 首行把安装方式改为 `git clone + npm link`（现在两条路都不通）。

### 第二优先（本周，补上核心卖点的洞）
6. **证据绑定 + 时效校验**：报告按 change-id 隔离；校验 `报告 mtime ≥ HEAD commit 时间`；TC 全名须含 change-id。
7. **堵住 lite→upgrade 的绕过**：升级时重置用例类型；非 lite 变更 ship 时强制"≥1 条非手动用例且全部通过"。
8. **`ai confirm <id>` + frontmatter 留痕**（by / at / sha），ship 校验确认存在且晚于最后一次代码变更 —— 把"两个确认点"变成审计事实。
9. **解析稳健化**：YAML 标量/inline/大小写/中文"无"全部兼容；门禁关键词移入 `config.json`（支持中英双语）。

### 第三优先（本月，扩大适用面与护城河）
10. **多栈证据适配**：内置 Maven/Gradle/Vitest/Jest/gotestsum/PHPUnit 的 JUnit 输出（`ai test --junit` 自动注入），否则 go/php/node 用户第一天上手就撞墙。
11. **门禁前移**：为 Claude Code / WorkBuddy 生成 hooks，在**写文件时**拦越界文件与危险 SQL。这是别人没有、且很难抄的护城河。
12. **WorkBuddy 适配修正**：默认导出到项目级 `.workbuddy/skills/`；`--scope project|global`；升级说明写明清理 v1 残留技能（architect/release）。
13. **OpenSpec 关系定性**：要么补齐 `tasks.md` + `.openspec.yaml` + `ai archive` 真正互通，要么目录改名 `.ai/changes/`。
14. **CLI 补全**：`ai list/status/archive/uninstall`、`--json`、退出码文档化、`ai test <id>` 真的按变更过滤。

### 第四优先（季度，做生态）
15. **GitHub Action**：PR 上自动跑 check + ship，把结论作为 check 输出（团队场景的入场券）。
16. **收敛品牌**：把 `ai-fullstack-control-system` / `ai-dev-guardrails` / `ai-coding-fun` 合并到 `ai-control`，写清 v1→v2 迁移指南；补 CHANGELOG、release tag、CONTRIBUTING、issue 模板、一个 3 分钟 demo 仓库/录屏。
17. **英文 README + 结构化规则**（规则库是最大资产，值得让海外用户看见）。
18. **可选**：monorepo 多栈（`stackMap`）、变更状态机（draft → confirmed → implemented → shipped → archived）、审计日志导出。

---

## 六、附：本次实测记录

| 实验 | 命令 | 结果 |
|---|---|---|
| 单测 | `node tests/unit.test.js` | 6/6 通过，exit=0 ✅ |
| 预算门禁 | `node tests/budget.js` | 内核 498/1500、addons 88/600、契约 63/100、文档 1/1，exit=0 ✅ |
| 已有 AGENTS.md | `ai init --stack java` → `ai init --update` | 两条命令互踢，均 exit=1 ❌ |
| stack 校验 | `ai init --stack javas` | 静默接受，写入 `"stack": "javas"`，exit=0 ❌ |
| inline YAML | `affected_tables: none` | `[FAIL] 影响范围缺少字段: affected_tables`，exit=2 ❌ |
| 升级后证据 | `ai new f1 --lite` → `--upgrade` → `ai ship f1` | 零测试报告仍 `SHIP_GATES_PASSED`，exit=0 ❌ |
| 证据串号 | 只放 g1 的报告，`ai ship h1` | `EVIDENCE_OK` 通过，exit=0 ❌ |
| DB 门禁 | Grep `rollback|回滚|DDL|migration|表结构` in `lib/` | 0 命中，确认无机械 DB 校验 ❌ |
| 确认留痕 | Grep `确认` in `lib/` | 0 命中，确认无确认状态记录 ❌ |
| npm 发布 | `registry.npmjs.org/@brightliu/ai-control` | `{"error":"Not found"}` ❌ |

> 备注：本次因网络代理（CONNECT tunnel 502）无法 `git clone`，改为通过 GitHub API 下载 main 分支全部 51 个文件后本地运行验证；bats 未安装，9 个 E2E 未在本机执行（按代码审阅评估）。
