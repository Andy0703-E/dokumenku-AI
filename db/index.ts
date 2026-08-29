import { createClient, type Client, type InStatement } from "@libsql/client";
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

// ─── Secrets (lazy — validated at runtime, not build time) ───────────
function getApprovalTokenSecret(): string {
  const secret = process.env.APPROVAL_TOKEN_SECRET || process.env.APP_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SECURITY_REQUIRED: APPROVAL_TOKEN_SECRET (or APP_SECRET) must be set in production.");
  }
  return secret || "dokumenku-approval-token-secret-2026";
}

function getAuditChainSecret(): string {
  const secret = process.env.AUDIT_CHAIN_SECRET || process.env.APP_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SECURITY_REQUIRED: AUDIT_CHAIN_SECRET (or APP_SECRET) must be set in production.");
  }
  return secret || "dokumenku-audit-chain-secret-2026";
}

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ─── DB Executor Interface (Client | Transaction) ───────────────────
type DBExecutor = {
  execute(stmt: InStatement): Promise<{ rows: Record<string, unknown>[]; rowsAffected: number }>;
};

// ─── Type-safe query helpers ────────────────────────────────────────
async function queryOne<T>(db: DBExecutor, sql: string, args?: (string | number | null)[]): Promise<T | undefined> {
  const result = await db.execute({ sql, args: args || [] });
  return result.rows[0] as unknown as T | undefined;
}

async function queryAll<T>(db: DBExecutor, sql: string, args?: (string | number | null)[]): Promise<T[]> {
  const result = await db.execute({ sql, args: args || [] });
  return result.rows as unknown as unknown as unknown as T[];
}

async function executeUpdate(db: DBExecutor, sql: string, args?: (string | number | null)[]): Promise<number> {
  const result = await db.execute({ sql, args: args || [] });
  return result.rowsAffected;
}

// ─── Pure Helpers (no DB) ───────────────────────────────────────────

export function generateApprovalToken(length = 6): string {
  let token = "";
  for (let i = 0; i < length; i++) {
    token += TOKEN_ALPHABET[randomInt(0, TOKEN_ALPHABET.length)];
  }
  return token;
}

export function hashApprovalToken(token: string): string {
  return createHmac("sha256", getApprovalTokenSecret())
    .update(token.toUpperCase().trim())
    .digest("hex");
}

export function safeCompare(a: string, b: string): boolean {
  try {
    const x = Buffer.from(a, "hex");
    const y = Buffer.from(b, "hex");
    return x.length === y.length && timingSafeEqual(x, y);
  } catch {
    return false;
  }
}

export function buildCanonicalAuditPayload(params: {
  sequence?: number;
  keyVersion?: number;
  orderId: string;
  action: string;
  actorEmail: string;
  provider?: string;
  transactionId?: string;
  amount?: number;
  creditsGranted?: number;
  statusBefore?: string;
  statusAfter?: string;
  notes?: string;
  previousHash: string;
  createdAt: string;
}): string {
  return JSON.stringify({
    version: 1,
    sequence: Number(params.sequence ?? 1),
    key_version: Number(params.keyVersion ?? 1),
    order_id: String(params.orderId),
    action: String(params.action),
    actor: String(params.actorEmail),
    provider: String(params.provider ?? "QRIS"),
    transaction_id: String(params.transactionId ?? "N/A"),
    amount: Number(params.amount ?? 0),
    credits: Number(params.creditsGranted ?? 0),
    status_before: String(params.statusBefore ?? "N/A"),
    status_after: String(params.statusAfter ?? "N/A"),
    notes: String(params.notes ?? ""),
    previous_hash: String(params.previousHash),
    created_at: String(params.createdAt),
  });
}

// ─── Database Client ────────────────────────────────────────────────

let client: Client | undefined;

