# ai-control

**A rule-keeper for AI coding assistants, installed into your project.**

**English** · [中文](README.md)

Ever hit any of these while coding with Cursor, Claude Code, Codex, Qoder, or Trae?

- The AI **invented** a database column that doesn't exist?
- The AI said "tests pass" — but **never ran them**?
- The AI **fired off** a destructive SQL statement, or altered a table it had no business touching?
- You tried to rein it in, but the process was so heavy that changing one line of copy needed a dozen steps — so **you stopped following it yourself**?

ai-control targets exactly these four things. Installed into your project, the AI **writes a change proposal for you to approve first, waits for your go-ahead before touching the database, and treats the test report as the only acceptable proof (its word does not count)** — while small stuff like copy edits takes a 30-second fast lane that stays out of your way.

> **Before you install — one thing to know.** ai-control's built-in rules, templates and CLI messages are written in Chinese. Terminal output shown throughout this README is **real, untranslated output**, with English glosses, rather than a translated mock-up. See [Language](#language-the-cli-speaks-chinese-for-now).

## Install

<p align="center">
  <img src="https://brightliu4917.github.io/ai-control/install-demo.svg" alt="Install demo: npm installs the tool → ai init installs it into your project → ai sync writes hook configs for six AI tools" width="880">
</p>

