# Java 枚举与常量规则

目标：业务判断、出参文案、入参校验全部收敛到枚举，禁止魔法值散落在代码里。文案或值域要改时，只改枚举一处，全系统生效。

## 枚举定义规范

- 业务状态、类型、标志位必须定义枚举，结构统一为 `code + desc` 双字段：`code` 用于入库和传输，`desc` 仅用于展示。
- 必须提供 `fromCode(code)` 静态解析方法：查不到时返回 null 或抛业务异常，**禁止返回默认枚举值掩盖非法输入**。
- 禁止 `ordinal()` 参与入库、传输或任何业务逻辑；禁止依赖枚举声明顺序。
- 枚举值必须来自 OpenSpec、表注释或用户确认的事实源，禁止发明；DB 表注释、枚举定义、API 文档三处值域必须一致，变更必须走 change。
- 目标项目已有枚举基类/接口（如 `IEnum<T>`）时必须跟随既有约定。

```java
@Getter
@AllArgsConstructor
public enum OrderStatus {
    PENDING(0, "待支付"),
    PAID(1, "已支付"),
    SHIPPED(2, "已发货"),
    CLOSED(9, "已关闭");

    private final Integer code;
    private final String desc;

    public static OrderStatus fromCode(Integer code) {
        for (OrderStatus s : values()) {
            if (s.code.equals(code)) {
                return s;
            }
        }
        return null; // 调用方必须处理 null，返回参数错误
    }
}
```

## 判断规则：禁止魔法值

- 业务判断只允许通过枚举进行，**禁止裸数字、裸字符串字面量参与状态/类型判断**。

```java
// 禁止
if (order.getStatus() == 1) { ... }
if ("PAID".equals(order.getStatusStr())) { ... }

// 正确
if (OrderStatus.PAID.getCode().equals(order.getStatus())) { ... }
// 或 Entity 字段本身为枚举类型时
if (OrderStatus.PAID == order.getStatus()) { ... }
```

- 对枚举 `switch` 必须覆盖全部分支，或在 `default` 显式抛"未知枚举值"异常——将来新增枚举值时立刻暴露，禁止静默走错分支。
- 状态流转合法性必须集中定义（枚举内 `canTransferTo(target)` 方法或独立状态机类），禁止在各 Service 里散落 if 拼流转判断。

```java
// 集中定义流转，Service 里只调用
public boolean canTransferTo(OrderStatus target) {
    return switch (this) {
        case PENDING -> target == PAID || target == CLOSED;
        case PAID    -> target == SHIPPED || target == CLOSED;
        case SHIPPED -> target == CLOSED;
        case CLOSED  -> false;
    };
}
```

## 出参规则：禁止写死文案

- VO 返回状态时必须**同时返回 `status`（code）和 `statusDesc`（desc）**，`statusDesc` 一律取自枚举 desc 字段。
- 禁止在 Controller、Service、前端用三目/if/switch 硬拼状态文案。

```java
// 禁止
vo.setStatusDesc(status == 1 ? "已支付" : status == 2 ? "已发货" : "未知");

// 正确
OrderStatus s = OrderStatus.fromCode(entity.getStatus());
vo.setStatus(entity.getStatus());
vo.setStatusDesc(s != null ? s.getDesc() : "");
```

## 入参规则：禁止透传

- 前端传 code，后端必须先 `fromCode()` 解析校验；非法值返回参数错误（不是 500，也不是照存入库）。
- DTO 字段接收原始类型（Integer/String），进入 Service 层前转换为枚举类型流转。

```java
OrderStatus target = OrderStatus.fromCode(dto.getStatus());
if (target == null) {
    throw new BizException(PARAM_ERROR, "非法的订单状态: " + dto.getStatus());
}
```

## 序列化与持久化统一

- Jackson 序列化统一处理（`@JsonValue` 出 code，或项目统一序列化器），禁止各处手写 `getCode()` 转换。
- MyBatis 通过统一 TypeHandler 存取枚举；目标项目已有约定（如 MyBatis-Plus `@EnumValue`）时必须跟随。
- 布尔型标志位跟随 DB 规则的 `0否 1是` 注释风格（见 `10-db-schema.md` 基础字段），枚举 desc 与表注释一致。

## 审查检查点

实现或审查涉及状态/类型的代码时，逐项确认：

1. 是否存在裸数字/裸字符串参与业务判断。
2. 是否存在硬拼的状态文案。
3. 入参 code 是否经过 `fromCode()` 校验。
4. `switch` 是否覆盖全部枚举分支或显式抛异常。
5. 是否使用了 `ordinal()`。
6. 枚举值与表注释、API 文档是否一致。