async function ensureSchema(db: Client): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      available_credits INTEGER NOT NULL DEFAULT 0,
      reserved_credits INTEGER NOT NULL DEFAULT 0,
      device_fingerprint TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_device_fingerprint ON users(device_fingerprint) WHERE device_fingerprint IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS credit_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      order_id TEXT,
      type TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS document_generations (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT,
      project_id TEXT,
      document_type TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      credits INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL,
      approval_token TEXT,
      approval_token_hash TEXT,
      approval_token_expires_at TEXT,
      approval_token_attempts INTEGER DEFAULT 0,
      proof_image TEXT,
      proof_sha256 TEXT,
      proof_storage_key TEXT,
      proof_url TEXT,
      proof_mime TEXT,
      proof_size INTEGER,
      proof_uploaded_at TEXT,
      ai_status TEXT,
      ai_analysis TEXT,
      ocr_merchant TEXT,
      ocr_nmid TEXT,
      ocr_amount TEXT,
      ocr_transaction_id TEXT,
      ocr_date TEXT,
      ocr_status TEXT,
      ocr_raw_result TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      paid_at TEXT,
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS verified_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      user_email TEXT NOT NULL,
      verified_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(provider, transaction_id)
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sequence INTEGER,
      key_version INTEGER DEFAULT 1,
      order_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      provider TEXT,
      transaction_id TEXT,
      amount INTEGER,
      credits_granted INTEGER,
      status_before TEXT,
      status_after TEXT,
      notes TEXT,
      previous_hash TEXT,
      entry_hash TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS credit_reservations (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      generation_id TEXT UNIQUE NOT NULL,
      amount INTEGER NOT NULL,
      document_type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      settled_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS project_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      project_id TEXT NOT NULL,
      document_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_email, project_id, document_type)
    )`,
    `CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      external_event_id TEXT NOT NULL,
      event_type TEXT,
      sender TEXT,
      payload_sha256 TEXT,
      status TEXT NOT NULL,
      received_at TEXT NOT NULL,
      processed_at TEXT,
      error_code TEXT,
      UNIQUE(provider, external_event_id)
    )`,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT,
      user_name TEXT NOT NULL,
      message TEXT NOT NULL,
      forwarded_to_admin INTEGER NOT NULL DEFAULT 0,
      admin_reply TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users(updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_document_generations_user_status ON document_generations(user_email, status)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_email, status)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_order_id ON audit_logs(order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_verified_transactions_trx ON verified_transactions(provider, transaction_id)`,
    `CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(provider, status)`,
    `CREATE INDEX IF NOT EXISTS idx_credit_reservations_user ON credit_reservations(user_email, status)`,
    `CREATE INDEX IF NOT EXISTS idx_project_docs_user_project ON project_documents(user_email, project_id, document_type)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_sequence ON audit_logs(sequence)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_payment_order ON credit_transactions(order_id, type) WHERE order_id IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_event ON webhook_events(provider, external_event_id)`,
    `ALTER TABLE users ADD COLUMN device_fingerprint TEXT`,
  ];

  for (const sql of statements) {
    try {
      await db.execute(sql);
    } catch {
      // ignore (index/trigger already exists)
    }
  }

  // Triggers
  try {
    await db.execute(`
      CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
      BEFORE UPDATE ON audit_logs
      BEGIN
          SELECT RAISE(ABORT, 'audit_logs are immutable');
      END
    `);
    await db.execute(`
      CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
      BEFORE DELETE ON audit_logs
      BEGIN
          SELECT RAISE(ABORT, 'audit_logs are immutable');
      END
    `);
  } catch {
    // Triggers already exist
  }
}

export async function getDatabase(): Promise<Client> {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) {
      throw new Error(
        "TURSO_DATABASE_URL is required. Set it in your environment variables."
      );
    }
    const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

    client = createClient({ url, authToken: authToken || undefined });
    await ensureSchema(client);
  }
  return client;
}

// ─── Audit Log ──────────────────────────────────────────────────────

export interface AuditLogParams {
  orderId: string;
  action: string;
  actorEmail: string;
  provider?: string;
  transactionId?: string;
  amount?: number;
  creditsGranted?: number;
  statusBefore?: string;
  statusAfter?: string;
  notes?: string;
  createdAt?: string;
}

