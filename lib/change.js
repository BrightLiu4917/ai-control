// ai new：建变更骨架（lite 两件套 / 完整三件；--upgrade 平滑升级保留内容）
const fs = require("fs");
const path = require("path");
const { requireProjectRoot, changeDir, die, exists, read, renderTemplate } = require("./core");

function writeIfAbsent(p, content) {
  if (exists(p)) {
    console.log(`已存在，跳过: ${p}`);
    return;
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  console.log(`[WRITE] ${p}`);
}

function cmdNew(args) {
  const id = args.find((a) => !a.startsWith("--"));
  if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) die("用法: ai new <change-id>（小写中横线）[--lite|--upgrade]");
  const root = requireProjectRoot();
  const dir = changeDir(root, id);
  const vars = { CHANGE_ID: id };

  const lite = args.includes("--lite");
  if (args.includes("--upgrade")) return upgrade(root, dir, id, vars);
  writeIfAbsent(path.join(dir, "proposal.md"), renderTemplate(lite ? "proposal-lite.md" : "proposal.md", vars));
  let casesTpl = renderTemplate("test-cases.md", vars);
  if (lite) casesTpl = casesTpl.replace("| 单测 |", "| 手动 |"); // lite 常态是无自动化测试的小改动
  writeIfAbsent(path.join(dir, "test-cases.md"), casesTpl);
  if (!lite) {
    writeIfAbsent(path.join(dir, "specs", id, "spec.md"), renderTemplate("spec.md", vars));
  }

  console.log("");
  console.log("复制给 AI 助手：");
  console.log(`请读取 openspec/changes/${id}${lite ? "（lite 变更）" : ""}。`);
  if (lite) {
    console.log("补全需求说明、影响文件和验收用例，答掉待确认问题。");
    console.log(`本变更不涉及数据库和 API 契约；如发现需要涉及，停止并运行 ai new ${id} --upgrade 升级（保留已写内容），升级后重新请求确认。`);
  } else {
    console.log("先做影响探测（检索代码列出触碰的文件/表/接口），据此补全影响范围、规格场景和验收用例，答掉待确认问题。");
    console.log("涉及数据库先走数据库工程师两阶段确认（.ai/agents/agent-dba.md）；涉及跨模块/接口兼容按模板补建 design.md。");
  }
  console.log("不要直接写代码；确认单需标注级别与判级理由，等用户确认。");
}

function upgrade(root, dir, id, vars) {
  if (!exists(dir)) die(`change 不存在，无法升级: ${id}`);
  const proposalPath = path.join(dir, "proposal.md");
  if (exists(proposalPath)) {
    const s = read(proposalPath);
    if (/^变更级别:\s*lite\s*\n?/m.test(s)) {
      fs.writeFileSync(proposalPath, s.replace(/^变更级别:\s*lite\s*\n?/m, ""));
      console.log("已移除 lite 标记。");
    }
  }
  writeIfAbsent(path.join(dir, "specs", id, "spec.md"), renderTemplate("spec.md", vars));
  console.log("已升级为完整流程：既有 proposal/test-cases 全部保留。");
  console.log("注意：影响范围已变化，必须重新经用户确认；涉及数据库先走两阶段确认。");
}

module.exports = { cmdNew };
