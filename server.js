const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { URL } = require("node:url");

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "accounting.db");
const PORT = Number(process.env.PORT) || 3000;
const TOKEN_TTL_DAYS = 30;
const MAX_BODY_SIZE = 1024 * 1024;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
initializeDatabase();

function initializeDatabase() {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      amount REAL NOT NULL CHECK (amount >= 0),
      category TEXT,
      note TEXT,
      record_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_records_user_date ON records(user_id, record_date DESC);
  `);
}

function createPasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  return {
    hash: crypto.scryptSync(password, salt, 64).toString("hex"),
    salt
  };
}

function verifyPassword(password, user) {
  const hashed = crypto.scryptSync(password, user.password_salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hashed, "hex"), Buffer.from(user.password_hash, "hex"));
}

function nowIso() {
  return new Date().toISOString();
}

function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidDateInput(dateText) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateText) && !Number.isNaN(Date.parse(`${dateText}T00:00:00Z`));
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendNoContent(res) {
  res.writeHead(204);
  res.end();
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function parseToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim();
}

function getAuthenticatedUser(req) {
  const token = parseToken(req);
  if (!token) {
    return null;
  }

  const session = db.prepare(`
    SELECT
      sessions.id AS session_id,
      sessions.token,
      sessions.expires_at,
      users.id AS user_id,
      users.email
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).get(token);

  if (!session) {
    return null;
  }

  if (new Date(session.expires_at) <= new Date()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(session.session_id);
    return null;
  }

  return {
    sessionId: session.session_id,
    token: session.token,
    user: {
      id: session.user_id,
      email: session.email
    }
  };
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare(`
    INSERT INTO sessions (user_id, token, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, token, nowIso(), daysFromNow(TOKEN_TTL_DAYS));
  return token;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let rawBody = "";
    let bodySize = 0;

    req.on("data", (chunk) => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_SIZE) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }

      rawBody += chunk;
    });

    req.on("end", () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new Error("JSON 格式不正确"));
      }
    });

    req.on("error", reject);
  });
}

function mapRecord(record) {
  return {
    id: record.id,
    type: record.type,
    amount: Number(record.amount),
    category: record.category || "",
    note: record.note || "",
    recordDate: record.record_date,
    createdAt: record.created_at
  };
}

function buildDateFilter(searchParams) {
  const startDate = searchParams.get("startDate") || "";
  const endDate = searchParams.get("endDate") || "";

  if (startDate && !isValidDateInput(startDate)) {
    throw new Error("开始日期格式不正确");
  }

  if (endDate && !isValidDateInput(endDate)) {
    throw new Error("结束日期格式不正确");
  }

  if (startDate && endDate && startDate > endDate) {
    throw new Error("开始日期不能晚于结束日期");
  }

  return { startDate, endDate };
}

function buildRecordQuery(userId, filter) {
  const conditions = ["user_id = ?"];
  const params = [userId];

  if (filter.startDate) {
    conditions.push("record_date >= ?");
    params.push(filter.startDate);
  }

  if (filter.endDate) {
    conditions.push("record_date <= ?");
    params.push(filter.endDate);
  }

  return {
    clause: conditions.join(" AND "),
    params
  };
}

function serveStaticFile(res, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const resolvedPath = path.resolve(PUBLIC_DIR, relativePath);

  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(resolvedPath, (error, data) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendText(res, 404, "Not Found");
        return;
      }

      sendText(res, 500, "Internal Server Error");
      return;
    }

    const extension = path.extname(resolvedPath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Content-Length": data.length
    });
    res.end(data);
  });
}

async function handleRequest(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname, searchParams } = requestUrl;

  try {
    if (pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === "/api/auth/register" && req.method === "POST") {
      const body = await readJsonBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");

      if (!isValidEmail(email)) {
        sendJson(res, 400, { error: "请输入有效的邮箱地址" });
        return;
      }

      if (password.length < 8) {
        sendJson(res, 400, { error: "密码长度至少为 8 位" });
        return;
      }

      const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existingUser) {
        sendJson(res, 409, { error: "该邮箱已注册" });
        return;
      }

      const { hash, salt } = createPasswordHash(password);
      const result = db.prepare(`
        INSERT INTO users (email, password_hash, password_salt, created_at)
        VALUES (?, ?, ?, ?)
      `).run(email, hash, salt, nowIso());

      const token = createSession(result.lastInsertRowid);
      sendJson(res, 201, {
        token,
        user: {
          id: Number(result.lastInsertRowid),
          email
        }
      });
      return;
    }

    if (pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readJsonBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");

      const user = db.prepare(`
        SELECT id, email, password_hash, password_salt
        FROM users
        WHERE email = ?
      `).get(email);

      if (!user || !verifyPassword(password, user)) {
        sendJson(res, 401, { error: "邮箱或密码错误" });
        return;
      }

      const token = createSession(user.id);
      sendJson(res, 200, {
        token,
        user: {
          id: user.id,
          email: user.email
        }
      });
      return;
    }

    if (pathname === "/api/auth/me" && req.method === "GET") {
      const auth = getAuthenticatedUser(req);
      if (!auth) {
        sendJson(res, 401, { error: "未登录或登录已过期" });
        return;
      }

      sendJson(res, 200, { user: auth.user });
      return;
    }

    if (pathname === "/api/auth/logout" && req.method === "POST") {
      const auth = getAuthenticatedUser(req);
      if (!auth) {
        sendNoContent(res);
        return;
      }

      db.prepare("DELETE FROM sessions WHERE id = ?").run(auth.sessionId);
      sendNoContent(res);
      return;
    }

    if (pathname === "/api/records" && req.method === "POST") {
      const auth = getAuthenticatedUser(req);
      if (!auth) {
        sendJson(res, 401, { error: "请先登录" });
        return;
      }

      const body = await readJsonBody(req);
      const type = body.type === "income" ? "income" : body.type === "expense" ? "expense" : "";
      const amount = Number(body.amount);
      const category = String(body.category || "").trim().slice(0, 50);
      const note = String(body.note || "").trim().slice(0, 200);
      const recordDate = String(body.recordDate || "");

      if (!type) {
        sendJson(res, 400, { error: "请选择收入或支出类型" });
        return;
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        sendJson(res, 400, { error: "金额必须大于 0" });
        return;
      }

      if (!isValidDateInput(recordDate)) {
        sendJson(res, 400, { error: "日期格式不正确" });
        return;
      }

      const result = db.prepare(`
        INSERT INTO records (user_id, type, amount, category, note, record_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(auth.user.id, type, amount, category, note, recordDate, nowIso());

      const newRecord = db.prepare(`
        SELECT id, type, amount, category, note, record_date, created_at
        FROM records
        WHERE id = ?
      `).get(result.lastInsertRowid);

      sendJson(res, 201, { record: mapRecord(newRecord) });
      return;
    }

    if (pathname === "/api/records" && req.method === "GET") {
      const auth = getAuthenticatedUser(req);
      if (!auth) {
        sendJson(res, 401, { error: "请先登录" });
        return;
      }

      const filter = buildDateFilter(searchParams);
      const query = buildRecordQuery(auth.user.id, filter);
      const records = db.prepare(`
        SELECT id, type, amount, category, note, record_date, created_at
        FROM records
        WHERE ${query.clause}
        ORDER BY record_date DESC, id DESC
      `).all(...query.params);

      sendJson(res, 200, {
        records: records.map(mapRecord)
      });
      return;
    }

    if (pathname === "/api/summary" && req.method === "GET") {
      const auth = getAuthenticatedUser(req);
      if (!auth) {
        sendJson(res, 401, { error: "请先登录" });
        return;
      }

      const filter = buildDateFilter(searchParams);
      const query = buildRecordQuery(auth.user.id, filter);
      const summary = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
        FROM records
        WHERE ${query.clause}
      `).get(...query.params);

      const totalIncome = Number(summary.total_income);
      const totalExpense = Number(summary.total_expense);

      sendJson(res, 200, {
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense
      });
      return;
    }

    if (req.method === "GET") {
      serveStaticFile(res, pathname);
      return;
    }

    sendJson(res, 404, { error: "接口不存在" });
  } catch (error) {
    if (error.message === "JSON 格式不正确" || error.message === "请求体过大") {
      sendJson(res, 400, { error: error.message });
      return;
    }

    if (
      error.message === "开始日期格式不正确" ||
      error.message === "结束日期格式不正确" ||
      error.message === "开始日期不能晚于结束日期"
    ) {
      sendJson(res, 400, { error: error.message });
      return;
    }

    console.error(error);
    sendJson(res, 500, { error: "服务器内部错误" });
  }
}

function startServer(port = PORT) {
  const server = http.createServer((req, res) => {
    handleRequest(req, res);
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

if (require.main === module) {
  startServer().then(() => {
    console.log(`KeepAccounting is running at http://localhost:${PORT}`);
  });
}

module.exports = {
  startServer
};
