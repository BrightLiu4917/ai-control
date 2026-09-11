# Spring Boot 规则

## 技术栈基线
- Java 17+
- Spring Boot 3/4，目标项目如已确定版本，必须跟随目标项目。
- Web MVC 接口默认使用 `spring-boot-starter-web`。
- DTO 参数校验必须使用 `spring-boot-starter-validation`。
- CRUD 脚手架生成物依赖 MyBatis、MyBatis-Plus、MyBatis XML、PageHelper、Lombok 和 MySQL 8。
- JWT 退出吊销黑名单依赖 Redis。
- 本服务建设 RBAC 或审计切面时才需要 `spring-boot-starter-aspectj`；如果访问控制由外部系统负责，不得为了 RBAC 无脑引入。
- OpenAPI/Swagger UI 使用 `springdoc-openapi-starter-webmvc-ui`。
- 数据库迁移使用 Flyway。

## Maven 依赖分级

Spring Boot 项目不得无脑补齐所有依赖。必须先判断本次功能是否需要，再在实施计划中列出“新增依赖原因”和“目标项目是否已有等价能力”。

### 必须依赖

只有当目标项目确认为 Spring Boot Web 后端时，才要求具备以下基础能力。

| 依赖 | 用途 |
|------|------|
| `spring-boot-starter-web` | Web MVC 接口开发，优先按目标项目既有约定对齐 |
| `spring-boot-starter-validation` | DTO 参数校验，如 `@NotBlank`、`@Size` |
| `mybatis-spring-boot-starter` `3.0.4` | MyBatis Mapper/XML |
| `mysql-connector-j` | MySQL 8 驱动 |
| `lombok` | `@Data`、`@Slf4j` 等注解 |
| `pagehelper-spring-boot-starter` `2.1.1` | 分页 |

### 功能依赖

只有本次功能明确需要时才补充，禁止为了未来可能用到而提前引入。

| 依赖 | 触发场景 |
|------|----------|
| `spring-boot-starter-data-redis` | JWT 退出吊销黑名单、缓存、分布式锁或会话能力 |
| `spring-boot-starter-aspectj` | 本服务建设 RBAC 权限 AOP、审计切面或日志切面 |
| `springdoc-openapi-starter-webmvc-ui` `2.8.13` | OpenAPI/Swagger UI |
| `hutool-all` `5.8.38` | 通用工具类 |
| `flyway-core` | 数据库迁移 |
| `flyway-mysql` | Flyway MySQL 支持 |

### 脚手架依赖

只有使用本仓库通用 CRUD 脚手架生成物，且目标项目没有等价基础设施时才补充。

| 依赖 | 触发场景 |
|------|----------|
| `mybatis-plus-boot-starter` `3.5.5` | 适配 CRUD 脚手架生成物中的 `BaseMapper`、`ServiceImpl` 和 `@TableName` |

### 本地开发依赖

以下依赖只用于本地开发或测试，不应成为生产能力的隐式前提。

| 依赖 | 用途 |
|------|------|
| `spring-boot-devtools` | 本地开发热部署 |
| `spring-boot-starter-test` | Spring Boot 测试 |
| `mybatis-spring-boot-starter-test` `3.0.4` | MyBatis 测试支持 |
| `h2` | 测试环境内存数据库 |

推荐版本属性：

```xml
<java.version>17</java.version>
<mybatis-spring-boot.version>3.0.4</mybatis-spring-boot.version>
<mybatis-plus.version>3.5.5</mybatis-plus.version>
<pagehelper.version>2.1.1</pagehelper.version>
<springdoc.version>2.8.13</springdoc.version>
<hutool.version>5.8.38</hutool.version>
```

说明：`mybatis-plus-boot-starter` 不是所有 Spring Boot 项目的默认依赖；本控制系统只在使用通用 CRUD 脚手架且目标项目缺少等价基础设施时建议引入。如果目标项目已有等价基础设施，必须优先遵循目标项目约定。

## ID 对外暴露规则
- 数据库可以保留内部自增主键 `pk_id`。
- 对外 API 统一使用业务 ID 字段 `id`。
- 请求参数、DTO、VO、前端路由和前端状态中禁止使用 `pk_id`、`pkId`、`pk_id_list` 或 `pkIdList`。
- 前端必须把长整型 ID 当字符串处理，禁止 `Number(id)`、一元加号、隐式数值计算或 JSON 数字化。
- 后端可以在 Service 内部把 API 字符串 `id` 校验后转换为 `Long`。
- 批量接口对外使用 `idList: string[]`，后端内部再转换为 `List<Long>`。
- API 响应中的 `id` 必须序列化为字符串，避免 JavaScript 安全整数精度丢失。

## ID 异常规则
- `id` 为空、空白、非数字、非正数或超出 `Long` 范围时，返回参数错误。
- 根据 `id` 查询不到数据时，返回业务不存在。
- 禁止因为 `NumberFormatException`、空指针或查不到数据导致 500。
- 优先使用目标项目已有 `BusinessException`、`ErrorCode` 和全局异常处理。
- 不允许直接把数据库主键 `pk_id` 暴露给前端。

