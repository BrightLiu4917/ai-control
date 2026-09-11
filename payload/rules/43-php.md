# PHP 技术栈规则

## 适用范围

适用于 PHP、Laravel、ThinkPHP 或其他 PHP 后端项目。

## 接入原则

- 优先遵循目标项目已有目录、路由、中间件、异常、响应体、ORM 和迁移方式。
- 不得把 Java/Spring Boot 的包结构、注解或依赖规则套到 PHP 项目。
- API 字段、状态、权限、错误码和数据库字段必须来自 OpenSpec 或用户确认。

## 实现要求

- Controller 保持薄入口。
- Service 或 Action 承载业务动作。
- Repository/Model 负责数据访问，禁止在控制器里堆 SQL。
- 涉及多表写入必须使用事务。
- 后台管理功能必须确认访问控制模式、责任系统和权限点；如果本服务不建设 RBAC，按外部权限系统约定处理。
