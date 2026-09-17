# Changelog

## 2.3.0 (2026-09-17)

使用可见性：回答"这东西到底有没有在被用"。用户步骤 +0（装完就有，可关）。

### 新增
- **每条命令一行工牌**：`◆ bright-ai-coding · ai-control v2.3.0 · ai ship · 本机第 37 次`。
  终端里是彩色的；非 TTY（脚本 / CI / AI 调用）自动改走 stderr——stdout 的机器契约
  （单行大写结果标记）不受影响
- **本机使用日志** `~/.ai-control/usage.jsonl`：记命令 / 变更号 / 项目 / 退出码。
  只写本机、不采集代码内容、不发网络请求；超 1MB 只保留尾部 2000 条
- **`ai stats`**：命令与项目分布、近 7 天、非零退出、最近记录，外加本项目的
  进行中 / 已交付变更与**钩子拦截次数**
- **钩子拦截留痕** `.ai/interceptions.jsonl`（已加进 .gitignore）：只记"被拦下"的事件
  ——未确认写业务代码、写影响范围外文件、危险 SQL、AI 代跑 confirm。
  调用次数说明"有人跑过"，拦截次数说明"它真的拦下过东西"
- **Claude Code SessionStart 会话工牌**（`ai sync` 注入）：新开会话 / `/clear` / 恢复 /
  压缩后打一行工牌，并通过 `additionalContext` 把进行中变更注入 Claude 上下文
- `.ai/VERSION`：记录项目里这份框架是哪个版本装进去的；`ai doctor` 据此提示版本漂移

### 变更
- 新增开关：`AI_CONTROL_QUIET=1` 只关工牌、`AI_CONTROL_USAGE=off` 连记录一起关；
  项目侧可写 `.ai/config.json` 的 `"banner"` / `"usage"`（团队统一口径）
- `ai doctor` 增加三项：框架版本漂移、本机使用量、本项目被拦次数
- `ai help` 增加 `ai stats` 一行

### 修复
- 记账的位置参数解析：`ai init --stack java` 不再把 `java` 误记成变更 id
- 拦截留痕 `.ai/interceptions.jsonl` 也加上限（保留尾部 2000 行）——AI 若陷在
  "反复尝试写被拦文件"的循环里，原实现会无限增长

### 实测开销（M3 Max，40 次取均值）
- `ai` 命令净增 **+1.25ms/次**（日志已到 2000 行上限的最坏情况；其中 ~21ms 是 node 启动本身）
- 工牌一行 ≈ **21 tokens**；一个完整需求（约 7 条命令）≈ **147 tokens**
- `SessionStart` 钩子 ≈ **22ms/会话**（node 启动占绝大部分，钩子自身 <1ms）
- 拦截留痕只在"被拦下"时写，正常开发 0 开销

### 确认留痕：来源如实标注（cli / ai-attested）

- `confirmed.json` 新增 `source` 字段：`cli`（用户在终端自己敲）/ `ai-attested`（用户在对话里同意、AI 代记）；
  新增 `ai confirm <id> --attested` 供 AI 在用户明确同意后代记
- **`ai ship` 输出里显示确认来源**；`ai doctor` 汇总 `确认来源: cli N · ai-attested M`；
  旧版本产物（无 source）不报错，标注"未记录"
- Claude Code 钩子改为拦「**不带 `--attested` 的 `ai confirm`**」（冒充"用户本人敲的"），放行如实代记；
  拦截文案直接给出两条可复制的命令（含抓出来的真实 change-id）
- **为什么这么改**：「必须用户本人敲」在本地**无法强制**（AI 有 shell 权限，真想代跑总跑得掉）。
  与其给假的安全感，不如要求**留痕如实标注来源**。**门禁强度与来源无关**——`ship` 判定一视同仁，
  区别只在诚实不诚实
- 同步文案（7 个工具的读取面全覆盖）：`AGENTS.md`（Codex/Cursor/Kimi/Qoder/Trae 都读）、
  `agents/agent-spec.md`、`ai new` 的提示、`ai sync` 生成的 `CLAUDE.md` 与两个 Claude 技能、
  `.workbuddy/` 技能（内嵌 AGENTS.md 快照，自动跟随）
- 升级提示：已有项目跑一次 `ai sync --force` 刷新钩子与技能文案

### 多工具钩子适配：六个工具，同一份守卫脚本

- `ai sync` 从"只装 Claude Code"扩展到 **Claude Code / Codex / Qoder / Trae / Cursor / WorkBuddy**
  —— 它们的 PreToolUse 协议互通（stdin 收 `tool_input`、`exit 2` 阻断 + stderr 回传模型），
  所以 `.ai/hooks/guard-*.js` 逻辑**一行未改**，差异只在各工具的配置文件格式：

  | 工具 | 项目级配置文件 | 差异点 |
  |---|---|---|
  | Claude Code | `.claude/settings.json` | 命令用 `${CLAUDE_PROJECT_DIR}` |
  | WorkBuddy | `.workbuddy/settings.json` | 官方称完全兼容 Claude Code Hooks 规范 |
  | Codex | `.codex/hooks.json` | **事件直接在根、无 `hooks` 包裹**；需 `[features] codex_hooks = true`，项目级钩子要在 `/hooks` 信任一次 |
  | Qoder | `.qoder/settings.json` | shell 工具名含 `run_in_terminal` |
  | Trae | `.trae/hooks.json` | shell 工具名是 **`RunCommand`** |
  | Cursor | `.cursor/hooks.json` | **事件名小驼峰**（`preToolUse`）、shell 工具名 `Shell` |

