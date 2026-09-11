# OpenAPI 功能规则

## 适用范围

适用于 Swagger UI、OpenAPI 文档、接口契约同步和前后端联调。

## 规则

- OpenAPI 文档必须跟实际 Controller、DTO、VO 保持一致。
- 接口说明、字段说明、错误码说明必须使用中文。
- API Path、HTTP Method、JSON 字段和枚举值可以保留英文。
- 不允许在文档中暴露敏感字段、内部主键 `pk_id`、密钥或测试账号密码。
- 目标项目没有启用 OpenAPI 时，不得为了单个需求强行引入，除非用户确认。

