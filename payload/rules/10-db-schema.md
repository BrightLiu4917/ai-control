# 数据库结构规则

## MySQL 基线
- MySQL 8
- 字符集：`utf8mb4`
- 推荐排序规则：`utf8mb4_unicode_ci`，除非既有表已经使用其他排序规则。

## 主键和业务 ID
- 数据库可以保留 `pk_id` 作为内部自增主键。
- 对外 API 和前端统一使用业务 ID `id`。
- `id` 如使用雪花算法或其他长整型，前端必须按字符串处理。
- 禁止把 `pk_id`、`pkId`、`pk_id_list` 或 `pkIdList` 暴露为 API 请求/响应字段。
- 后端内部可把 API 字符串 `id` 校验后转换为 `Long` 查询。

## 基础字段建议
业务表应考虑：

```sql
`pk_id` bigint NOT NULL AUTO_INCREMENT COMMENT '数据库主键',
`id` bigint NOT NULL COMMENT '业务ID，雪花算法生成',
`tenant_id` bigint NOT NULL DEFAULT 0 COMMENT '租户ID',
`is_deleted` tinyint NOT NULL DEFAULT 0 COMMENT '是否删除：0否 1是',
`gmt_created` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
`gmt_modified` datetime(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
`gmt_deleted` datetime(3) NULL COMMENT '删除时间',
`create_by` varchar(255) NULL COMMENT '创建人',
`update_by` varchar(255) NULL COMMENT '更新人'
```

## SQL 规则
- 禁止 `SELECT *`。
- 必须显式列名。
- UPDATE/DELETE 必须有精确 WHERE。
- 存在租户上下文时必须带租户条件。
- 存在软删除时必须带软删除条件。
- 避免索引字段函数计算。
- 避免隐式类型转换。

## JOIN 查询规则
- 禁止隐式逗号连接，例如 `FROM a, b`。
- 每个 `JOIN` 必须有明确的 `ON` 或 `USING` 条件，禁止无条件 JOIN 造成笛卡尔乘积。
- `ON` 条件必须使用已确认的表关系字段，禁止猜测关联字段。
- 多表查询必须先确认主表粒度，例如一行代表一个订单、一个用户或一条审批记录。
- 存在一对多或多对多关系时，列表查询、分页查询和统计查询不得直接把子表明细 JOIN 到主表后再分页或计数。
- 一对多数据需要展示时，应优先使用子查询预聚合、`EXISTS`、二次查询组装或明确的明细列表接口。
- 禁止把 `DISTINCT` 或 `GROUP BY` 当作修复重复数据的默认手段；必须先确认重复来源和业务粒度。
- 涉及租户、软删除、状态过滤的 JOIN 查询，每张参与表都必须按业务规则补齐对应过滤条件。
- 编写或修改 JOIN SQL 后，必须使用覆盖一对零、一对一、一对多、多对多边界数据的样例验证结果行数。

## 表结构设计审查
只要涉及创建或修改表结构、字段、索引、约束、初始化数据或迁移数据，必须先输出表结构设计审查并等待用户确认。用户确认表结构设计审查前，禁止输出数据库变更确认包、执行 SQL、写入 migration 文件或实现依赖新表结构的代码。

表结构设计审查必须包含：
- 查询场景：列表、详情、导出、统计、后台筛选、定时任务、JOIN 和排序分页等真实入口；不明确时必须 STOP and ASK。
- 写入场景：新增、编辑、删除、状态流转、批量导入、同步任务和历史数据迁移。
- 数据量级：当前量级、增长速度、冷热数据、租户数量和单租户数据量；不明确时标记待确认。
- 字段必要性分析：逐字段说明字段含义、事实来源、是否必须存储、是否可计算、是否建议新增/保留/修改/删除。
- 索引建议：基于 WHERE、JOIN、ORDER BY、GROUP BY 和唯一性约束提出索引，说明字段顺序、选择性、是否覆盖租户和软删除字段、写入成本，以及不建议加索引的原因。
- 冗余字段建议：仅在避免高频 JOIN、固化历史快照、提升列表/统计性能或隔离外部对象变更时提出；必须说明来源字段、同步时机、一致性策略、补偿方式和是否允许短暂不一致。
- 删除字段建议：默认只作为建议，不进入执行 DDL；必须说明代码/API/报表/导出依赖、历史数据备份、灰度删除、回滚方式和不删除的代价。
- Laravel / Hyperf 迁移策略：识别到 Laravel 或 Hyperf 项目时，说明建议的 migration 文件名、路径、up/down 逻辑摘要和是否需要模型/实体同步；用户确认前禁止写入 migration 文件或执行 migrate。
- 待用户确认项：字段含义、类型长度、默认值、枚举、索引、冗余字段、删除/重命名/合并字段、迁移策略和业务查询场景。

## 数据库变更确认包
用户确认表结构设计审查后，才允许输出数据库变更确认包。该阶段只能放入已确认的变更，未确认建议必须保留在“建议和待确认项”中，禁止混入可执行 SQL。

数据库变更确认包必须包含：
- 当前结构摘要：涉及表、字段、索引、约束、租户字段、软删除字段和审计字段。
- 本次确认变更：已确认的新增字段、修改字段、删除字段、新增索引、删除索引、约束变化、初始化数据和迁移数据。
- 目标结构 DDL：展示变更完成后的完整目标结构，用于用户整体观察和再次确认，不默认作为直接执行 SQL。
- 本地手动执行 DDL：用户可以复制到本地或 dev 环境执行的 SQL，必须按执行顺序排列，并与已确认变更一致。
- rollback SQL：本地执行失败、验证不通过或需要回退时使用的 SQL。
- Laravel / Hyperf migration 文件预览：识别到对应框架时，展示建议文件路径、文件名和完整 up/down 内容；用户确认前禁止写入文件或执行 `php artisan migrate`、`php bin/hyperf.php migrate`。
- 历史数据兼容策略。
- 索引影响和查询路径影响。
- Entity/Mapper/XML/DTO/VO/API 联动清单。
- 建议和待确认项：未确认的冗余字段、删除字段、重命名字段、迁移策略和风险建议必须留在此处，不得写入本地手动执行 DDL。
- 待用户确认项：字段含义、类型长度、默认值、枚举、删除/重命名/合并字段、迁移策略和是否允许执行。

本地手动执行 DDL 禁止包含 DROP、删除字段、重命名字段、截断表、全表 UPDATE/DELETE 或不可逆迁移，除非用户已经对该项明确确认。

## 高风险操作
CREATE、UPDATE、DELETE、ALTER、DROP、TRUNCATE 执行前必须确认。
DROP/TRUNCATE 默认先备份，备份表名：`原表名_copy_yyyyMMdd`。