export async function insertAuditLogEntry(
  db: DBExecutor,
  params: AuditLogParams,
): Promise<string> {
  const now = params.createdAt || new Date().toISOString();
  const amount = params.amount || 0;
  const creditsGranted = params.creditsGranted || 0;
  const provider = params.provider || "QRIS";
  const transactionId = params.transactionId || "N/A";
  const statusBefore = params.statusBefore || "N/A";
  const statusAfter = params.statusAfter || "N/A";
  const notes = params.notes || "";
  const keyVersion = 1;

  const lastEntryResult = await db.execute(
    "SELECT sequence, entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1",
  );
  const lastEntry = lastEntryResult.rows[0] as unknown as
    | { sequence?: number; entry_hash?: string }
    | undefined;

  const sequence = (lastEntry?.sequence || 0) + 1;
  const previousHash = lastEntry?.entry_hash || "GENESIS_BLOCK_DOKUMENKU_AI_2026";

  const canonicalPayload = buildCanonicalAuditPayload({
    sequence,
    keyVersion,
    orderId: params.orderId,
    action: params.action,
    actorEmail: params.actorEmail,
    provider,
    transactionId,
    amount,
    creditsGranted,
    statusBefore,
    statusAfter,
    notes,
    previousHash,
    createdAt: now,
  });

  const entryHash = createHmac("sha256", getAuditChainSecret())
    .update(canonicalPayload)
    .digest("hex");

  await db.execute({
    sql: `INSERT INTO audit_logs (
      sequence, key_version,
      order_id, action, actor_email, provider, transaction_id,
      amount, credits_granted, status_before, status_after, notes,
      previous_hash, entry_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      sequence,
      keyVersion,
      params.orderId,
      params.action,
      params.actorEmail,
      provider,
      transactionId,
      amount,
      creditsGranted,
      statusBefore,
      statusAfter,
      notes,
      previousHash,
      entryHash,
      now,
    ],
  });

  return entryHash;
}

export async function verifyAuditLogChain(
  db: DBExecutor,
  customSecretOrKeyMap?: string | Record<number, string>,
): Promise<{ ok: boolean; error?: string; tamperedLogId?: number; totalChecked: number }> {
  const defaultSecret = getAuditChainSecret();
  const keyMap: Record<number, string> =
    typeof customSecretOrKeyMap === "object" && customSecretOrKeyMap !== null
      ? customSecretOrKeyMap
      : { 1: typeof customSecretOrKeyMap === "string" ? customSecretOrKeyMap : defaultSecret };

  const result = await db.execute("SELECT * FROM audit_logs ORDER BY id ASC");
  const rows = result.rows as unknown as Array<{
    id: number;
    sequence?: number;
    key_version?: number;
    order_id: string;
    action: string;
    actor_email: string;
    provider?: string;
    transaction_id?: string;
    amount: number;
    credits_granted: number;
    status_before: string;
    status_after: string;
    notes?: string;
    previous_hash: string;
    entry_hash: string;
    created_at: string;
  }>;

  let expectedPrevHash = "GENESIS_BLOCK_DOKUMENKU_AI_2026";

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const actualSequence = row.sequence ?? idx + 1;
    const actualKeyVersion = row.key_version ?? 1;

    if (actualSequence !== idx + 1) {
      return {
        ok: false,
        error: `SEQUENCE_GAP_OR_FORK: Expected sequence ${idx + 1}, found ${actualSequence}`,
        tamperedLogId: row.id,
        totalChecked: rows.length,
      };
    }

    if (row.previous_hash !== expectedPrevHash) {
      return {
        ok: false,
        error: `PREVIOUS_HASH_MISMATCH: Chain broken at row ${row.id}`,
        tamperedLogId: row.id,
        totalChecked: rows.length,
      };
    }

    const secretForVersion = keyMap[actualKeyVersion] || keyMap[1] || defaultSecret;
    if (!secretForVersion) {
      return {
        ok: false,
        error: `UNKNOWN_AUDIT_KEY_VERSION: Key version ${actualKeyVersion} not configured`,
        tamperedLogId: row.id,
        totalChecked: rows.length,
      };
    }

    const canonicalPayload = buildCanonicalAuditPayload({
      sequence: actualSequence,
      keyVersion: actualKeyVersion,
      orderId: row.order_id,
      action: row.action,
      actorEmail: row.actor_email,
      provider: row.provider,
      transactionId: row.transaction_id,
      amount: row.amount,
      creditsGranted: row.credits_granted,
      statusBefore: row.status_before,
      statusAfter: row.status_after,
      notes: row.notes,
      previousHash: row.previous_hash,
      createdAt: row.created_at,
    });

    const calculatedHmac = createHmac("sha256", secretForVersion)
      .update(canonicalPayload)
      .digest("hex");
    if (!safeCompare(calculatedHmac, row.entry_hash)) {
      return {
        ok: false,
        error: `HMAC_VERIFICATION_FAILED: Audit row ${row.id} signature invalid`,
        tamperedLogId: row.id,
        totalChecked: rows.length,
      };
    }

    expectedPrevHash = row.entry_hash;
  }

  return { ok: true, totalChecked: rows.length };
}

export async function generateAuditCheckpoint(db: DBExecutor): Promise<{
  lastAuditId: number;
  totalLogs: number;
  chainHmac: string;
  generatedAt: string;
}> {
  const lastLogResult = await db.execute(
    "SELECT id, entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1",
  );
  const lastLog = lastLogResult.rows[0] as unknown as { id: number; entry_hash: string } | undefined;

  const countResult = await db.execute("SELECT COUNT(*) as count FROM audit_logs");
  const countRow = countResult.rows[0] as unknown as { count: number } | undefined;

  const now = new Date().toISOString();
  return {
    lastAuditId: lastLog?.id || 0,
    totalLogs: countRow?.count || 0,
    chainHmac: lastLog?.entry_hash || "GENESIS",
    generatedAt: now,
  };
}

// ─── Payment Approval (Atomic) ──────────────────────────────────────

export interface AtomicApprovalParams {
  orderId: string;
  actorEmail: string;
  provider?: string;
  transactionId?: string;
  token?: string;
  notes?: string;
}

export interface AtomicApprovalResult {
  ok: boolean;
  error?: string;
  order?: {
    id: string;
    user_email: string;
    amount: number;
    credits: number;
    status: string;
  };
  creditsGranted?: number;
}

export async function executeAtomicPaymentApproval(
  db: Client,
  params: AtomicApprovalParams,
): Promise<AtomicApprovalResult> {
  const { orderId, actorEmail, notes, token } = params;
  const now = new Date().toISOString();

  // 1. Initial State Check (read outside transaction)
  const orderResult = await db.execute({
    sql: "SELECT * FROM orders WHERE id = ?",
    args: [orderId],
  });
  const order = orderResult.rows[0] as unknown as
    | {
        id: string;
        user_email: string;
        plan_name: string;
        amount: number;
        credits: number;
        status: string;
        payment_method: string;
        ocr_transaction_id?: string;
        ocr_merchant?: string;
        approval_token_hash?: string;
        approval_token_expires_at?: string;
        approval_token_attempts?: number;
      }
    | undefined;

  if (!order) {
    await insertAuditLogEntry(db, {
      orderId,
      action: "PAYMENT_APPROVAL_DENIED",
      actorEmail,
      provider: "QRIS",
      transactionId: "N/A",
      amount: 0,
      creditsGranted: 0,
      statusBefore: "NOT_FOUND",
      statusAfter: "NOT_FOUND",
      notes: "Tagihan tidak ditemukan di database.",
      createdAt: now,
    });
    return { ok: false, error: `Tagihan ${orderId} tidak ditemukan.` };
  }

  // Token Expiration & Rate Limiting Check (outside transaction)
  if (token) {
    const computedHash = hashApprovalToken(token);

    if (order.approval_token_expires_at && new Date(order.approval_token_expires_at).getTime() < Date.now()) {
      await insertAuditLogEntry(db, {
        orderId: order.id,
        action: "PAYMENT_APPROVAL_DENIED",
        actorEmail,
        provider: order.payment_method || "QRIS",
        transactionId: order.ocr_transaction_id || "N/A",
        amount: order.amount,
        creditsGranted: 0,
        statusBefore: order.status,
        statusAfter: order.status,
        notes: "TOKEN_EXPIRED: Token approval telah kedaluwarsa (berlaku 10 menit).",
        createdAt: now,
      });
      return { ok: false, error: "TOKEN_EXPIRED: Token approval telah kedaluwarsa (berlaku 10 menit)." };
    }

    if ((order.approval_token_attempts || 0) >= 5) {
      await db.execute({
        sql: "UPDATE orders SET approval_token_hash = NULL WHERE id = ?",
        args: [order.id],
      });
      await insertAuditLogEntry(db, {
        orderId: order.id,
        action: "PAYMENT_APPROVAL_DENIED",
        actorEmail,
        provider: order.payment_method || "QRIS",
        transactionId: order.ocr_transaction_id || "N/A",
        amount: order.amount,
        creditsGranted: 0,
        statusBefore: order.status,
        statusAfter: order.status,
        notes: "TOKEN_LOCKED: Token terkunci karena melebihi batas maksimal percobaan (5x).",
        createdAt: now,
      });
      return { ok: false, error: "TOKEN_LOCKED: Token terkunci karena melebihi batas maksimal percobaan (5x)." };
    }

    if (order.approval_token_hash && !safeCompare(order.approval_token_hash, computedHash)) {
      await db.execute({
        sql: "UPDATE orders SET approval_token_attempts = COALESCE(approval_token_attempts, 0) + 1 WHERE id = ?",
        args: [order.id],
      });
      await insertAuditLogEntry(db, {
        orderId: order.id,
        action: "PAYMENT_APPROVAL_DENIED",
        actorEmail,
        provider: order.payment_method || "QRIS",
        transactionId: order.ocr_transaction_id || "N/A",
        amount: order.amount,
        creditsGranted: 0,
        statusBefore: order.status,
        statusAfter: order.status,
        notes: `TOKEN_MISMATCH: Percobaan token tidak cocok (Percobaan ke-${(order.approval_token_attempts || 0) + 1}/5).`,
        createdAt: now,
      });
      return { ok: false, error: "TOKEN_MISMATCH: Token approval yang dimasukkan tidak valid." };
    }
  }

  // STRICT REQUIREMENT: Only PENDING_REVIEW can transition to PAID
  if (order.status !== "PENDING_REVIEW") {
    await insertAuditLogEntry(db, {
      orderId: order.id,
      action: "PAYMENT_APPROVAL_DENIED",
      actorEmail,
      provider: order.payment_method || "QRIS",
      transactionId: order.ocr_transaction_id || "N/A",
      amount: order.amount,
      creditsGranted: 0,
      statusBefore: order.status,
      statusAfter: order.status,
      notes: `INVALID_PAYMENT_STATE: Percobaan approval ditolak karena status saat ini '${order.status}' (bukan PENDING_REVIEW).`,
      createdAt: now,
    });

    if (order.status === "PAID" || order.status === "paid") {
      return { ok: false, error: `Tagihan ${order.id} sudah berstatus LUNAS (PAID) sebelumnya (ALREADY_PROCESSED).` };
    }
    return {
      ok: false,
      error: `INVALID_PAYMENT_STATE: Tagihan ${order.id} tidak dapat disetujui karena berstatus '${order.status}'. Hanya tagihan yang lolos pre-validasi (PENDING_REVIEW) yang dapat disetujui.`,
    };
  }

  // ── Atomic Write Transaction ──────────────────────────────────────
  const tx = await db.transaction("write");
  try {
    const provider = params.provider || order.payment_method || "QRIS";
    const externalTrxId =
      params.transactionId || order.ocr_transaction_id || `MANUAL-${order.id}-${Date.now()}`;

    // 1. Guard against duplicate external transaction IDs
    if (externalTrxId && !externalTrxId.startsWith("MANUAL-")) {
      const existingTrxResult = await tx.execute({
        sql: "SELECT order_id FROM verified_transactions WHERE provider = ? AND transaction_id = ?",
        args: [provider, externalTrxId],
      });
      const existingTrx = existingTrxResult.rows[0] as unknown as { order_id: string } | undefined;

      if (existingTrx && existingTrx.order_id !== order.id) {
        await tx.rollback();
        await insertAuditLogEntry(db, {
          orderId: order.id,
          action: "PAYMENT_APPROVAL_DENIED",
          actorEmail,
          provider,
          transactionId: externalTrxId,
          amount: order.amount,
          creditsGranted: 0,
          statusBefore: order.status,
          statusAfter: order.status,
          notes: `DUPLICATE_TRANSACTION: ID Transaksi ${externalTrxId} sudah pernah digunakan pada invoice ${existingTrx.order_id}.`,
          createdAt: now,
        });
        return {
          ok: false,
          error: `DUPLICATE_TRANSACTION: ID Transaksi ${externalTrxId} sudah pernah digunakan untuk invoice ${existingTrx.order_id}.`,
        };
      }
    }

    // 2. Lock & Update order status to PAID (STRICT: WHERE status = 'PENDING_REVIEW')
    const updateOrderRes = await tx.execute({
      sql: `UPDATE orders
        SET status = 'PAID',
            ai_status = 'approved_by_admin',
            paid_at = ?,
            approval_token = NULL,
            approval_token_hash = NULL,
            ai_analysis = ?
        WHERE id = ? AND status = 'PENDING_REVIEW'`,
      args: [now, notes || `Diverifikasi & Disetujui oleh ${actorEmail}`, order.id],
    });

    if (updateOrderRes.rowsAffected !== 1) {
      await tx.rollback();
      return { ok: false, error: "Konflik transaksi: Tagihan telah diubah oleh proses paralel lain." };
    }

    // 3. Record verified transaction unique record (Layer 1 Idempotency)
    try {
      await tx.execute({
        sql: `INSERT INTO verified_transactions (provider, transaction_id, order_id, amount, user_email, verified_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [provider, externalTrxId, order.id, order.amount, order.user_email, actorEmail, now],
      });
    } catch {
      await tx.rollback();
      return {
        ok: false,
        error: `ID Transaksi ${externalTrxId} terdeteksi duplikat pada level database constraint (verified_transactions).`,
      };
    }

    // 4. Increment user credits
    const creditIncrement = order.credits || 100;
    const updateUserRes = await tx.execute({
      sql: "UPDATE users SET available_credits = available_credits + ?, updated_at = ? WHERE email = ?",
      args: [creditIncrement, now, order.user_email],
    });

    if (updateUserRes.rowsAffected !== 1) {
      await tx.execute({
        sql: "INSERT INTO users (email, password_hash, password_salt, available_credits, created_at, updated_at) VALUES (?, 'oauth', 'oauth', ?, ?, ?)",
        args: [order.user_email, creditIncrement, now, now],
      });
    }

    // 5. Insert credit ledger entry (Layer 2 Idempotency: UNIQUE(order_id, type))
    try {
      await tx.execute({
        sql: `INSERT INTO credit_transactions (user_email, amount, reason, order_id, type, created_at)
          VALUES (?, ?, ?, ?, 'PAYMENT_PURCHASE', ?)`,
        args: [
          order.user_email,
          creditIncrement,
          `Pembelian ${order.plan_name} (${order.id}) • Diverifikasi oleh ${actorEmail}`,
          order.id,
          now,
        ],
      });
    } catch {
      await tx.rollback();
      return {
        ok: false,
        error: `Invoice ${order.id} terdeteksi sudah pernah memberikan kredit sebelumnya (uq_credit_payment_order constraint violation).`,
      };
    }

    // 6. Insert tamper-evident cryptographic hash-chained audit log
    await insertAuditLogEntry(tx, {
      orderId: order.id,
      action: "PAYMENT_APPROVED",
      actorEmail,
      provider,
      transactionId: externalTrxId,
      amount: order.amount,
      creditsGranted: creditIncrement,
      statusBefore: "PENDING_REVIEW",
      statusAfter: "PAID",
      notes: notes || `Approval konfirmasi mutasi riil oleh ${actorEmail}`,
      createdAt: now,
    });

    await tx.commit();

    return {
      ok: true,
      order: {
        id: order.id,
        user_email: order.user_email,
        amount: order.amount,
        credits: order.credits,
        status: "PAID",
      },
      creditsGranted: creditIncrement,
    };
  } catch (err) {
    await tx.rollback();
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal mengeksekusi transaksi approval di database.",
    };
  }
}

