# Java / Spring Boot 实现手册

必读规则：`.ai/rules/40-backend.md`、`.ai/rules/41-spring-boot.md`、`.ai/rules/44-java-enum.md`；涉及接口读 `20-api`，涉及登录读 `21-jwt`，涉及后台权限读 `22-rbac`。

## 编码前

1. 定位既有包结构。
2. 定位统一响应类。
3. 定位全局异常类。
4. 定位 Mapper/XML 风格。
5. 定位 DTO/VO 命名方式。
6. 定位认证、租户、权限、软删除和分页实现。
7. 定位既有 BaseController、BaseService、转换器、枚举和审计字段。
8. 检查 `pom.xml` 是否具备本次功能需要的 Spring Boot 分级依赖；缺失且本次功能需要时，必须列入实施计划并补齐，禁止无脑补齐全部依赖。
9. 如果字段、状态、权限、租户、删除、通知、时间冲突、支付或响应格式不清楚，必须询问。

## 时间类型

- Java 内部时间字段优先统一使用 `java.time.LocalDateTime`，包括 Entity、DTO、VO、查询对象和审计字段。
- MySQL `datetime`、`timestamp`、`date`、`time` 字段默认映射为 `LocalDateTime`；如目标项目已有更细约定，必须跟随目标项目。
- 禁止使用 `java.util.Date`、`java.sql.Timestamp` 作为新增业务字段类型，除非目标项目既有框架、第三方 SDK 或兼容性要求明确需要。
- 对外 API 的时间字符串格式、时区和是否带偏移量必须以 OpenSpec、API 契约或目标项目统一 Jackson 配置为准；不清楚时必须询问，禁止自行决定格式。
- 跨时区、日历日期、时间段冲突、预约、支付有效期、套餐扣减、审计追踪等对时间语义敏感的场景，必须先确认业务时区、边界包含关系和持久化规则。

## 精准修改、代码精简与无效代码清理

通用规则见 `.ai/rules/01-code-change.md`，必须逐项遵守。Java 栈补充：

- 即使 IDE 显示 `0 usages` 也不能直接删除：Controller、Entity、DTO、VO、Mapper、XML、枚举、状态类、Spring Bean、配置类、注解类、拦截器、过滤器、监听器、定时任务、权限码、错误码和序列化字段。
- 抽出的函数名必须表达业务意图或明确副作用，例如创建、更新、发送、扣减、记录。
- 删除 Java 类、方法、DTO、VO、Mapper、XML 后必须运行后端编译和相关测试，无法验证时说明残留风险。

## 实现规则

- Controller 只做参数接收、基础校验、调用 Service 和返回统一响应。
- Service/ServiceImpl 处理业务校验、权限、状态流、事务、缓存协调和通知触发。
- Mapper 只定义持久化方法，XML 写显式 SQL。
- 涉及多表写入、状态变更、扣减、日志、订单、通知时使用 `@Transactional`。
- 单个业务动作写入或修改超过一张表时，必须使用 `@Transactional`。
- DTO/VO 与 Entity 分离；除非项目既有约定允许，禁止直接返回 Entity。
- 查询条件、分页、排序、租户、软删除和权限条件必须清晰可测试。
- 数据库可以保留 `pk_id`，但对外 API、DTO、VO 和前端统一使用 `id`。
- 前端长整型 ID 必须按字符串处理，后端内部校验后再转换为 `Long`。
- `id` 非法返回参数错误，数据不存在返回业务不存在，禁止变成 500。
- 新增 Controller 路径必须遵循 `.ai/rules/20-api.md`，只使用 `GET` / `POST`，禁止 `@PathVariable` 路径参数。
- 路径必须使用小写中横线，禁止驼峰、下划线和大写路径段。

## 枚举与常量

完整规则见 `.ai/rules/44-java-enum.md`，必须逐项遵守。执行要点：

- 业务判断禁止裸数字/裸字符串（禁止 `status == 1`、`"PAID".equals(x)`），只允许通过枚举比较。
- 出参状态必须同时返回 code + desc，desc 一律取自枚举，禁止在代码里硬拼状态文案。
- 入参 code 必须 `fromCode()` 校验，非法值返回参数错误；禁止透传入库。
- 禁止 `ordinal()` 入库/传输；枚举 `switch` 必须全分支覆盖或 default 抛异常。

## 禁止事项

- 除非既有项目已经使用 JPA，否则禁止引入 JPA。
- 禁止在 Controller 中写业务逻辑。
- 禁止在 Service 中拼接 SQL 字符串。
- 禁止 `SELECT *`。
- 禁止魔法值判断、硬拼状态文案和未经校验的枚举 code 透传（见枚举与常量章节）。
- 禁止无关重构。
- 禁止伪实现、空方法和 TODO 实现。
- 禁止直接返回 Entity，除非项目既有约定允许。
- 禁止吞异常或向前端暴露堆栈。
- 禁止对外暴露 `pk_id`、`pkId`、`pk_id_list` 或 `pkIdList`。
- 禁止让前端把长整型 ID 转成 `Number`。
- 禁止新增 `PUT`、`DELETE`、`PATCH` 接口。
- 禁止新增 `/xxx/{id}`、`/xxx/123` 这类路径参数接口。
