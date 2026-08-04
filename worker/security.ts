import { SECURITY_SCHEMA } from "../db/schema";

type D1Result<T = unknown> = {
  results?: T[];
  success: boolean;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
};

export type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
};

export type SecurityEnv = {
  DB?: D1Database;
  APP_SESSION_SECRET?: string;
  DRIVE_SCANNER_URL?: string;
  DRIVE_SCANNER_SECRET?: string;
};

type SecretHash = { salt: string; hash: string };
type Session = {
  role: "employee" | "leader" | "admin";
  personId?: string;
  sid: string;
  exp: number;
};

const COOKIE_NAME = "liangjian_session";
const SESSION_SECONDS = 12 * 60 * 60;
const CURRENT_SALT_PREFIX = "v2:";
const CURRENT_PBKDF2_ITERATIONS = 100_000;
const DRIVE_FOLDER_PATTERN =
  /^https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)([-\w]{10,})/i;

function json(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function boundedNumber(value: unknown, maximum = 10_000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(maximum, Math.max(0, Math.round(number)));
}

async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new Error("INVALID_JSON");
  }
  return (await request.json()) as Record<string, unknown>;
}

function isSecretHash(value: unknown): value is SecretHash {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SecretHash>;
  return (
    typeof candidate.salt === "string" &&
    candidate.salt.length >= 8 &&
    candidate.salt.length <= 128 &&
    typeof candidate.hash === "string" &&
    /^[a-f0-9]{64}$/i.test(candidate.hash)
  );
}

async function ensureSchema(db: D1Database) {
  await db.batch(SECURITY_SCHEMA.map((statement) => db.prepare(statement)));
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
}

async function signSession(session: Session, secret: string) {
  const payload = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(session)),
  );
  const signature = encodeBase64Url(await hmac(secret, payload));
  return `${payload}.${signature}`;
}

async function verifySession(request: Request, secret: string) {
  const cookies = request.headers.get("cookie") ?? "";
  const token = cookies
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const session = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payload)),
    ) as Session;
    if (
      !["employee", "leader", "admin"].includes(session.role) ||
      typeof session.sid !== "string" ||
      session.sid.length > 80 ||
      !Number.isFinite(session.exp) ||
      session.exp <= Date.now()
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

async function deriveHash(secret: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: new TextEncoder().encode(salt),
        iterations: CURRENT_PBKDF2_ITERATIONS,
      },
      key,
      256,
    ),
  );
}

