# KeepAccounting

一个基于 Node.js 和 SQLite 的简洁记账应用，支持：

- 用户注册和登录
- 新增收入/支出记录
- 显示总收入、总支出和余额
- 按日期范围筛选记录
- 数据持久化到 SQLite 数据库

## 启动方式

```bash
node server.js
```

启动后访问：

```text
http://localhost:3000
```

## 数据库位置

默认数据库文件会创建在：

```text
data/accounting.db
```

如果你想自定义数据库文件路径，可以在启动时传入 `DB_PATH` 环境变量。
