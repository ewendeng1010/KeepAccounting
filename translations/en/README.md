# KeepAccounting

A lightweight accounting application based on Node.js and SQLite, supporting:

- User registration and login
- Adding income/expense records
- Displaying total income, total expenses, and balance
- Filtering records by date range
- Data persistence to SQLite database

## Startup Method

```bash
node server.js
```

After startup, visit:

```text
http://localhost:3000
```

## Database Location

The default database file will be created at:

```text
data/accounting.db
```

If you want to customize the database file path, you can pass the `DB_PATH` environment variable at startup.