function hexToBytes(value: string) {
  return Uint8Array.from(
    value.match(/.{2}/g) ?? [],
    (pair) => Number.parseInt(pair, 16),
  );
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function verifyPassword(secret: string, saved: SecretHash) {
  if (
    secret.length > 256 ||
    !saved.salt.startsWith(CURRENT_SALT_PREFIX)
  ) {
    return false;
  }
  return constantTimeEqual(
    await deriveHash(secret, saved.salt),
    hexToBytes(saved.hash),
  );
}

function validProof(value: unknown, saved: SecretHash) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{64}$/i.test(value) &&
    constantTimeEqual(hexToBytes(value), hexToBytes(saved.hash))
  );
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `${CURRENT_SALT_PREFIX}${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

async function upgradeSecret(
  db: D1Database,
  table: "auth_config" | "leader_pins",
  key: string,
  secret: string,
) {
  const salt = randomSalt();
  const hash = Array.from(await deriveHash(secret, salt), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const keyColumn = table === "auth_config" ? "role" : "person_id";
  await db
    .prepare(
      `UPDATE ${table} SET salt = ?, hash = ?, updated_at = ? WHERE ${keyColumn} = ?`,
    )
    .bind(salt, hash, Date.now(), key)
    .run();
}

async function getSavedSecret(
  db: D1Database,
  table: "auth_config" | "leader_pins",
  key: string,
) {
  const keyColumn = table === "auth_config" ? "role" : "person_id";
  return db
    .prepare(`SELECT salt, hash FROM ${table} WHERE ${keyColumn} = ?`)
    .bind(key)
    .first<SecretHash>();
}

async function bootstrap(request: Request, db: D1Database) {
  const body = await readJson(request);
  const staff = body.staff;
  const admin = body.admin;
  const leaderPins =
    body.leaderPins && typeof body.leaderPins === "object"
      ? (body.leaderPins as Record<string, unknown>)
      : {};
  const leaderEntries = Object.entries(leaderPins);
  if (
    !isSecretHash(staff) ||
    !isSecretHash(admin) ||
    leaderEntries.length > 200 ||
    leaderEntries.some(
      ([personId, pin]) =>
        !/^[\w-]{1,80}$/.test(personId) || !isSecretHash(pin),
    )
  ) {
    return json({ error: "密码配置格式不正确" }, 400);
  }

  const initialized = await db
    .prepare("SELECT initialized_at FROM security_state WHERE id = 1")
    .first();
  if (initialized) return json({ initialized: true, created: false });

  const now = Date.now();
  const claim = await db
    .prepare(
      "INSERT INTO security_state (id, initialized_at) VALUES (1, ?) ON CONFLICT(id) DO NOTHING RETURNING id",
    )
    .bind(now)
    .first();
  if (!claim) return json({ initialized: true, created: false });

  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO auth_config (role, salt, hash, updated_at) VALUES (?, ?, ?, ?)",
        )
        .bind("staff", staff.salt, staff.hash, now),
      db
        .prepare(
          "INSERT INTO auth_config (role, salt, hash, updated_at) VALUES (?, ?, ?, ?)",
        )
        .bind("admin", admin.salt, admin.hash, now),
      ...leaderEntries.map(([personId, pin]) => {
        const secret = pin as SecretHash;
        return db
          .prepare(
            "INSERT INTO leader_pins (person_id, salt, hash, updated_at) VALUES (?, ?, ?, ?)",
          )
          .bind(personId, secret.salt, secret.hash, now);
      }),
    ]);
    return json({ initialized: true, created: true }, 201);
  } catch (error) {
    await db.prepare("DELETE FROM security_state WHERE id = 1").run();
    throw error;
  }
}

async function login(request: Request, env: SecurityEnv, db: D1Database) {
  const body = await readJson(request);
  const mode = body.mode;
  const password = typeof body.password === "string" ? body.password : "";
  const personId =
    typeof body.personId === "string" && /^[\w-]{1,80}$/.test(body.personId)
      ? body.personId
      : undefined;
  const leaderPin = typeof body.leaderPin === "string" ? body.leaderPin : "";
  const saved = await getSavedSecret(
    db,
    "auth_config",
    mode === "admin" ? "admin" : "staff",
  );
  if (!saved) {
    return json({ error: mode === "admin" ? "管理员密码不正确" : "共用密码不正确" }, 401);
  }

  const savedPin =
    mode !== "admin" && leaderPin && personId
      ? await getSavedSecret(db, "leader_pins", personId)
      : null;
  const passwordNeedsUpgrade = !saved.salt.startsWith(CURRENT_SALT_PREFIX);
  const leaderPinNeedsUpgrade = Boolean(
    savedPin && !savedPin.salt.startsWith(CURRENT_SALT_PREFIX),
  );
  if (
    (passwordNeedsUpgrade && !body.passwordProof) ||
    (leaderPinNeedsUpgrade && !body.leaderPinProof)
  ) {
    return json(
      {
        code: "PASSWORD_UPGRADE_REQUIRED",
        passwordSalt: passwordNeedsUpgrade ? saved.salt : undefined,
        leaderPinSalt: leaderPinNeedsUpgrade ? savedPin?.salt : undefined,
      },
      409,
    );
  }
  const passwordValid = passwordNeedsUpgrade
    ? validProof(body.passwordProof, saved)
    : await verifyPassword(password, saved);
  if (!passwordValid) {
    return json({ error: mode === "admin" ? "管理员密码不正确" : "共用密码不正确" }, 401);
  }
  if (passwordNeedsUpgrade) {
    await upgradeSecret(
      db,
      "auth_config",
      mode === "admin" ? "admin" : "staff",
      password,
    );
  }

  let role: Session["role"] = mode === "admin" ? "admin" : "employee";
  if (mode !== "admin" && leaderPin) {
    if (!personId) return json({ error: "请选择自己的姓名" }, 400);
    const leaderPinValid = savedPin
      ? leaderPinNeedsUpgrade
        ? validProof(body.leaderPinProof, savedPin)
        : await verifyPassword(leaderPin, savedPin)
      : false;
    if (!leaderPinValid) {
      return json({ error: "组长 PIN 不正确" }, 401);
    }
    if (leaderPinNeedsUpgrade) {
      await upgradeSecret(db, "leader_pins", personId, leaderPin);
    }
    role = "leader";
  }
  if (mode !== "admin" && !personId) {
    return json({ error: "请选择自己的姓名" }, 400);
  }

  const session: Session = {
    role,
    personId: role === "admin" ? undefined : personId,
    sid: crypto.randomUUID(),
    exp: Date.now() + SESSION_SECONDS * 1000,
  };
  const token = await signSession(session, env.APP_SESSION_SECRET!);
  return json(
    { role: session.role, personId: session.personId },
    200,
    {
      "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`,
    },
  );
}

