# Changelog

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
