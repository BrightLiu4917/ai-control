# PHP 实现手册

必读规则：`.ai/rules/40-backend.md`、`.ai/rules/43-php.md`；涉及接口读 `20-api`。

## 实现规则

- Controller 只做参数接收、基础校验、调用 Service/Action 和返回统一响应。
- Service/Action 处理业务校验、权限、状态流、事务和缓存协调。
- Model/Repository 负责数据访问，禁止在 Controller 中拼 SQL。
- 涉及多表写入、状态变更、扣减、日志、订单、通知时必须使用事务。
- API 对外 ID 按字符串处理，避免前端长整型精度问题。
- 新增路由必须遵循 `.ai/rules/20-api.md`，只使用 `GET` / `POST`，禁止路径参数。
- 路径必须使用小写中横线，禁止驼峰、下划线和大写路径段。

## 禁止事项

- 禁止把 Java/Spring Boot 的包结构、注解或依赖规则套到 PHP 项目。
- 禁止在 Controller 中堆业务逻辑。
- 禁止 `SELECT *`。
- 禁止无关重构。
- 禁止伪实现、空方法和 TODO 实现。
- 禁止新增 `PUT`、`DELETE`、`PATCH` 接口。
- 禁止新增 `/xxx/{id}`、`/xxx/123` 这类路径参数接口。