async function updateLeader(
  request: Request,
  db: D1Database,
  session: Session,
) {
  if (session.role !== "admin") return json({ error: "仅管理员可以设置组长" }, 403);
  const body = await readJson(request);
  const personId =
    typeof body.personId === "string" && /^[\w-]{1,80}$/.test(body.personId)
      ? body.personId
      : "";
  if (!personId) return json({ error: "人员信息不正确" }, 400);
  if (body.remove === true) {
    await db
      .prepare("DELETE FROM leader_pins WHERE person_id = ?")
      .bind(personId)
      .run();
    return json({ ok: true });
  }
  if (!isSecretHash(body.secret)) {
    return json({ error: "组长 PIN 格式不正确" }, 400);
  }
  const secret = body.secret;
  await db
    .prepare(
      `INSERT INTO leader_pins (person_id, salt, hash, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(person_id) DO UPDATE SET
         salt = excluded.salt, hash = excluded.hash, updated_at = excluded.updated_at`,
    )
    .bind(personId, secret.salt, secret.hash, Date.now())
    .run();
  return json({ ok: true });
}

async function consumeRateLimit(
  db: D1Database,
  session: Session,
  request: Request,
) {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const digest = encodeBase64Url(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${session.sid}:${ip}`),
      ),
    ),
  ).slice(0, 32);
  const now = Date.now();
  const limits = [
    { name: "minute", size: 60_000, maximum: 6 },
    { name: "day", size: 86_400_000, maximum: 200 },
  ];
  for (const limit of limits) {
    const windowStart = Math.floor(now / limit.size) * limit.size;
    const row = await db
      .prepare(
        `INSERT INTO scan_rate_limits (bucket, window_start, count)
         VALUES (?, ?, 1)
         ON CONFLICT(bucket) DO UPDATE SET
           window_start = excluded.window_start,
           count = CASE
             WHEN scan_rate_limits.window_start = excluded.window_start
             THEN scan_rate_limits.count + 1
             ELSE 1
           END
         RETURNING count`,
      )
      .bind(`${limit.name}:${digest}`, windowStart)
      .first<{ count: number }>();
    if (!row || row.count > limit.maximum) return false;
  }
  return true;
}

async function scanDrive(
  request: Request,
  env: SecurityEnv,
  db: D1Database,
  session: Session,
) {
  if (!(await consumeRateLimit(db, session, request))) {
    return json({ error: "检测次数过于频繁，请稍后再试" }, 429, {
      "Retry-After": "60",
    });
  }
  const body = await readJson(request);
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!DRIVE_FOLDER_PATTERN.test(url) || url.length > 500) {
    return json({ error: "请输入有效的 Google Drive 文件夹链接" }, 400);
  }
  if (!env.DRIVE_SCANNER_URL || !env.DRIVE_SCANNER_SECRET) {
    return json({ error: "扫描服务尚未连接" }, 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(env.DRIVE_SCANNER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        secret: env.DRIVE_SCANNER_SECRET,
        limits: { maxDepth: 12, maxItems: 10_000 },
      }),
      signal: controller.signal,
      redirect: "follow",
    });
    const result = (await response.json()) as Record<string, unknown>;
    if (!response.ok || result.ok === false) {
      return json(
        { error: String(result.error || "无法读取该文件夹，请检查共享权限").slice(0, 160) },
        502,
      );
    }
    const videoDetails = Array.isArray(result.videoDetails)
      ? result.videoDetails.slice(0, 500).map((item) => {
          const detail = item as Record<string, unknown>;
          const duration = Number(detail.durationSeconds);
          return {
            name: String(detail.name || "未命名视频").slice(0, 120),
            durationSeconds:
              detail.durationSeconds == null || !Number.isFinite(duration)
                ? null
                : Math.max(0, Math.round(duration)),
          };
        })
      : [];
    return json({
      folderName: String(result.folderName || "Google Drive 文件夹").slice(0, 120),
      images: boundedNumber(result.images),
      videos: boundedNumber(result.videos),
      selected: boundedNumber(result.selected),
      selectedFolders: boundedNumber(result.selectedFolders),
      videoDurationSeconds: boundedNumber(result.videoDurationSeconds, 864_000),
      videoDurationUnavailable: boundedNumber(result.videoDurationUnavailable),
      videoDetails,
      videoDetailsTruncated: Boolean(result.videoDetailsTruncated),
    });
  } catch {
    return json({ error: "扫描服务暂时不可用，请稍后重试" }, 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleSecurityRequest(
  request: Request,
  env: SecurityEnv,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (request.method === "OPTIONS" && path.startsWith("/api/")) {
    return new Response(null, { status: 405 });
  }
  const isSecurityPath =
    path === "/api/scan" || path.startsWith("/api/auth/");
  if (!isSecurityPath) return null;
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "请求方法不允许" }, 405);
  }
  if (path === "/api/scan" && request.method === "POST") {
    try {
      const preview = await readJson(request.clone());
      const url = typeof preview.url === "string" ? preview.url.trim() : "";
      if (!DRIVE_FOLDER_PATTERN.test(url) || url.length > 500) {
        return json({ error: "请输入有效的 Google Drive 文件夹链接" }, 400);
      }
    } catch {
      return json({ error: "请求格式不正确" }, 400);
    }
  }
  if (!env.DB || !env.APP_SESSION_SECRET || env.APP_SESSION_SECRET.length < 32) {
    return json({ error: "服务器安全配置尚未完成" }, 503);
  }

  try {
    await ensureSchema(env.DB);
    if (path === "/api/auth/status" && request.method === "GET") {
      const initialized = await env.DB
        .prepare("SELECT initialized_at FROM security_state WHERE id = 1")
        .first();
      return json({ initialized: Boolean(initialized) });
    }
    if (path === "/api/auth/bootstrap" && request.method === "POST") {
      return bootstrap(request, env.DB);
    }
    if (path === "/api/auth/login" && request.method === "POST") {
      return login(request, env, env.DB);
    }
    if (path === "/api/auth/logout" && request.method === "POST") {
      return json(
        { ok: true },
        200,
        {
          "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
        },
      );
    }

    const session = await verifySession(request, env.APP_SESSION_SECRET);
    if (!session) return json({ error: "登录已失效，请重新登录" }, 401);
    if (path === "/api/auth/me" && request.method === "GET") {
      return json({ role: session.role, personId: session.personId });
    }
    if (path === "/api/auth/leader" && request.method === "POST") {
      return updateLeader(request, env.DB, session);
    }
    if (path === "/api/scan" && request.method === "POST") {
      return scanDrive(request, env, env.DB, session);
    }
    return json({ error: "接口不存在" }, 404);
  } catch {
    return json({ error: "服务器暂时无法处理请求" }, 500);
  }
}