// ─── Admin Verification ─────────────────────────────────────────────

export async function verifyAdminInDatabase(
  db: Client,
  emailCandidate: string,
  passwordCandidate: string,
): Promise<{ ok: boolean; email?: string; error?: string }> {
  const normEmail = emailCandidate.trim().toLowerCase();

  const adminResult = await db.execute({
    sql: "SELECT * FROM admins WHERE LOWER(email) = LOWER(?)",
    args: [normEmail],
  });
  let admin = adminResult.rows[0] as unknown as
    | {
        id: string;
        email: string;
        password_hash: string;
        password_salt: string;
        is_active: number;
      }
    | undefined;

  const adminCountResult = await db.execute("SELECT COUNT(*) as count FROM admins");
  const totalAdmins = (adminCountResult.rows[0]?.count as number) || 0;

  // Single-use auto-bootstrap
  if (totalAdmins === 0) {
    const envAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const envBootstrapPassword =
      process.env.ADMIN_BOOTSTRAP_PASSWORD || process.env.ADMIN_PASSWORD;

    if (envAdminEmail && envBootstrapPassword && envAdminEmail === normEmail) {
      const salt = randomBytes(16).toString("base64url");
      const hash = scryptSync(envBootstrapPassword, salt, 64).toString("base64url");
      const now = new Date().toISOString();
      const adminId = "admin-" + randomBytes(8).toString("hex");

      try {
        await db.execute({
          sql: `INSERT INTO admins (id, email, password_hash, password_salt, role, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'admin', 1, ?, ?)`,
          args: [adminId, normEmail, hash, salt, now, now],
        });

        admin = {
          id: adminId,
          email: normEmail,
          password_hash: hash,
          password_salt: salt,
          is_active: 1,
        };
        console.log(`[ADMIN BOOTSTRAP] Akun administrator pertama (${normEmail}) berhasil di-bootstrap ke database.`);
      } catch {
        // Race condition: another request already inserted. Re-query.
        const retryResult = await db.execute({
          sql: "SELECT * FROM admins WHERE LOWER(email) = LOWER(?)",
          args: [normEmail],
        });
        admin = retryResult.rows[0] as unknown as typeof admin;
      }
    }
  } else if (process.env.ADMIN_BOOTSTRAP_PASSWORD) {
    console.warn("⚠️ [SECURITY_WARNING] ADMIN_BOOTSTRAP_PASSWORD is still configured after administrator initialization.");
  }

  if (!admin) {
    return { ok: false, error: "Akun administrator tidak terdaftar di database." };
  }

  if (!admin.is_active) {
    return { ok: false, error: "Akun administrator sedang dinonaktifkan." };
  }

  try {
    const candidateHash = scryptSync(passwordCandidate, admin.password_salt, 64).toString("base64url");
    const bufA = Buffer.from(candidateHash);
    const bufB = Buffer.from(admin.password_hash);
    const isValid = bufA.length === bufB.length && timingSafeEqual(bufA, bufB);

    if (!isValid) {
      return { ok: false, error: "Kata sandi administrator salah." };
    }

    return { ok: true, email: admin.email };
  } catch {
    return { ok: false, error: "Gagal memverifikasi kata sandi administrator." };
  }
}