Three commands: install the tool, install it into your project, and write hook configs for six AI tools (Claude Code / Codex / Qoder / Trae / Cursor / WorkBuddy). All six read `AGENTS.md` natively, so rule enforcement works from the moment you install. **Want to watch a real requirement go through the whole flow → open the [live demo](https://brightliu4917.github.io/ai-control/demo.html)** (step-by-step animation, seven gate interceptions captured from real runs, and both confirmation paths; you can also clone the repo and open `docs/demo.html` directly). The same set of interceptions is inlined at the end of the walkthrough below.

<details>
<summary><b>Got <code>ai: command not found</code> after installing — or an old version? Open this.</b></summary>

**① Make it run right now (absolute path, copy-paste ready)**

This is not a bug in the package — npm's global bin directory simply isn't on your PATH. Get that directory first (identical on all three platforms):

```bash
npm config get prefix
```

Then invoke the executable directly — **note that Windows and macOS / Linux use different path shapes**:

| Platform | Where the executable actually lives | Direct invocation |
|---|---|---|
| macOS / Linux | `<prefix>/bin/ai` | `"$(npm config get prefix)/bin/ai" init` |
| Windows · cmd | `%APPDATA%\npm\ai.cmd` | `"%APPDATA%\npm\ai.cmd" init` |
| Windows · PowerShell | `<prefix>\ai.cmd` | `& "$(npm config get prefix)\ai.cmd" init` |

> **The key difference**: on macOS / Linux the executables live under `{prefix}/bin/`; **Windows has no `bin` subdirectory** — `ai`, `ai.cmd` and `ai.ps1` sit directly in `{prefix}` (default `%AppData%\npm`). Copying the path shape from the other platform will keep failing.

**② Don't want to type the full path? Alias it for this shell** (no system changes; gone when you close the terminal)

```bash
# macOS / Linux
alias ai="$(npm config get prefix)/bin/ai"
```

```powershell
# Windows PowerShell
Set-Alias ai "$(npm config get prefix)\ai.cmd"
```

**③ Fix it for good: put the global directory on PATH**

```bash
# macOS / Linux (zsh → ~/.zshrc, bash → ~/.bashrc)
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

```powershell
# Windows PowerShell — changes the *User* PATH only, never the system one; reopen your terminal
$npmDir = (npm config get prefix)
$cur    = [Environment]::GetEnvironmentVariable("PATH", "User")
$next   = if ($cur) { "$cur;$npmDir" } else { $npmDir }
[Environment]::SetEnvironmentVariable("PATH", $next, "User")
```

> ⚠️ **On Windows, avoid `setx PATH "%PATH%;%APPDATA%\npm"`.** `%PATH%` expands to the *merged* system + user PATH, so that command copies your entire system path into the user variable; older Windows also truncates it at 1024 characters. Use the PowerShell snippet above, or add an entry by hand under *System Properties → Environment Variables → User variables → Path*.

**④ Don't want to touch PATH at all: use npx** (identical on all three platforms)

```bash
npx -y @brightliu/ai-control@latest init
```

> The trade-off is spelling out the full package name every time (`ai init` → `npx -y @brightliu/ai-control init`). Fine for one-off recovery.

---

**Installed, but not the latest version?** Mirror registries (corporate proxies, regional mirrors) can lag npmjs.org by minutes to hours. The symptom: **the install reports no errors, but `ai version` shows something old.**

```bash
# Compare the two
npm view @brightliu/ai-control version --registry=https://registry.npmjs.org   # canonical
npm view @brightliu/ai-control version                                          # your current registry

# Reinstall straight from the canonical registry
npm i -g @brightliu/ai-control@latest --registry=https://registry.npmjs.org
```

</details>

## Language: the CLI speaks Chinese (for now)

**Know this before you install.** ai-control's rules, templates and CLI messages are written in Chinese. A fresh install gives you Chinese terminal output:

```text
$ ai init
INIT_OK：已安装（stack=java）。日常命令: ai new / check / confirm / test / ship
         installed (stack=java). Daily commands: ai new / check / confirm / test / ship
```

What this does **not** affect:

- **Command names, flags and exit codes** — `ai init`, `--lite`, `--attested`, exit `0` / `1` / `2` are all language-independent.
- **The machine contract**: single-line uppercase markers (`INIT_OK`, `CHECK_PASSED`, `TEST_PASSED`, `SHIP_GATES_PASSED`, `DOCTOR_OK`) and `[FAIL]` lines are stable and never translated.
- **Your own workflow** — the rules constrain what the AI *does*; your assistant still talks to you in whatever language you use.

Throughout this README, terminal blocks are copied verbatim from real runs — Chinese included — with English glosses rather than substituted text, because showing you what it actually looks like beats showing you a translation. CLI message i18n (`ai init --lang en`, English templates) is designed but **not implemented yet**.

## Before / after

```text
❌ Without it
You: add an order export feature
AI:  Sure! (invents a status=5 enum, quietly alters the schema, then reports "all tests pass")
You: …and it blows up in production.

✅ With it
You: add an order export feature
AI:  I read the code first. This needs to touch the t_order table, so it's a high-risk change.
     Here's the proposal: what changes, which files, which table, and these 4 test cases as
     acceptance criteria. Approve?
You: approved
AI:  (implements → runs tests) All 4 test cases green in the report, ai ship gates passed.
     Rollback SQL for the schema change is here.
```

You only ever do two things: **approve the change proposal, approve the database change.** Everything else — whether test cases cover the requirements, whether a report exists, whether anything failed, whether secrets leaked into the diff — is checked by built-in gates that read the raw output of your test framework. For the AI to fake that, it would have to forge report files, which costs far more and is far easier to catch.

> That dialogue isn't made up: the full transcript (real command output + step-by-step animation) is under [A real requirement, start to finish](#a-real-requirement-start-to-finish-export-orders-to-csv) below.

## 3-minute quickstart

```bash
# 1. Install the tool (once)
npm install -g @brightliu/ai-control
# Fallback when the npm registry is unreachable: npm install -g github:BrightLiu4917/ai-control
# Got "command not found" or an old version? See the troubleshooting block in Install above.

# 2. Install into your project
cd your-project
ai init                  # auto-detects the stack; or force it: --stack java|go|php|vue|react|node|mixed
ai sync                  # writes hook configs for all six AI tools, each in its own format

# 3. Get to work — pick either mode
```

**Mode A (recommended): talk to the AI tool in plain language.** State your requirement; the AI runs the five commands below itself and drafts the change proposal for you — you only nod at the approval point. Mode B is the manual entry point to the exact same flow; mix them freely.

**Mode B: terminal commands.** Five of them:

| Command | What it does | Plain-language gloss |
|---|---|---|
| `ai new <name>` | Scaffolds a change proposal (a requirements doc + an acceptance-criteria doc; the AI fills them in, you approve) | "I'm starting work" (add `--lite` for small stuff) |
| `ai check <name>` | Checks whether the proposal is complete | "Is this ready to show the user?" |
| `ai confirm <name>` | Records the approval (who, when, which commit, **the proposal's content hash, and the confirmation source**). In a terminal you type it yourself; in a GUI/app you reply "approved" and the AI records it with `--attested` (the record states its source honestly) | "I approve" (prerequisite for `ship`) |
| `ai test <name>` | Runs your project's own tests; reports are stored isolated per change | "Run the tests" |
| `ai ship <name>` | Cross-checks the test report: approved or not, report fresh or not, all green or not | "Can we ship?" (takes a second) |

## The full flow (one diagram)

```text
                              You describe a requirement to the AI
                                           │
                          AI reads the code first, then sizes the job
                                           │
      ┌──────────────────┬──────────────────┴─────────┬────────────────────────┐
      ▼                  ▼                            ▼                        ▼
  【typo-level】     【small — lite】             【normal】             【touches the DB】
  comments/docs      copy, styling               new feature,           add column, create
  typos              only                        changing an API        table, migration
      │                  │                            │                        │
   just fix it       AI scaffolds a              AI scaffolds a          Same flow plus one:
   no process        change proposal             change proposal         AI proposes the schema
      │              (2 files)                   (3 files)               → you nod → it hands
      │                  │                            │                  over a change pack
      │                  └──────────────┬─────────────┘                  (SQL + rollback)
      │                                 ▼                                 → you nod again before
      │              ①【approval point】read the proposal:                  anything executes
      │                 what changes, which files,                                  │
      │                 which test cases are the acceptance criteria                │
      │                                 │                                           │
      │              You say "approved", then either path:                          │
      │        ai confirm <name>   or   ai confirm <name> --attested  ◄─────────────┘
      │        (record: who, when, commit, proposal hash, source cli / ai-attested)
      │                                 │
      │                        AI starts writing code
      │           (before approval, the hook blocks its very first line of app code)
      │                                 │
      │                        ai test <name>
      │           (runs your tests; reports isolated per change)
      │                                 │
      │                        ai ship <name>
      │       ┌─────────── four automatic checks, in a second ───────────┐
      │       │ ① approved? was the proposal edited after approval?     │
      │       │ ② does a test report exist? was it produced this time?  │
      │       │ ③ did anything fail?                                    │
      │       │ ④ does every test case have a passing record?           │
      │       └────────┬─────────────────────────┬──────────────────────┘
      │             all pass ✅              one fails ❌
      ▼                │                         │
     done              ▼                         ▼
              ship (rollback SQL if the DB       AI goes back, fixes it,
              was touched)                       re-runs ship
```

You only ever do three things: **state the requirement → read the proposal and approve → wait for the result** (type `ai confirm` in a terminal; reply "approved" in a GUI/app). Work is routed by size:

| Size | Example | Process | Your time |
|---|---|---|---|
| Trivial | typo, comment | none, just fix it | 0 |
| Small | copy, styling | lite: 2 files, one glance to approve | ~30 seconds |
| Medium | new feature, API change | full: 3 files + automated tests | 2–5 minutes |
| Large | database change | full + two DB approvals + optional independent review | 5–10 minutes |

What if the AI starts as a "small change" and discovers mid-way that it needs a table or an API? The gate blocks it and forces an upgrade to the full flow — **the fast lane is not an escape hatch**.

## A real requirement, start to finish: "export orders to CSV"

Every command output below is from a real run (demo project `order-center`, Java / Spring Boot + Vue). **The full transcript of seven gate interceptions is at the end of this section** (click to expand); an animated, step-by-step version is on the [live demo page](https://brightliu4917.github.io/ai-control/demo.html).

**The requirement**: finance reconciles monthly and needs to export orders by customer and date range. Today they page through the list view manually, 20 rows at a time.

**① The AI reads code first, not writes it.** Impact analysis: touches `OrderController` / `OrderService` / `OrderMapper.xml` / `OrderListView.vue`, adds `GET /api/orders/export`, and requires a composite index `idx_tenant_created` on `t_order` → by the classification rules this is a **full-flow change with two-stage database confirmation**.

**② `ai new order-export-csv` scaffolds it** (proposal + test-cases + specs). The scaffold ships with four questions that must be answered; here's what happens if the AI tries to skip them and go for approval:

```text
$ ai check order-export-csv
[FAIL] 待确认问题未答（proposal.md）: 访问控制：本功能的权限要求是什么？
[FAIL] 待确认问题未答（proposal.md）: 数据表：涉及哪些表/字段/索引？（涉及则必须走数据库两阶段确认）
[FAIL] 待确认问题未答（proposal.md）: API 契约：路径、请求、响应、分页、错误码？（遵循 rules/20-api.md）
[FAIL] 待确认问题未答（proposal.md）: 验收标准：最小可验证路径、失败路径、越权场景分别是什么？
[FAIL] check 未通过（4 项）
```
> `[FAIL] open questions unanswered (proposal.md): <question>` … `[FAIL] check failed (4 items)`
> The gate only inspects bullet lines inside the `## 待确认问题` section, treating anything without "confirmed / resolved / none pending" as unanswered. **No approval sheet is issued while questions remain** — there is no way around it except actually answering them.

**③ Once filled in, check passes and the AI hands over the approval sheet**: level, classification rationale, what changes, non-goals, impact scope (files / tables / APIs / pages), and 5 acceptance cases (TC-01 happy path · TC-02 error path · TC-03 boundary · TC-04 permissions · TC-05 empty state).

**④ Confirmation is recorded** — type it yourself in a terminal (`source: cli`); or reply "approved" in a GUI/app and the AI records it with `--attested` (`source: ai-attested`):

```text
$ ai confirm order-export-csv
CONFIRM_OK：已留痕（by=liuweiliang）。开始实现；proposal/test-cases 再改动需重新确认。

$ ai confirm order-export-csv --attested      # you already agreed in the chat; AI records it
CONFIRM_OK：已留痕（by=liuweiliang）。开始实现；proposal/test-cases 再改动需重新确认。
来源：ai-attested（AI 代记）——留痕据此标注，门禁强度不变。
```
> `CONFIRM_OK: recorded (by=liuweiliang). Proceed; any further edit to proposal/test-cases requires re-confirmation.`
> `Source: ai-attested (recorded by the AI) — the record says so; gate strength is unchanged.`

**⑤ Two-stage database confirmation**: first the index design (why `(tenant_id, created_at, customer_id)`), then the change pack — target DDL, rollback SQL, and what else it touches, together:

```sql
-- V20260917__idx_order_tenant_created.sql
CREATE INDEX idx_tenant_created ON t_order (tenant_id, created_at, customer_id);
-- rollback: DROP INDEX idx_tenant_created ON t_order;
```

**⑥ Implement → test → ship**:

```text
$ ai test order-export-csv
==> mvn test
[INFO] Running com.example.order.OrderExportServiceTest
[INFO] Tests run: 4, Failures: 0, Errors: 0, Skipped: 0
已把 1 份新报告收入 test-results/order-export-csv/（按变更隔离）
TEST_PASSED（JUnit 报告即验收证据，ai ship 时核对）

$ ai ship order-export-csv
确认来源：cli（用户本人敲的）
EVIDENCE_OK：报告 1 份，非手动用例 4 条全部有通过记录。
提示：本变更涉及数据库，建议在新会话用 .ai/templates/review-prompt.md 做一次独立审查。
SHIP_GATES_PASSED：门禁全部通过（已写入 shipped.json）。
```
> `1 new report filed under test-results/order-export-csv/ (isolated per change)`
> `TEST_PASSED (the JUnit report is the acceptance evidence; ai ship verifies it)`
> `Confirmation source: cli (you typed it yourself)`
> `EVIDENCE_OK: 1 report, all 4 non-manual cases have passing records.`
> `Note: this change touches the database — consider an independent review in a fresh session using .ai/templates/review-prompt.md.`
> `SHIP_GATES_PASSED: all gates passed (written to shipped.json).`

**You did exactly two things in this requirement**: glanced at the approval sheet and said "approved" (about 2 minutes), and nodded twice for the database (about 3 minutes). Whether test cases cover enough, whether reports exist, whether anything failed, whether secrets leaked — commands checked all of it.

**The seven things the gates actually blocked, plus one soft check** (all real output):

<details>
<summary><b>Click to expand every full output</b></summary>

**① Trying to get approval with an incomplete proposal** — `ai check order-export-csv`

```text
[FAIL] 待确认问题未答（proposal.md）: 访问控制：本功能的权限要求是什么？
[FAIL] 待确认问题未答（proposal.md）: 数据表：涉及哪些表/字段/索引？（涉及则必须走数据库两阶段确认）
[FAIL] 待确认问题未答（proposal.md）: API 契约：路径、请求、响应、分页、错误码？（遵循 rules/20-api.md）
[FAIL] 待确认问题未答（proposal.md）: 验收标准：最小可验证路径、失败路径、越权场景分别是什么？
[FAIL] check 未通过（4 项）
```
> The gate only counts bullet items inside the `## 待确认问题` section; any item without "confirmed / resolved / none pending" counts as unanswered. **No approval sheet while questions remain** — the only way through is to actually answer them.

**② Trying to ship without approval** — `ai ship order-export-csv`

```text
[FAIL] 变更未确认：向用户输出确认单。终端里由用户敲 ai confirm order-export-csv；GUI/app 场景可让用户在对话里回一句同意，再代记 ai confirm order-export-csv --attested
```
> *Change not confirmed: present the approval sheet to the user. In a terminal the user types `ai confirm <id>`; in a GUI/app the user can agree in chat and you record it with `--attested`.*

**③ Editing the proposal after approval** — `ai ship order-export-csv`

```text
[FAIL] 确认已过期：proposal/test-cases/specs 在确认后被修改；重新向用户确认并运行 ai confirm order-export-csv
```
> *Confirmation expired: proposal/test-cases/specs were modified after approval; re-confirm with the user and run `ai confirm <id>`.*
>
> The check uses a **content hash**, not a file timestamp. Change one character and the approval is void, so you get asked again — this closes off "get approval first, quietly widen the scope afterwards". (Timestamps would falsely invalidate every approval after a `git clone` or on another machine, which is unusable for teams.)

**④ Passing off an old report as new** — `ai ship order-export-csv`

```text
[FAIL] 测试报告早于本变更的确认时间——疑似旧报告；重跑 ai test 后再 ship
```
> *Test report predates this change's approval — likely a stale report; re-run `ai test` before shipping.*
>
> Leftovers from a previous iteration or another change don't count as evidence here. The AI saying "I tested it" does nothing; the report has to have been produced after this approval.

**⑤ Sneaking an API change into a lite change** — `ai check list-empty-hint`

```text
[FAIL] lite 变更不允许涉及 API 契约；运行 ai new list-empty-hint --upgrade 升级为完整流程（保留已写内容）
[FAIL] 涉及数据库/API 的变更必须至少 1 条非手动（自动化）用例——发布门禁凭 JUnit 报告验收，全手动会让证据链失效
[FAIL] check 未通过（2 项）
```
> *A lite change may not touch the API contract; run `ai new list-empty-hint --upgrade` to escalate to the full flow (existing content is kept).*
> *Changes touching the database/API need at least one non-manual (automated) test case — the release gate verifies JUnit reports, and an all-manual suite breaks the evidence chain.*
>
> `--upgrade` drops the lite marker and adds the spec while **keeping everything already written** — the fast lane is not an escape hatch.

**⑥ The AI impersonating your confirmation** (the hook stops its hand; effective in all six tools once hooks are installed)

```text
$ ai confirm order-export-csv          ← issued by the AI, without --attested
[ai-control] 已拦截：不带 --attested 的 ai confirm 表示「用户本人在终端敲的」，AI 不得冒充。
  · 若用户已在对话里明确同意 → 改用：ai confirm order-export-csv --attested（留痕标注 source: ai-attested）
  · 若还没确认 → 向用户输出确认单，把这条交给用户自己敲：ai confirm order-export-csv
```
> *Blocked: an `ai confirm` without `--attested` means "typed by the user in a terminal" — the AI must not impersonate that. If the user already agreed in chat → use `--attested` (the record will say `source: ai-attested`). If they haven't approved yet → present the approval sheet and hand this command to the user.*
>
> The block message **echoes back the real change name**, so the AI can only relay the exact command — no hand-waving.

**⑦ The AI hand-writing the confirmation record** (the second forgery path, also blocked)

```text
$ Write .ai/changes/order-export-csv/confirmed.json
[ai-control] 已拦截：.ai/changes/order-export-csv/confirmed.json 是确认/交付留痕，只能由 ai confirm / ai ship 生成。它记录"谁在什么时间确认了哪个版本的变更单"——手写它等于伪造用户确认。
```
> *Blocked: this file is the approval/delivery record and may only be produced by `ai confirm` / `ai ship`. It records who approved which version of the proposal and when — hand-writing it is forging user approval.*
>
> Blocking impersonated *commands* isn't enough: `.ai/` as a whole is on the write allow-list (it holds rules, templates and config), so the AI could otherwise skip the command and **write a record directly**, declaring `source: "cli"`. So the record files are carved out as an explicit exception.

**⑧ Soft check: declared scope vs. actual diff** (deliberately **not** blocked, only reported)

```text
$ ai ship order-export-csv
确认来源：cli（用户本人敲的）
EVIDENCE_OK：报告 1 份，非手动用例 4 条全部有通过记录。
注意：以下改动未在影响范围声明（软核验，不拦截）：
  ? src/main/java/com/example/order/dto/OrderExportRow.java
  ? src/main/java/com/example/order/mapper/OrderMapper.java
SHIP_GATES_PASSED：门禁全部通过（已写入 shipped.json）。
```
> *Note: the following changes were not declared in the impact scope (soft check, not blocked):*
>
> Hard-blocking this would create an annoying loop — edit a file → update the declaration → approval expires → re-approve. So it just lists them for you and the independent review to look at.

</details>

## How it keeps the AI in check (three layers, soft to hard)

1. **Rules** (`AGENTS.md` + `.ai/rules/`): a 63-line contract active in every conversation, plus 20 Chinese engineering rule files loaded on demand — no inventing columns, every SQL statement needs a `WHERE`, enums must be `code` + `desc` (no magic values), never paginate after joining… **These are concrete rules distilled from production incidents, not "please write good code" platitudes.**
2. **Approval points** (two places where you must nod): the AI may not write code before the proposal is approved — once you approve, `ai confirm` records the approver / time / commit / proposal content hash / **confirmation source** (`cli` you typed it · `ai-attested` the AI recorded it), and any later edit to the proposal voids it; the AI may not execute SQL before the database change is approved.
   > An honest note on this layer: **"only the user may type it" cannot be enforced locally** — the AI has shell access, so a determined bypass (disabling hooks, for instance) is always possible. What the hooks do close off are the two forgery paths: **impersonating your command** (an `ai confirm` without `--attested`) is blocked, and **hand-writing `confirmed.json`** is blocked. For the flow to move forward the AI has to use `--attested` and record honestly, which writes `ai-attested` into the record — visible at a glance in `ai ship` / `ai doctor`. **Gate strength does not depend on the source** (`ship` judges all sources alike); the only difference is honesty.
3. **Automated checks** (built into `check` / `confirm` / `ship`): declaring a table change but trying to take the fast lane? Blocked. Touching tables/APIs with only manual test cases? Blocked. Shipping unapproved, or editing the proposal after approval? Blocked. Test report missing, failing, or older than the approval (stale report passed off as new)? Blocked. (Database confirmation belongs to layer 2 — a contract that makes the AI stop and wait; `ship` merely suggests an independent review, it isn't a mechanical block.)

## Supported AI tools

One `ai sync` gives **all six tools mechanical interception**. Their PreToolUse hook protocols interoperate (stdin receives `tool_input`, `exit 2` blocks and returns the reason to the model), so they all install **the same guard scripts** — only the config file format differs:

| Tool | What `ai sync` writes | Interception | Session banner |
|---|---|---|---|
| Claude Code | `.claude/settings.json` · `CLAUDE.md` · `.claude/agents` · `.claude/skills` | ✅ | ✅ |
| WorkBuddy | `.workbuddy/settings.json` · `.workbuddy/skills/` | ✅ | ✅ |
| Codex | `.codex/hooks.json` | ✅ | ✅ |
| Qoder | `.qoder/settings.json` | ✅ | ✅ |
| Trae | `.trae/hooks.json` | ✅ | — |
| Cursor | `.cursor/hooks.json` | ✅ | — |

(Trae / Cursor don't get the session banner yet: their SessionStart output contract is unverified, and we won't risk stuffing JSON into the context as plain text. Want only some of them? `ai sync --tools=claude,codex`.)

With hooks installed, these are stopped **at the moment of action**, not flagged afterwards: writing app code for an unapproved change, writing files outside the declared scope, dangerous SQL (`DROP` / `TRUNCATE` / `DELETE` without `WHERE`), impersonating your `ai confirm`, and hand-writing `confirmed.json`.

**Each tool has its own activation step**:

| Tool | What you do after installing |
|---|---|
| Claude Code | Start a new session |
| WorkBuddy | **Quit fully with Cmd+Q** (closing the window is not enough — config is cached at startup) |
| Codex | Enable `[features] codex_hooks = true` in `config.toml`, and trust the project's hooks in `/hooks` |
| Trae / Qoder / Cursor | Reopen the IDE or start a new session |

Mixed-language projects (e.g. Java backend + Vue frontend) need one install: the AI picks the rules matching the files it touches, and the test command is configured as a single chained command in `.ai/config.json`. All six tools read `AGENTS.md` natively, so the rule layer doesn't depend on hooks.

**Confirmation works in every tool** — two paths with identical gate strength (`ai ship` judges them the same); only the record differs:

| Where you are | How you confirm | Recorded as |
|---|---|---|
| Terminal | type `ai confirm <id>` yourself | `source: "cli"` |
| Any AI tool | reply "approved"; the AI records `ai confirm <id> --attested` | `source: "ai-attested"` |

And "impersonating you" (an `ai confirm` without `--attested`) is **blocked on the spot in all six tools**, echoing the real change name for you to copy.

Existing projects upgrading to this version: run `ai sync --force` once to get hooks for all six tools.

## What your project looks like

```text
your-project/
├── AGENTS.md            the contract — read automatically by all six AI tools
├── .ai/                 rule library, role manuals + changes/ (one folder per requirement)
└── tool configs (generated by ai sync; commit them so the team shares them)
    ├── .claude/         Claude Code: hooks + subagents + skills (plus a CLAUDE.md entry point)
    ├── .workbuddy/      WorkBuddy: hook config + project-level skills
    └── .codex/  .qoder/  .trae/  .cursor/    one hook config each
```

An existing `AGENTS.md` is never overwritten; upgrade with `ai init --update` (framework files only, automatically backed up first, and your change records are never touched).

## How you know it's actually being used

Three layers, all local, all offline, all switchable.

**1. A one-line banner on every command** (there from the start) — version, the command you just ran, and your machine's cumulative call count:

```text
◆ bright-ai-coding · ai-control v2.3.0 · ai ship · 本机第 37 次
                                              (#37 on this machine)
```

In a terminal it's coloured; when a script, CI job or AI tool invokes it, the banner automatically moves to **stderr**, so stdout's machine contract stays clean. Turn it off with `AI_CONTROL_QUIET=1` or `"banner": "off"` in the project's `.ai/config.json`.

**2. A check-in on every new session.** `ai sync` installs a `SessionStart` hook: opening a new session (also after `/clear`, resume, or compaction) prints one banner line and injects "which changes are in progress in this project" into the context — so the AI knows it's in a governed project without you saying anything. Installed for Claude Code, WorkBuddy, Codex and Qoder.

```text
◆ bright-ai-coding · ai-control v2.3.0 · 本项目受管控 · 进行中变更 1 个（list-empty-hint）
                                          governed project · 1 change in progress
```

Trae / Cursor don't show this line (their SessionStart output contract is unverified, so it isn't installed; Kimi only reads `AGENTS.md`) — but the flow is unaffected: their **interception hooks are installed**, and they must call `ai check / test / ship` to advance, which lands in the ledger too.

**3. `ai stats`: turning the ledger into answers.**

```text
◆ bright-ai-coding · ai-control v2.3.0 · ai stats

本机使用记录（只在 ~/.ai-control/usage.jsonl，不联网、不上报；AI_CONTROL_USAGE=off 可关）
  首次使用  2026-09-16 14:06（累计 128 次，最近 7 天 41 次）
  非零退出  9 次（门禁拦截或失败；最近 7 天 3 次）
  最近一次  2026-09-17 14:37

  按命令    ai ship 32 · ai test 28 · ai new 24 · ai check 21 · ai confirm 18 · ai sync 2
  按项目    order-center 76 · bright-xtl 31 · flu 21

  最近
    09-17 14:37  ai sync   -                  ✓         order-center
    09-17 14:25  ai ship   order-export-csv   ✓         order-center
    09-17 14:13  ai ship   order-export-csv   ✗ exit=2  order-center

本项目（order-center）
  变更      进行中 1 个 · 已交付 1 个
  钩子拦截  1 次（最近 2026-09-17 14:37）——AI 想越界被当场按住

说明：这里统计的是 ai 命令被调用的次数与结果，不统计 AI 工具内部的每一次工具调用（那属于工具自己的日志）。
```
> *Local usage record (only in `~/.ai-control/usage.jsonl`, no network, no telemetry; disable with `AI_CONTROL_USAGE=off`)*
> *First use 2026-09-16 14:06 (128 calls total, 41 in the last 7 days) · 9 non-zero exits (gate blocks or failures; 3 in the last 7 days) · last run 2026-09-17 14:37*
> *By command: … · By project: …*
> *This project (order-center) — changes: 1 in progress · 1 shipped · hook interceptions: 1 (last 2026-09-17 14:37) — the AI tried to step out of bounds and was stopped on the spot.*
> *Note: this counts how often ai commands were invoked and how they exited — not every tool call inside your AI assistant (that's the assistant's own log).*

**The "hook interceptions" number is the most telling one.** It counts how often the AI tried to step out of bounds and was stopped on the spot — writing app code without approval, writing files outside the declared scope, dangerous SQL, running `ai confirm` without `--attested`, hand-writing `confirmed.json` — recorded in the project's `.ai/interceptions.jsonl` (already in `.gitignore`, never committed). **All six hooked tools report into it.** Call counts say "someone ran this"; interception counts say "it actually stopped something".

`ai doctor` also reports usage, interception counts, and "how many versions the framework files in your project lag behind the CLI" (upgrade with `ai init --update`).

Privacy and opt-out: the log is written to `~/.ai-control/usage.jsonl` on your machine only — **no code content is collected and no network request is ever made**; past 1 MB only the most recent 2000 entries are kept. `AI_CONTROL_QUIET=1` turns off just the banner; `AI_CONTROL_USAGE=off` (or `"usage": "off"` in the project's `.ai/config.json`) turns off recording as well.

## Want a second opinion on high-risk changes?

When `ai ship` detects database / payment / state-machine work, it suggests: start a fresh AI session and use `.ai/templates/review-prompt.md` plus the git diff to get an independent review (the reviewer must not be the session that wrote the code). Zero configuration, zero API cost.

## FAQ

**Q: Do I need this process for a typo fix?**
No. Pure docs/comments/typos are edited directly; small features use `--lite` (two files, 30-second approval); only database, API, and permission changes take the full flow. Control scales with risk.

**Q: What if the AI ignores the rules?**
Say "follow the ai-control flow" and it snaps back. Three boundaries, stated honestly: ① the AI could in principle forge report files — the gate turns "lying with words" into "leaving forged evidence behind", which is a different order of cost and exposure; ② the gate verifies *that a passing test with a given name exists*, not that the test is any good (an empty test is invisible to it) — that's what the independent review for high-risk changes is for; ③ the whole flow is started by the AI, so if it never enters the flow, only the contract text governs it — which is why the contract is loaded automatically into every conversation, so one sentence from you pulls it back.

**Q: What test report format?**
JUnit XML — `ai test` handles it per stack automatically: Maven has it built in; Go output is converted to a report (zero config, no gotestsum needed); Vitest gets the built-in junit reporter injected; PHPUnit gets `--log-junit` added; only Jest needs `npm i -D jest-junit` (it will tell you). Put the test case ID in the test method name (e.g. `test_TC01_xxx`) and it can be matched. Running several changes in parallel? Reports under `test-results/<change-name>/` stay isolated. Reports must be newer than the approval — a stale report passed off as new is blocked.

## Called by scripts / agents? Here's the machine contract

All commands follow one convention, so nothing needs to parse human prose: **exit codes** 0 = passed, 1 = usage or environment error, 2 = blocked by a gate; **result signals** are fixed single-line uppercase markers in the output: `CHECK_PASSED` / `CONFIRM_OK` / `TEST_PASSED` / `SHIP_GATES_PASSED` / `DOCTOR_OK` (failures produce `[FAIL] …` lines plus a non-zero exit code). Both are stable interfaces and will not change when wording changes. The banner meant for humans (`◆ bright-ai-coding …`) goes to stderr when stdout isn't a TTY, so parsing stdout is always clean.

## For teams: put the gates on your PRs

Locally the gates run on your machine; for a team, add a GitHub Action so non-compliant PRs fail and can't be merged:

```yaml
# .github/workflows/ai-gates.yml
name: ai-gates
on: pull_request
jobs:
  gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: BrightLiu4917/ai-control@main          # contract gate (check)
      # For the evidence gate: run your tests first to produce JUnit reports, then add a step
      # - uses: BrightLiu4917/ai-control@main
      #   with: { mode: ship }
```

## Engineering quality

Zero runtime dependencies (needs only Node ≥18.17 + git); 33 end-to-end acceptance tests + 17 unit tests + a reference-integrity check on the rule library (no dangling references); hard code budgets enforced in CI (core ≤1500 lines, contract ≤100 lines, one usage doc + up to 3 README language variants), and exceeding them turns CI red — to keep the tool itself from bloating.

Its predecessor [ai-coding-fun](https://github.com/BrightLiu4917/ai-coding-fun) (v1) was rewritten from scratch after 15 batches of real-project iteration: 5000 lines of bash → 600 lines of JS, a five-document process → two, with the learning curve squeezed into one page — this README.
