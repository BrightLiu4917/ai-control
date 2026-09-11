# API 规则

## 路径和兼容
- API 路径必须遵循本文件的入口、版本、模块和动作规则。
- 禁止发明新响应结构。
- 禁止破坏已有接口兼容性，除非用户明确批准。
- 新增、修改、删除接口必须写清影响范围。
- 后台、管理端、平台管理接口必须写清访问控制模式、责任系统、权限点或明确不适用原因。

## 入口前缀
所有新增 API 必须带版本号。

| 场景 | 路径前缀 | 说明 |
|------|----------|------|
| 管理后台 | `/api/admin/v1` | 平台管理、运营后台、管理端 |
| 移动端 | `/api/app/v1` | App、H5、小程序共用用户端接口 |
| 小程序端 | `/api/app/v1` | 与移动端共用；差异使用 header 或业务参数区分 |
| 对外开放接口 | `/openapi/app/v1` | 给第三方系统或合作方调用 |
| 对内服务接口 | `/innerapi/app/v1` | 系统内部服务调用，不给前端直接访问 |

## 路径格式
路径格式必须为：

```text
/入口/端类型/v版本/业务模块/动作
```

示例：

```text
/api/admin/v1/supplier/page
/api/admin/v1/supplier/detail
/api/admin/v1/supplier/create
/api/admin/v1/supplier/update
/api/admin/v1/supplier/delete
/api/app/v1/supplier-onboarding/submit
/openapi/app/v1/order/push
/innerapi/app/v1/order/sync
```

路径命名规则：
- URL path 只允许小写字母、数字、`/` 和中横线 `-`。
- 多单词业务模块必须使用中横线，例如 `supplier-onboarding`、`audit-log`。
- 禁止驼峰命名，例如 `supplierOnboarding`。
- 禁止下划线命名，例如 `supplier_onboarding`。
- 禁止大写路径段。
- 业务模块使用单数业务名，例如 `supplier`、`audit-log`、`user-role`，禁止为了 REST 风格改成复数资源名。

## 请求方法
只允许：

```text
GET
POST
```

禁止：

```text
PUT
DELETE
PATCH
```

方法使用规则：
- 查询、分页、列表、详情、选项使用 `GET`。
- 新增、修改、删除、批量删除、提交、审核、通过、驳回、启用、禁用使用 `POST`。

## 参数位置
禁止路径参数。

禁止：

```text
/api/admin/v1/supplier/{id}
/api/admin/v1/supplier/123
/api/admin/v1/supplier/detail/123
```

必须：

```text
GET /api/admin/v1/supplier/detail?id=123
POST /api/admin/v1/supplier/update
POST /api/admin/v1/supplier/delete
```

POST body：

```json
{
  "id": "123"
}
```

## 动作命名
常用动作必须使用以下路径段：

| 动作 | 路径段 | Method |
|------|--------|--------|
| 分页 | `page` | GET |
| 列表 | `list` | GET |
| 详情 | `detail` | GET |
| 下拉选项 | `options` | GET |
| 新增 | `create` | POST |
| 修改 | `update` | POST |
| 删除 | `delete` | POST |
| 批量删除 | `batch-delete` | POST |
| 提交 | `submit` | POST |
| 审核 | `review` | POST |
| 通过 | `approve` | POST |
| 驳回 | `reject` | POST |
| 启用 | `enable` | POST |
| 禁用 | `disable` | POST |

## API 契约位置
- API 事实源必须先进入 `openspec/changes/<change-id>/`。
- `api-contracts/` 只用于把已确认或待确认的接口细节展开成便于前后端联调的文档。
- `api-contracts/` 不得与 OpenSpec 写两套冲突规则。
- 如果两者不一致，以 OpenSpec 中已确认的 `spec.md` 和用户确认记录为准，并立即同步 `api-contracts/`。
- 示例项目可以保留 `api-contracts/`，但必须在 README 中说明它和 OpenSpec 的关系。

## 请求
- Create/Update 请求必须校验。
- 分页、筛选、排序参数必须有明确含义和默认值。
- 禁止只依赖前端校验。
- 请求 DTO 必须明确必填、长度、格式、枚举、数值范围和数组数量限制，供前端表单校验对齐。
- 请求字段约束必须与数据库字段长度、后端验证层和 OpenSpec/API 契约一致；不一致时必须先确认。
- 对外 ID 参数统一命名为 `id` 或 `idList`，禁止使用 `pk_id`、`pkId`、`pk_id_list` 或 `pkIdList`。
- 长整型 ID 在 JSON、URL query 和前端状态中必须按字符串传递。

## 响应
- 必须使用既有统一响应包装。
- 如果存在 VO，禁止直接返回 Entity。
- 禁止暴露敏感字段。
- 禁止暴露异常堆栈。
- 响应中的长整型业务 ID 必须序列化为字符串，避免前端精度丢失。

## 错误
- `id` 为空、非数字、非正数或越界时返回参数错误。
- 按 `id` 查询不到数据时返回业务不存在。
- 禁止把 ID 解析失败、空指针或数据不存在变成 500。

## 分页
分页响应必须明确：
- list/data
- total
- pageNum/current
- pageSize

## 输出要求
涉及 API 变化时必须说明：
- API 路径
- 请求 DTO
- 响应 VO
- 分页结构
- 兼容性影响
- 前端联动影响
- 前端表单校验规则来源，包括必填、长度、格式、枚举和范围
- 鉴权方式、访问控制模式、责任系统、权限点和无权限返回