// ─── Credit Reservation (Two-Phase) ─────────────────────────────────

export async function reserveCredits(
  db: Client,
  {
    userEmail,
    generationId,
    amount = 1,
    documentType,
    projectId = "default_project",
    expiresInMinutes = 15,
  }: {
    userEmail: string;
    generationId: string;
    amount?: number;
    documentType: string;
    projectId?: string;
    expiresInMinutes?: number;
  },
): Promise<{ ok: boolean; error?: string; remainingCredits?: number }> {
  const normEmail = userEmail.trim().toLowerCase();
  const now = new Date().toISOString();

  // 1. Check if reservation already exists
  const existingResult = await db.execute({
    sql: "SELECT * FROM credit_reservations WHERE generation_id = ?",
    args: [generationId],
  });
  if (existingResult.rows[0]) {
    return { ok: false, error: "CREDIT_RESERVATION_EXISTS" };
  }

  // 2. Check user available balance
  const userResult = await db.execute({
    sql: "SELECT available_credits, reserved_credits FROM users WHERE email = ?",
    args: [normEmail],
  });
  const user = userResult.rows[0] as unknown as { available_credits: number; reserved_credits: number } | undefined;

  if (!user || user.available_credits < amount) {
    return { ok: false, error: "CREDIT_INSUFFICIENT" };
  }

  const reservationId = "res_" + randomBytes(8).toString("hex");

  // 3. Atomic write transaction
  const tx = await db.transaction("write");
  try {
    await tx.execute({
      sql: `INSERT INTO credit_reservations (id, user_email, generation_id, amount, document_type, status, created_at, settled_at)
        VALUES (?, ?, ?, ?, ?, 'RESERVED', ?, NULL)`,
      args: [reservationId, normEmail, generationId, amount, documentType, now],
    });

    const updateRes = await tx.execute({
      sql: `UPDATE users
        SET available_credits = available_credits - ?,
            reserved_credits = COALESCE(reserved_credits, 0) + ?,
            updated_at = ?
        WHERE email = ? AND available_credits >= ?`,
      args: [amount, amount, now, normEmail, amount],
    });

    if (updateRes.rowsAffected !== 1) {
      await tx.rollback();
      return { ok: false, error: "CREDIT_INSUFFICIENT" };
    }

    await tx.execute({
      sql: `INSERT INTO credit_transactions (user_email, amount, reason, order_id, type, created_at)
        VALUES (?, ?, ?, ?, 'AI_CREDIT_RESERVED', ?)`,
      args: [normEmail, -amount, `Reservasi kredit pembuatan ${documentType} (${generationId})`, generationId, now],
    });

    await tx.commit();

    const updatedResult = await db.execute({
      sql: "SELECT available_credits FROM users WHERE email = ?",
      args: [normEmail],
    });
    const updated = updatedResult.rows[0] as unknown as unknown as { available_credits: number };
    return { ok: true, remainingCredits: updated.available_credits };
  } catch (err) {
    await tx.rollback();
    return { ok: false, error: err instanceof Error ? err.message : "CREDIT_RESERVATION_FAILED" };
  }
}

