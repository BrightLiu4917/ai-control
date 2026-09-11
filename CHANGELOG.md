# Changelog

## 2.2.0 (2026-09-11)

自审修复：消除四类误拦、补两道防线（用户步骤 +0）。

### 修复
- 确认完整性改用**契约内容哈希**（原 mtime 方案在 git clone/换机器/checkout 后
  全体确认假失效，团队场景不可用）；只动 mtime 不再打扰，改内容才要求重确认
- **变更生命周期终点**：ship 通过写入 shipped.json——已交付变更不再进
  guard-write 白名单（防随历史膨胀）、不再触发多变更强制隔离（第二个需求起
  不被误伤）、doctor 不再误报
- **简单任务通道**：未确认草稿只锁"它自己声明要改的文件"，无关小改不再被
  烂尾草稿连坐拦截
- hooks 命令改 `$CLAUDE_PROJECT_DIR` 绝对路径（原相对路径在子目录启动
  Claude Code 时失效/报错）；settings 合并按文件名去重并自动升级旧条目
- `ai sync --force` 覆盖用户手改过的生成物（如 CLAUDE.md）前自动备份

### 新增
- **密钥扫描**：ship 扫描本变更 diff（未提交 + 确认后已提交），命中 AWS
  Key/私钥/GitHub/npm/Slack Token/带密码连接串即拒绝交付（红线：禁止密钥
  入库/外发）；config "secretScan": "off" 可关
- **声明诚实性软核验**：ship 列出"实际改动但未在影响范围声明"的文件清单
  （只警告不拦——硬拦会造成重确认死循环式打扰），供用户与独立审查参考
- README/SECURITY 边界声明补透：空壳测试、流程启动依赖 AI 自觉两条原理边界


## 2.1.0 (2026-09-11)

基于两轮独立外部审计（见 docs/external-review-2026-09-11.md）的修复与增强。

### 新增
- `ai confirm <id>`：确认留痕（确认人/时间/提交号），ship 的机械前置；确认后变更单再改动即失效，须重新确认。须由用户本人执行，AI 代跑会被钩子拦截
- Claude Code PreToolUse 钩子（`ai sync` 生成）：未确认写业务代码、写影响范围外文件、危险 SQL、代跑 confirm——动手瞬间拦截；`AI_CONTROL_HOOKS=off` 逃生阀
- `ai test <id>`：报告写入 `test-results/<id>/` 按变更隔离；Maven/自定义命令跑完自动收割新报告
- 多栈 JUnit 注入：Go 输出零依赖自转报告；Vitest 自动注入；PHPUnit 自动加参；Jest 给安装指引
- GitHub Action（action.yml）：PR 上自动跑 check/ship
- `ai doctor` 钩子体检与确认失效检测；`ai init --force`（备份后接管已有 AGENTS.md）
- 引用存在性自检（tests/refs.js）进 CI：规则库悬空引用零容忍

### 修复（外部审计）
- 证据链三洞：升级绕过（碰库/API 强制自动化用例）、旧报告顶包（报告须晚于确认）、跨变更串号（多变更强制隔离目录）
- `.claude/settings.json` 改 JSON 合并，不再覆盖用户配置；写后读回校验
- 悬空引用 25 处清零；YAML 行内标量与中英文 none 兼容；stack 白名单校验
- WorkBuddy 改项目级技能目录（免复制、多项目不互覆盖）

### 变更
- 变更目录 `openspec/` → `.ai/changes/`（与 OpenSpec 划清边界，不再借名）
- 角色技能改名：openspec-feature → new-feature、openspec-ready → ready-check

## 2.0.0 (2026-09-11)

v1（ai-coding-fun，15 批迭代）彻底重构：5000 行 bash → 零依赖 Node 内核；
砍掉二审/tasks.md/同步机制，角色 6→4；npm 分发；栈规则库原样移植（命根子未动）。