- 合并策略不变：只补/更新我们这三个脚本的条目，用户自己的 hooks 与其它字段原样保留；
  非法 JSON 时不动该文件并告警；写入后读回校验；`--force` 覆盖前先备份（同既有约定）
- **会话工牌（SessionStart）只装给输出契约已确认的工具**（Claude Code / WorkBuddy / Codex / Qoder）；
  Trae / Cursor 暂不装——它们的 SessionStart 输出约束未确认，不冒"把 JSON 当纯文本塞进上下文"的风险
- `ai sync --tools=claude,codex` 可只装子集；`ai sync` 末尾打印**钩子覆盖摘要**与各工具生效条件
- `ai doctor` 改为汇总多工具覆盖（`钩子已挂载 6/6 个工具：…`），并列出未装 / 配置异常的工具

### 修复：伪造留痕（本轮新发现的安全洞）

- **AI 可以直接手写 `confirmed.json` 伪造确认**：`.ai/` 整体在 `guard-write` 的写入放行名单里
  （那是给规则 / 模板 / 配置用的），于是绕开 `ai confirm`、手写一份 `source: "cli"` 的留痕，
  就能凭空造出"用户本人敲过"。已把 `confirmed.json` / `shipped.json` 单独列为例外，
  只能由 `ai confirm` / `ai ship` 生成
- **符号链接导致拦截被绕过**：macOS 上 `/tmp`→`/private/tmp`、`/var`→`/private/var` 是符号链接；
  工具传入的路径与 cwd 一个带链接、一个不带时，相对路径会算成 `../…`，
  被 `rel.startsWith("..")` 当成"项目外文件"放行。已在 `findRoot` 与相对路径计算里做 realpath
  归一化（新文件还不存在时，向上找最近存在的祖先目录再拼回剩余部分）

### 文档与演示物
- `docs/demo.html` 第 6 步重做为「确认：两条路，门禁强度一样」：并列展示 `cli` 与 `ai-attested`
  的真实输出（终端两幕）与 `confirmed.json` 的 `source` 字段，并交代"为什么不再要求必须本人敲"
- 门禁实录 5 条 → **7 条**：新增「AI 冒充你敲确认（钩子当场按住手）」与
  「AI 手写留痕伪造确认（钩子拦住第二条路）」，含钩子拦下时的完整提示
- 按新版输出重采并更新：`ai new` 收尾提示、`ai ship` 首行「确认来源」、`ship` 未确认提示、
  会话徽标 `additionalContext` 文案、`.ai/hooks/` 说明（改成"六个工具共用"）、命令速查行、
  `ai ship` 核对清单新增"确认来源记没记"、第 6 步 note 改为"两条伪造路径都被堵死"
- `docs/install-demo.svg` **同步更新**：`ai sync` 的写入清单从 14 增到 19（多了五个工具的配置文件），
  动画里的 `written=14` 与清单行一并改为多工具版本
- README 演示入口条数同步为"七条门禁拦截"；README 的「支持哪些 AI 工具」整段重写
  （六工具钩子矩阵 + 各自生效条件 + 确认两条路）

### 测试
- 单测 8 → 17：usage 统计聚合 / 容错（空日志、坏行）/ 工牌文案 / 项目 config 开关 /
  TTY 与 NO_COLOR 配色 / 日志超 1MB 裁剪 / 拦截留痕裁剪
- e2e 26 → 33：t27 工牌与记账，t28 会话工牌与拦截留痕，t29 项目级开关与框架版本漂移，
  t30 确认来源 cli/ai-attested，t31 六工具钩子配置生成（含结构差异与 `--tools` 子集），
  t32 钩子合并不动用户配置 + 非法 JSON 容错，t33 手写留痕被拦
- t21 增加「`--attested` 放行」；t22 增加「`--attested` 不跨命令生效」
  （`ai confirm x && ai test y --attested` 仍拦第一条）
- e2e setup 显式 `AI_CONTROL_QUIET=1 AI_CONTROL_USAGE=off`，测试不污染开发者的本机记录

### 已知未覆盖（诚实声明）
- **五个新工具的钩子在真实 IDE 里未实测**：配置文件按各工具官方文档生成（路径 / 包裹层 /
  事件名 / matcher 工具名）并有 e2e 固定这些结构；但"钩子真的被触发、matcher 真的匹配上工具名"
  需要在各 IDE 里各验一次。若某工具改版导致 matcher 不匹配，把该 matcher 删掉即为"匹配全部工具"
  （脚本对不含目标字段的输入立刻放行，只是多一次进程启动开销）
- Claude Code 里 `SessionStart` 工牌**在 UI 上的实际呈现**未做端到端验证：钩子协议按官方 hooks
  文档实现并有测试（喂 JSON 验输出结构），但"用户在会话里是否看到这行字"需要在真实 Claude Code 里确认
- 日志路径不可写（如 `AI_CONTROL_USAGE_FILE` 指向 ENOTDIR）：已实测降级安全——命令照常成功、
  `stats`/`doctor` 显示"还没有记录"。唯一副作用是工牌会一直显示"本机第 1 次"（计数不可用），
  属配置错误场景，不做额外处理

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