export async function captureCredits(
  db: Client,
  { generationId }: { generationId: string },
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();

  const resResult = await db.execute({
    sql: "SELECT * FROM credit_reservations WHERE generation_id = ?",
    args: [generationId],
  });
  const res = resResult.rows[0] as unknown as
    | { id: string; user_email: string; amount: number; document_type: string; status: string }
    | undefined;

  if (!res) return { ok: false, error: "CREDIT_RESERVATION_NOT_FOUND" };
  if (res.status === "CAPTURED") return { ok: true };
  if (res.status !== "RESERVED") return { ok: false, error: "CREDIT_RESERVATION_INVALID_STATE" };

  const tx = await db.transaction("write");
  try {
    await tx.execute({
      sql: "UPDATE credit_reservations SET status = 'CAPTURED', settled_at = ? WHERE generation_id = ?",
      args: [now, generationId],
    });

    const update = await tx.execute({
      sql: `UPDATE users SET reserved_credits = reserved_credits - ?, updated_at = ? WHERE email = ? AND reserved_credits >= ?`,
      args: [res.amount, now, res.user_email, res.amount],
    });

    if (update.rowsAffected !== 1) {
      await tx.rollback();
      return { ok: false, error: "CREDIT_BALANCE_INVARIANT_VIOLATION" };
    }

    await tx.execute({
      sql: `INSERT INTO credit_transactions (user_email, amount, reason, order_id, type, created_at)
        VALUES (?, 0, ?, ?, 'AI_CREDIT_CAPTURED', ?)`,
      args: [res.user_email, `Penggunaan final kredit ${res.document_type} (${generationId})`, generationId, now],
    });

    await tx.commit();
    return { ok: true };
  } catch (err) {
    await tx.rollback();
    return { ok: false, error: err instanceof Error ? err.message : "CREDIT_CAPTURE_FAILED" };
  }
}

