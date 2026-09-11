# @brightliu/ai-control

**AGENTS.md 标准之上的中文全栈 AI 工程控制层**：规格先行、数据库两阶段确认、证据验收。让 AI 写业务代码从"祈祷式生成"变成可确认、可验证、可回滚的流程。

```text
你说需求 → AI 影响探测判级 → 你确认（proposal + 验收用例）→ AI 实现
→ ai test（JUnit 报告即证据）→ ai ship 秒级门禁 → 交付
```

支持 **Codex / Claude Code / Cursor / Kimi / Qoder / WorkBuddy**——前四家原生读 AGENTS.md 零适配，后两家一条 `ai sync` 生成适配物。

## 为什么需要它

| AI 编码的典型事故 | 本工具的对策 |
|---|---|
| 发明字段、枚举、API 路径 | **规格先行**：change 未经你确认禁止写码 |
| 实现完自己宣布"测试通过" | **报告即证据**：门禁直查 JUnit（存在、无失败、TC-ID 覆盖），谎报无效 |
| 顺手执行危险 SQL | **两阶段确认**：表结构审查 → 变更确认包 → 你点头才执行 |
| 小改动被流程拖死 | **lite 快速通道**：两个文件 30 秒确认；越界被门禁拦下、`--upgrade` 平滑升级 |

哲学一句话：**AI 的自由度和改动的风险成反比**。你只需守住两个确认点（change 确认、数据库确认），其余门禁全部脚本自动拦。

## 安装与使用

```bash
npm install -g @brightliu/ai-control     # 或 npx 免装
cd 你的项目
ai init --stack java                     # 装入 AGENTS.md + .ai/（不覆盖已有文件）
ai sync                                  # 可选：生成 Claude / WorkBuddy 适配物
```

日常四个命令：

| 命令 | 作用 |
|---|---|
| `ai new <id> [--lite\|--upgrade]` | 建变更骨架（lite=两件套快速通道；upgrade=lite 升级保留内容） |
| `ai check <id>` | 契约门禁：影响范围 / lite 越界 / 用例覆盖 / 待确认问题 |
| `ai test` | 跑项目测试（JUnit 报告即验收证据） |
| `ai ship <id>` | 证据门禁：报告直查 + 高风险提示，秒级完成 |

在 AI 应用里**连命令都不用记**——AGENTS.md 契约让 AI 自己走流程：

```text
你：帮我把订单列表加个导出按钮
AI：影响探测：不碰表和接口 → lite。已建变更单：
    【级别 lite】【用例】TC-01 点击导出下载文件（手动验证）
    确认吗？
你：确认
AI：（实现 → ai ship 秒过）完成。
```

## 装进项目后的结构

```text
你的项目/
├── AGENTS.md        契约（~60 行）——Codex/Cursor/Kimi/Qoder 自动读取
├── openspec/        你的变更记录（proposal + test-cases，完整变更多一份 spec）
└── .ai/             规则库与手册（AI 按需读取，你不用打开）
    ├── agents/      4 个角色手册（spec/dba/dev/test，dev 按栈拆分）
    ├── rules/       20 份工程规则（DB/API/JWT/RBAC/前后端各栈/枚举/测试/安全/发布）
    └── templates/   变更模板 + 独立审查提示词
```

规则库是本工具的核心资产：JOIN 禁止先连后分页、`pk_id/id` 分离、枚举 code+desc 双字段禁魔法值、租户/软删除必查——**中文全栈踩坑经验的规则化**，这是通用框架（BMAD/Spec Kit）没有的。

## 高风险变更的独立审查（可选）

发布门禁检测到涉及数据库/支付/状态流时会提示：在**新会话**中使用 `.ai/templates/review-prompt.md` + git diff 做一次独立审查（审查者不能是写代码的会话），输出机读结论 `VERDICT: PASS | PASS_WITH_RISKS | BLOCK`。零配置、零 API key——用你手头任何 AI 工具即可。

## 升级

```bash
npm update -g @brightliu/ai-control
cd 你的项目 && ai init --update    # 只更新框架文件，自动备份，绝不碰 openspec/ 与 config
```

## 工程质量

- 验收测试先行：9 个端到端场景（安装/lite/证据链/越界升级/误报防护/待确认门禁/适配导出）+ 6 个单测
- **预算即门禁**：内核 ≤1500 行、契约 ≤100 行、文档 1 份——超预算 CI 直接红，防复杂度失控
- 零运行时依赖：只需 Node ≥18 + git

## 设计原则

1. 约束放 prompt 层（契约+规则+手册），机械门禁只留"错了不可逆"的三处（DB 确认、lite 越界、测试证据）。
2. 验收以原始证据为准（测试框架生成的报告），不维护 AI 手填的状态表。
3. 复杂度预算写进 CI：加新功能前先删旧的。

由 v1（[ai-coding-fun](https://github.com/BrightLiu4917/ai-coding-fun)）经 15 批实战迭代后彻底重构而来：bash 5000 行 → JS ~600 行，change 五件套 → 两件套，角色 6 → 4，文档 10+ 份 → 1 份。