## DTO/VO 命名
- 创建请求：`XxxCreateReq`
- 更新请求：`XxxUpdateReq`
- 分页请求：`XxxPageReq`
- 响应对象：`XxxVO`

## 手写实现基线
当通用 codegen adapter 不可用、且用户确认允许 AI 手写 Spring Boot CRUD 或管理端接口时，必须达到以下标准：
- 先读取既有包结构、统一响应、分页对象、异常体系、权限注解、租户上下文、软删除规则和 Mapper/XML 风格。
- 优先复用项目已有 Base 类、工具类、转换器、枚举、校验器和查询对象。
- 新增抽象必须有明确职责，能减少真实重复或隔离变化点；禁止为了“看起来高级”而增加空壳层。
- DTO/VO 与 Entity 分离；除非项目既有约定允许，禁止直接返回 Entity。
- 查询、分页、排序、租户、软删除和权限条件必须清晰可定位。
- 写操作必须有事务边界判断；多表写入必须使用事务。
- XML 使用显式字段，禁止 `SELECT *`。
- 实现后必须补充测试或最小验证命令。

## 抽象设计
- Controller 是薄入口，不承载业务规则。
- Service 以业务动作建模，不把所有操作塞进一个机械 CRUD 大方法。
- 复杂条件构造可提取为私有方法、Query Builder 或项目既有条件对象，但不得引入新依赖。
- Entity、DTO、VO 转换应复用项目既有转换方式；没有既有方式时，优先简单显式映射。
- 枚举、状态流、访问控制方案、权限点、错误码必须来自已确认事实源。

## 事务
以下场景必须使用事务：
- 写入多张表
- 修改状态并写入日志
- 创建主记录和明细
- 扣减库存、余额、套餐次数
- 创建订单、支付、通知等联动数据

## 验证
后端变更必须优先运行项目既有验证命令。
无法运行时必须说明原因。
# Spring Boot 技术栈规则

## 适用范围

适用于 Java 17+、Spring Boot 3/4、Maven/Gradle、MyBatis 或 MyBatis-Plus 后端项目。

本文件是 Spring Boot 技术栈入口规则；详细实现约束以 `.ai/rules/41-spring-boot.md` 为准。

读取顺序：

1. 先读 `.ai/rules/41-spring-boot.md` 判断是否适用。
2. 再读 `.ai/rules/41-spring-boot.md` 获取依赖分级、ID、异常、事务和 DTO/VO 细则。
3. 最后按目标项目既有代码确认实际包结构、响应体、异常、分页、权限和 Mapper/XML 风格。

## 接入原则

- 优先读取目标项目已有包结构、统一响应、异常体系、分页对象、权限注解、租户上下文和 Mapper/XML 风格。
- 目标项目没有约定时，再使用本控制系统默认的 DTO/VO、ID、事务和依赖规则。
- Spring Boot 版本必须跟随目标项目；禁止为了脚手架强行升级。
- 依赖按“必须依赖、功能依赖、脚手架依赖、测试依赖”分级处理。

## 默认关注点

- Controller 薄入口。
- Service 承载业务动作和事务边界。
- Mapper/XML 显式字段，禁止 `SELECT *`。
- API 对外暴露 `id`，数据库内部可保留 `pk_id`。
- 长整型 ID 给前端时按字符串处理。
- 参数非法返回参数错误，数据不存在返回业务不存在。
# Spring Boot 技术栈规则

## 适用范围

适用于 Java 17+、Spring Boot 3/4、Maven/Gradle、MyBatis 或 MyBatis-Plus 后端项目。

本文件是 Spring Boot 技术栈入口规则；详细实现约束以 `.ai/rules/41-spring-boot.md` 为准。

读取顺序：

1. 先读 `.ai/rules/41-spring-boot.md` 判断是否适用。
2. 再读 `.ai/rules/41-spring-boot.md` 获取依赖分级、ID、异常、事务和 DTO/VO 细则。
3. 最后按目标项目既有代码确认实际包结构、响应体、异常、分页、权限和 Mapper/XML 风格。

## 接入原则

- 优先读取目标项目已有包结构、统一响应、异常体系、分页对象、权限注解、租户上下文和 Mapper/XML 风格。
- 目标项目没有约定时，再使用本控制系统默认的 DTO/VO、ID、事务和依赖规则。
- Spring Boot 版本必须跟随目标项目；禁止为了脚手架强行升级。
- 依赖按“必须依赖、功能依赖、脚手架依赖、测试依赖”分级处理。

## 默认关注点

- Controller 薄入口。
- Service 承载业务动作和事务边界。
- Mapper/XML 显式字段，禁止 `SELECT *`。
- API 对外暴露 `id`，数据库内部可保留 `pk_id`。
- 长整型 ID 给前端时按字符串处理。
- 参数非法返回参数错误，数据不存在返回业务不存在。