export async function releaseCredits(
  db: Client,
  { generationId, reason }: { generationId: string; reason?: string },
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();

  const resResult = await db.execute({
    sql: "SELECT * FROM credit_reservations WHERE generation_id = ?",
    args: [generationId],
  });
  const res = resResult.rows[0] as unknown as
    | { id: string; user_email: string; amount: number; document_type: string; status: string }
    | undefined;

  if (!res) return { ok: false, error: "CREDIT_RESERVATION_NOT_FOUND" };
  if (res.status === "RELEASED") return { ok: true };
  if (res.status !== "RESERVED") return { ok: false, error: "CREDIT_RESERVATION_INVALID_STATE" };

  const tx = await db.transaction("write");
  try {
    await tx.execute({
      sql: "UPDATE credit_reservations SET status = 'RELEASED', settled_at = ? WHERE generation_id = ?",
      args: [now, generationId],
    });

    const update = await tx.execute({
      sql: `UPDATE users
        SET available_credits = available_credits + ?,
            reserved_credits = reserved_credits - ?,
            updated_at = ?
        WHERE email = ? AND reserved_credits >= ?`,
      args: [res.amount, res.amount, now, res.user_email, res.amount],
    });

    if (update.rowsAffected !== 1) {
      await tx.rollback();
      return { ok: false, error: "CREDIT_BALANCE_INVARIANT_VIOLATION" };
    }

    await tx.execute({
      sql: `INSERT INTO credit_transactions (user_email, amount, reason, order_id, type, created_at)
        VALUES (?, ?, ?, ?, 'AI_CREDIT_RELEASED', ?)`,
      args: [
        res.user_email,
        res.amount,
        `Pengembalian reservasi kredit ${res.document_type}: ${reason || "AI Generation Failed"}`,
        generationId,
        now,
      ],
    });

    await tx.commit();
    return { ok: true };
  } catch (err) {
    await tx.rollback();
    return { ok: false, error: err instanceof Error ? err.message : "CREDIT_RELEASE_FAILED" };
  }
}

// ─── Document Finalization (Atomic) ─────────────────────────────────

