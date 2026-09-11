# 测试规则

## 原则
- 优先验证用户可见行为和业务规则。
- 测试应保护关键路径，而不是只追求覆盖率数字。
- Bug 修复必须有复现或回归验证。
- 重构必须先有测试保护或明确人工验证步骤。
- 本地 Agent 执行必须优先使用统一测试入口，避免每个模型自行猜测验证命令。

## 测试类型
- 单元测试：纯逻辑、领域规则、转换函数。
- 集成测试：Service、Repository、Mapper、API。
- 契约测试：API 请求/响应兼容性。
- E2E 测试：核心用户路径。
- 视觉检查：UI 布局、多视口、状态展示。

## 禁止事项
- 禁止写只验证实现细节的脆弱测试。
- 禁止为了通过测试降低业务校验。
- 禁止删除失败测试而不说明原因。
- 禁止为了节省日志而不保存完整失败输出。
- 禁止把完整无关日志直接喂给模型；应先摘要再分析。

## 本地验证入口
目标项目应优先提供：

```bash
bash .ai/scripts/run-tests.sh
```

如果项目验证命令特殊，通过环境变量覆盖：

```bash
PROJECT_TEST_COMMAND='mvn test -DskipITs=false' bash .ai/scripts/run-tests.sh
```

需要持久保存时，写入目标项目本机配置：

```text
.agent/project.env
```

示例见 `templates/project.env.example`。

完整日志默认写入：

```text
.agent/logs/test.log
```

给 AI 助手、本地 Agent 或独立二审的失败信息应优先来自：

```bash
bash .ai/scripts/summarize-log.sh .agent/logs/test.log
```

## 输出要求
交付必须说明：
- 运行了哪些验证
- 没运行哪些验证及原因
- 剩余风险