export async function executeAtomicDocumentFinalization(
  db: Client,
  {
    userEmail,
    projectId,
    documentType,
    fileName,
    content,
    generationId,
  }: {
    userEmail: string;
    projectId: string;
    documentType: "PRD" | "TECH_SPEC" | "UI_UX" | "AI_CONTEXT";
    fileName: string;
    content: string;
    generationId: string;
  },
): Promise<{ ok: boolean; error?: string; availableCredits?: number; reservedCredits?: number; alreadyProcessed?: boolean }> {
  const normEmail = userEmail.trim().toLowerCase();
  const now = new Date().toISOString();

  // 1. Validate Credit Reservation Existence
  const resResult = await db.execute({
    sql: "SELECT * FROM credit_reservations WHERE generation_id = ?",
    args: [generationId],
  });
  const res = resResult.rows[0] as unknown as
    | { id: string; user_email: string; amount: number; document_type: string; status: string }
    | undefined;

  if (!res) return { ok: false, error: "CREDIT_RESERVATION_NOT_FOUND" };

  // 2. Validate Generation Domain Existence
  const genResult = await db.execute({
    sql: "SELECT status FROM document_generations WHERE id = ?",
    args: [generationId],
  });
  const gen = genResult.rows[0] as unknown as { status: string } | undefined;

  if (!gen) return { ok: false, error: "RESOURCE_NOT_FOUND" };

  // 3. Handle Idempotency on Already CAPTURED Reservation
  if (res.status === "CAPTURED") {
    if (gen.status !== "COMPLETED") {
      return { ok: false, error: "GENERATION_STATE_INVARIANT_VIOLATION" };
    }
    const userResult = await db.execute({
      sql: "SELECT available_credits, reserved_credits FROM users WHERE email = ?",
      args: [normEmail],
    });
    const user = userResult.rows[0] as unknown as { available_credits: number; reserved_credits: number } | undefined;
    return {
      ok: true,
      alreadyProcessed: true,
      availableCredits: (user?.available_credits as number) ?? 0,
      reservedCredits: (user?.reserved_credits as number) ?? 0,
    };
  }

  // 4. Validate Credit Reservation State (strictly RESERVED)
  if (res.status !== "RESERVED") return { ok: false, error: "CREDIT_RESERVATION_INVALID_STATE" };

  // 5. Validate Generation Domain State (strictly GENERATING or FINALIZE_FAILED)
  if (gen.status !== "GENERATING" && gen.status !== "FINALIZE_FAILED") {
    return { ok: false, error: "GENERATION_INVALID_STATE" };
  }

  // ── Atomic Write Transaction ──────────────────────────────────────
  const tx = await db.transaction("write");
  try {
    // 1. Save Document (UPSERT)
    await tx.execute({
      sql: `INSERT INTO project_documents (user_email, project_id, document_type, file_name, content, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
        ON CONFLICT(user_email, project_id, document_type) DO UPDATE SET
          file_name = excluded.file_name,
          content = excluded.content,
          status = 'COMPLETED',
          updated_at = excluded.updated_at`,
      args: [normEmail, projectId, documentType, fileName, content, now, now],
    });

    // 2. Mark reservation as CAPTURED
    await tx.execute({
      sql: "UPDATE credit_reservations SET status = 'CAPTURED', settled_at = ? WHERE generation_id = ?",
      args: [now, generationId],
    });

    // 3. Update User Balance with strict invariant assertion
    const update = await tx.execute({
      sql: `UPDATE users
        SET reserved_credits = reserved_credits - ?,
            updated_at = ?
        WHERE email = ? AND reserved_credits >= ?`,
      args: [res.amount, now, normEmail, res.amount],
    });

    if (update.rowsAffected !== 1) {
      throw new Error("CREDIT_BALANCE_INVARIANT_VIOLATION");
    }

    // 4. Record Ledger Entry
    await tx.execute({
      sql: `INSERT INTO credit_transactions (user_email, amount, reason, order_id, type, created_at)
        VALUES (?, 0, ?, ?, 'AI_CREDIT_CAPTURED', ?)`,
      args: [normEmail, `Penyelesaian finalisasi dokumen ${documentType} (${generationId})`, generationId, now],
    });

    // 5. Update generation job to COMPLETED
    await tx.execute({
      sql: "UPDATE document_generations SET status = 'COMPLETED', completed_at = ? WHERE id = ?",
      args: [now, generationId],
    });

    await tx.commit();

    const userResult = await db.execute({
      sql: "SELECT available_credits, reserved_credits FROM users WHERE email = ?",
      args: [normEmail],
    });
    const user = userResult.rows[0] as unknown as { available_credits: number; reserved_credits: number } | undefined;
    return {
      ok: true,
      availableCredits: (user?.available_credits as number) ?? 0,
      reservedCredits: (user?.reserved_credits as number) ?? 0,
    };
  } catch (err) {
    await tx.rollback();

    // Record FINALIZE_FAILED on document_generations AFTER rollback
    try {
      await db.execute({
        sql: "UPDATE document_generations SET status = 'FINALIZE_FAILED', completed_at = ? WHERE id = ?",
        args: [now, generationId],
      });
    } catch {
      // ignore
    }

    return { ok: false, error: err instanceof Error ? err.message : "FINALIZE_FAILED" };
  }
}

// ─── Project Documents ──────────────────────────────────────────────

export async function saveProjectDocument(
  db: Client,
  {
    userEmail,
    projectId,
    documentType,
    fileName,
    content,
  }: {
    userEmail: string;
    projectId: string;
    documentType: "PRD" | "TECH_SPEC" | "UI_UX" | "AI_CONTEXT";
    fileName: string;
    content: string;
  },
): Promise<void> {
  const normEmail = userEmail.trim().toLowerCase();
  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO project_documents (user_email, project_id, document_type, file_name, content, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
      ON CONFLICT(user_email, project_id, document_type) DO UPDATE SET
        file_name = excluded.file_name,
        content = excluded.content,
        status = 'COMPLETED',
        updated_at = excluded.updated_at`,
    args: [normEmail, projectId, documentType, fileName, content, now, now],
  });
}

export async function checkProjectDependencies(
  db: Client,
  {
    userEmail,
    projectId,
    documentType,
  }: {
    userEmail: string;
    projectId: string;
    documentType: "PRD" | "TECH_SPEC" | "UI_UX" | "AI_CONTEXT";
  },
): Promise<{ ok: boolean; missingDependency?: string }> {
  const normEmail = userEmail.trim().toLowerCase();

  if (documentType === "PRD") return { ok: true };

  const deps: Array<{ type: string; needed: string }> = [];
  if (documentType === "TECH_SPEC") deps.push({ type: "PRD", needed: "PRD" });
  if (documentType === "UI_UX") {
    deps.push({ type: "PRD", needed: "PRD" });
    deps.push({ type: "TECH_SPEC", needed: "TECH_SPEC" });
  }
  if (documentType === "AI_CONTEXT") {
    deps.push({ type: "PRD", needed: "PRD" });
    deps.push({ type: "TECH_SPEC", needed: "TECH_SPEC" });
    deps.push({ type: "UI_UX", needed: "UI_UX" });
  }

  for (const dep of deps) {
    const result = await db.execute({
      sql: `SELECT id FROM project_documents
        WHERE LOWER(user_email) = LOWER(?) AND project_id = ? AND document_type = ? AND status = 'COMPLETED'`,
      args: [normEmail, projectId, dep.type],
    });
    if (result.rows.length === 0) {
      return { ok: false, missingDependency: dep.needed };
    }
  }

  return { ok: true };
}
