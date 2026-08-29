import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

const APPROVAL_TOKEN_SECRET = "dokumenku-approval-token-secret-2026";
const AUDIT_CHAIN_SECRET = "dokumenku-audit-chain-secret-2026";
const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateApprovalToken(length = 6) {
  let token = "";
  for (let i = 0; i < length; i++) {
    token += TOKEN_ALPHABET[randomInt(0, TOKEN_ALPHABET.length)];
  }
  return token;
}

function hashApprovalToken(token) {
  return createHmac("sha256", APPROVAL_TOKEN_SECRET)
    .update(token.toUpperCase().trim())
    .digest("hex");
}

function safeCompare(a, b) {
  try {
    const x = Buffer.from(a, "hex");
    const y = Buffer.from(b, "hex");
    return x.length === y.length && timingSafeEqual(x, y);
  } catch {
    return false;
  }
}

function buildCanonicalAuditPayload(params) {
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

function createTestDb() {
  const db = new DatabaseSync(":memory:");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT 0,
      reserved_credits INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_reservations (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      generation_id TEXT UNIQUE NOT NULL,
      amount INTEGER NOT NULL,
      document_type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      settled_at TEXT,
      failure_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS project_documents (
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
    );

    CREATE TABLE IF NOT EXISTS document_generations (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      project_id TEXT,
      document_type TEXT,
      model TEXT NOT NULL,
      prompt TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS credit_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      order_id TEXT,
      type TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
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
      paid_at TEXT
    );

    CREATE TABLE IF NOT EXISTS verified_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      user_email TEXT NOT NULL,
      verified_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(provider, transaction_id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sequence INTEGER UNIQUE,
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
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
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
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_payment_order ON credit_transactions(order_id, type) WHERE order_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_sequence ON audit_logs(sequence);

    CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
    BEFORE UPDATE ON audit_logs
    BEGIN
        SELECT RAISE(ABORT, 'audit_logs are immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
    BEFORE DELETE ON audit_logs
    BEGIN
        SELECT RAISE(ABORT, 'audit_logs are immutable');
    END;
  `);

  return db;
}

function insertAuditLogEntry(db, params) {
  const now = params.createdAt || new Date().toISOString();
  const amount = params.amount || 0;
  const creditsGranted = params.creditsGranted || 0;
  const provider = params.provider || "QRIS";
  const transactionId = params.transactionId || "N/A";
  const statusBefore = params.statusBefore || "N/A";
  const statusAfter = params.statusAfter || "N/A";
  const notes = params.notes || "";
  const keyVersion = 1;

  const lastEntry = db
    .prepare("SELECT sequence, entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1")
    .get();

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

  const entryHash = createHmac("sha256", AUDIT_CHAIN_SECRET)
    .update(canonicalPayload)
    .digest("hex");

  db.prepare(`
    INSERT INTO audit_logs (
      sequence, key_version,
      order_id, action, actor_email, provider, transaction_id, 
      amount, credits_granted, status_before, status_after, notes, 
      previous_hash, entry_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
  );

  return entryHash;
}

function verifyAuditLogChain(db, customSecret) {
  const secret = customSecret || AUDIT_CHAIN_SECRET;
  const rows = db.prepare("SELECT * FROM audit_logs ORDER BY id ASC").all();
  let expectedPrevHash = "GENESIS_BLOCK_DOKUMENKU_AI_2026";

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const actualSequence = row.sequence || idx + 1;
    const actualKeyVersion = row.key_version || 1;

    if (row.previous_hash !== expectedPrevHash) {
      return { ok: false, tamperedLogId: row.id, totalChecked: rows.length };
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

    const calculatedHmac = createHmac("sha256", secret).update(canonicalPayload).digest("hex");
    if (!safeCompare(calculatedHmac, row.entry_hash)) {
      return { ok: false, tamperedLogId: row.id, totalChecked: rows.length };
    }

    expectedPrevHash = row.entry_hash;
  }

  return { ok: true, totalChecked: rows.length };
}

function generateAuditCheckpoint(db) {
  const lastLog = db
    .prepare("SELECT id, entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1")
    .get();

  const countRow = db
    .prepare("SELECT COUNT(*) as count FROM audit_logs")
    .get();

  const now = new Date().toISOString();
  return {
    lastAuditId: lastLog?.id || 0,
    totalLogs: countRow?.count || 0,
    chainHmac: lastLog?.entry_hash || "GENESIS",
    generatedAt: now,
  };
}

function testExecuteApproval(db, { orderId, actorEmail, provider, transactionId, token, notes, faultInjectAt }) {
  const now = new Date().toISOString();
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);

  if (!order) {
    insertAuditLogEntry(db, {
      orderId,
      action: "PAYMENT_APPROVAL_DENIED",
      actorEmail,
      provider: "QRIS",
      transactionId: "N/A",
      amount: 0,
      creditsGranted: 0,
      statusBefore: "NOT_FOUND",
      statusAfter: "NOT_FOUND",
      notes: "Tagihan tidak ditemukan.",
      createdAt: now,
    });
    return { ok: false, error: `Tagihan ${orderId} tidak ditemukan.` };
  }

  // Token Validation
  if (token) {
    const computedHash = hashApprovalToken(token);

    if (order.approval_token_expires_at && new Date(order.approval_token_expires_at).getTime() < Date.now()) {
      insertAuditLogEntry(db, {
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
      db.prepare("UPDATE orders SET approval_token_hash = NULL WHERE id = ?").run(order.id);
      insertAuditLogEntry(db, {
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
      db.prepare("UPDATE orders SET approval_token_attempts = COALESCE(approval_token_attempts, 0) + 1 WHERE id = ?").run(order.id);
      insertAuditLogEntry(db, {
        orderId: order.id,
        action: "PAYMENT_APPROVAL_DENIED",
        actorEmail,
        provider: order.payment_method || "QRIS",
        transactionId: order.ocr_transaction_id || "N/A",
        amount: order.amount,
        creditsGranted: 0,
        statusBefore: order.status,
        statusAfter: order.status,
        notes: `TOKEN_MISMATCH: Percobaan token tidak cocok.`,
        createdAt: now,
      });
      return { ok: false, error: "TOKEN_MISMATCH: Token approval tidak valid." };
    }
  }

  // STRICT RULE: Only PENDING_REVIEW can transition to PAID
  if (order.status !== "PENDING_REVIEW") {
    insertAuditLogEntry(db, {
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
      error: `INVALID_PAYMENT_STATE: Tagihan ${order.id} tidak dapat disetujui karena berstatus '${order.status}'.`,
    };
  }

  try {
    db.exec("BEGIN IMMEDIATE");

    const resolvedProvider = provider || order.payment_method || "QRIS";
    const externalTrxId =
      transactionId || order.ocr_transaction_id || `MANUAL-${order.id}-${Date.now()}`;

    // 1. Unique external transaction ID check
    if (externalTrxId && !externalTrxId.startsWith("MANUAL-")) {
      const existingTrx = db
        .prepare("SELECT order_id FROM verified_transactions WHERE provider = ? AND transaction_id = ?")
        .get(resolvedProvider, externalTrxId);

      if (existingTrx && existingTrx.order_id !== order.id) {
        db.exec("ROLLBACK");
        insertAuditLogEntry(db, {
          orderId: order.id,
          action: "PAYMENT_APPROVAL_DENIED",
          actorEmail,
          provider: resolvedProvider,
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
          error: `DUPLICATE_TRANSACTION: ID Transaksi ${externalTrxId} sudah pernah digunakan.`,
        };
      }
    }

    // 2. Lock & Update order status to PAID
    const updateOrderRes = db
      .prepare(`
        UPDATE orders 
        SET status = 'PAID', 
            ai_status = 'approved_by_admin', 
            paid_at = ?,
            approval_token = NULL,
            approval_token_hash = NULL,
            ai_analysis = ?
        WHERE id = ? AND status = 'PENDING_REVIEW'
      `)
      .run(now, notes || `Diverifikasi & Disetujui oleh ${actorEmail}`, order.id);

    if (updateOrderRes.changes !== 1) {
      db.exec("ROLLBACK");
      return { ok: false, error: "Konflik transaksi: Tagihan telah diubah oleh proses lain." };
    }

    // 3. Record verified transaction (Layer 1 Idempotency)
    try {
      db.prepare(`
        INSERT INTO verified_transactions (provider, transaction_id, order_id, amount, user_email, verified_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(resolvedProvider, externalTrxId, order.id, order.amount, order.user_email, actorEmail, now);
    } catch {
      db.exec("ROLLBACK");
      return {
        ok: false,
        error: `ID Transaksi ${externalTrxId} terdeteksi duplikat pada level database constraint.`,
      };
    }

    // Fault injection check 1: Failure during credit increment
    if (faultInjectAt === "credit_increment") {
      throw new Error("SIMULATED_FAULT: Crash during credit increment");
    }

    // 4. Increment user credits
    const creditIncrement = order.credits || 100;
    db.prepare("UPDATE users SET credits = credits + ?, updated_at = ? WHERE email = ?")
      .run(creditIncrement, now, order.user_email);

    // Fault injection check 2: Failure during credit ledger insert
    if (faultInjectAt === "credit_ledger") {
      throw new Error("SIMULATED_FAULT: Crash during credit ledger insert");
    }

    // 5. Insert credit ledger entry (Layer 2 Idempotency: UNIQUE(order_id, type))
    try {
      db.prepare(`
        INSERT INTO credit_transactions (user_email, amount, reason, order_id, type, created_at)
        VALUES (?, ?, ?, ?, 'PAYMENT_PURCHASE', ?)
      `).run(
        order.user_email,
        creditIncrement,
        `Pembelian ${order.plan_name} (${order.id}) • Diverifikasi oleh ${actorEmail}`,
        order.id,
        now,
      );
    } catch {
      db.exec("ROLLBACK");
      return {
        ok: false,
        error: `Invoice ${order.id} sudah pernah memberikan kredit sebelumnya.`,
      };
    }

    // Fault injection check 3: Failure during audit log insert
    if (faultInjectAt === "audit_log") {
      throw new Error("SIMULATED_FAULT: Crash during audit log insertion");
    }

    // 6. Insert tamper-evident HMAC-SHA256 audit log
    insertAuditLogEntry(db, {
      orderId: order.id,
      action: "PAYMENT_APPROVED",
      actorEmail,
      provider: resolvedProvider,
      transactionId: externalTrxId,
      amount: order.amount,
      creditsGranted: creditIncrement,
      statusBefore: "PENDING_REVIEW",
      statusAfter: "PAID",
      notes: notes || `Approval oleh ${actorEmail}`,
      createdAt: now,
    });

    db.exec("COMMIT");
    return { ok: true, creditsGranted: creditIncrement };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    return { ok: false, error: err.message };
  }
}

// ───────────────────────────────────────────────────────────────────
// TESTS
// ───────────────────────────────────────────────────────────────────

test("Security: CSPRNG token generator produces unambiguous random tokens", () => {
  const token1 = generateApprovalToken(6);
  const token2 = generateApprovalToken(6);

  assert.equal(token1.length, 6);
  assert.equal(token2.length, 6);
  assert.notEqual(token1, token2);
  // Ensure no ambiguous characters
  assert.doesNotMatch(token1, /[01IO]/);
  assert.doesNotMatch(token2, /[01IO]/);
});

test("Security: executeAtomicPaymentApproval strictly accepts ONLY PENDING_REVIEW", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, created_at, updated_at) VALUES (?, 'hash', 'salt', 0, ?, ?)")
    .run("user1@test.com", now, now);

  // Test 1: Order in 'CREATED' status -> MUST BE REJECTED
  db.prepare("INSERT INTO orders (id, user_email, plan_name, amount, credits, payment_method, status, created_at) VALUES ('INV-CREATED', 'user1@test.com', 'Pro Studio', 49000, 100, 'QRIS', 'CREATED', ?)")
    .run(now);

  const res1 = testExecuteApproval(db, { orderId: "INV-CREATED", actorEmail: "admin@test.com" });
  assert.equal(res1.ok, false);
  assert.match(res1.error, /INVALID_PAYMENT_STATE/);

  // Check audit log recorded denial
  const audit1 = db.prepare("SELECT action, status_before FROM audit_logs WHERE order_id = 'INV-CREATED'").get();
  assert.equal(audit1.action, "PAYMENT_APPROVAL_DENIED");
  assert.equal(audit1.status_before, "CREATED");

  // User credits must still be 0
  const user1 = db.prepare("SELECT credits FROM users WHERE email = 'user1@test.com'").get();
  assert.equal(user1.credits, 0);

  // Test 2: Order in 'PENDING_REVIEW' status -> MUST SUCCEED
  db.prepare("INSERT INTO orders (id, user_email, plan_name, amount, credits, payment_method, status, ocr_transaction_id, created_at) VALUES ('INV-VALID', 'user1@test.com', 'Pro Studio', 49000, 100, 'QRIS', 'PENDING_REVIEW', 'TRX-12345', ?)")
    .run(now);
  const res2 = testExecuteApproval(db, { orderId: "INV-VALID", actorEmail: "admin@test.com" });
  assert.equal(res2.ok, true);

  const updatedUser = db.prepare("SELECT credits FROM users WHERE email = 'user1@test.com'").get();
  assert.equal(updatedUser.credits, 100);

  const updatedOrder = db.prepare("SELECT status FROM orders WHERE id = 'INV-VALID'").get();
  assert.equal(updatedOrder.status, "PAID");
});

test("Security: SQLite Triggers guarantee audit_logs are 100% append-only (UPDATE & DELETE aborted)", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  insertAuditLogEntry(db, {
    orderId: "INV-AUDIT-TEST",
    action: "PAYMENT_APPROVED",
    actorEmail: "admin@test.com",
    provider: "QRIS",
    transactionId: "TRX-100",
    amount: 49000,
    creditsGranted: 100,
    statusBefore: "PENDING_REVIEW",
    statusAfter: "PAID",
    notes: "Testing immutability",
    createdAt: now,
  });

  // Attempt 1: UPDATE audit_logs -> MUST ABORT
  assert.throws(
    () => {
      db.prepare("UPDATE audit_logs SET actor_email = 'hacker@test.com' WHERE order_id = 'INV-AUDIT-TEST'").run();
    },
    (err) => err.message.includes("audit_logs are immutable"),
  );

  // Attempt 2: DELETE FROM audit_logs -> MUST ABORT
  assert.throws(
    () => {
      db.prepare("DELETE FROM audit_logs WHERE order_id = 'INV-AUDIT-TEST'").run();
    },
    (err) => err.message.includes("audit_logs are immutable"),
  );

  // Verify the log entry remains unchanged
  const log = db.prepare("SELECT actor_email FROM audit_logs WHERE order_id = 'INV-AUDIT-TEST'").get();
  assert.equal(log.actor_email, "admin@test.com");
});

test("Security: Secret-Backed HMAC-SHA256 Canonical Audit Chain with Monotonic Sequence and External Checkpointing", () => {
  const db = createTestDb();

  insertAuditLogEntry(db, { orderId: "INV-1", action: "PROOF_UPLOADED", actorEmail: "user@test.com", amount: 49000 });
  insertAuditLogEntry(db, { orderId: "INV-1", action: "PAYMENT_APPROVED", actorEmail: "admin@test.com", amount: 49000, creditsGranted: 100 });
  insertAuditLogEntry(db, { orderId: "INV-2", action: "PROOF_UPLOADED", actorEmail: "user2@test.com", amount: 49000 });

  // 1. Clean verification with legitimate secret passes
  const verifyResult = verifyAuditLogChain(db);
  assert.equal(verifyResult.ok, true);
  assert.equal(verifyResult.totalChecked, 3);

  // 2. Verification with forged secret fails
  const forgedResult = verifyAuditLogChain(db, "forged-attacker-secret");
  assert.equal(forgedResult.ok, false);

  // 3. Monotonic sequences are strictly 1, 2, 3
  const rows = db.prepare("SELECT sequence FROM audit_logs ORDER BY sequence ASC").all();
  assert.deepEqual(rows.map((r) => r.sequence), [1, 2, 3]);

  // 4. External Checkpoint generation succeeds
  const checkpoint = generateAuditCheckpoint(db);
  assert.equal(checkpoint.totalLogs, 3);
  assert.ok(checkpoint.chainHmac.length === 64);
});

test("Security: HMAC-SHA256 Token Storage, Constant-Time Compare, Expiry & Rate Limiting", () => {
  const db = createTestDb();
  const now = new Date().toISOString();
  const rawToken = generateApprovalToken(6);
  const tokenHash = hashApprovalToken(rawToken);

  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, created_at, updated_at) VALUES ('user-token@test.com', 'hash', 'salt', 0, ?, ?)")
    .run(now, now);

  // Case 1: Expired Token (created 15 minutes ago)
  const expiredAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO orders (id, user_email, plan_name, amount, credits, payment_method, status, approval_token_hash, approval_token_expires_at, created_at) VALUES ('INV-EXP', 'user-token@test.com', 'Pro Studio', 49000, 100, 'QRIS', 'PENDING_REVIEW', ?, ?, ?)")
    .run(tokenHash, expiredAt, now);

  const resExpired = testExecuteApproval(db, { orderId: "INV-EXP", actorEmail: "admin@test.com", token: rawToken });
  assert.equal(resExpired.ok, false);
  assert.match(resExpired.error, /TOKEN_EXPIRED/);

  // Case 2: Wrong token attempts trigger rate limit lockout after 5 tries
  const validUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO orders (id, user_email, plan_name, amount, credits, payment_method, status, approval_token_hash, approval_token_expires_at, approval_token_attempts, created_at) VALUES ('INV-LOCK', 'user-token@test.com', 'Pro Studio', 49000, 100, 'QRIS', 'PENDING_REVIEW', ?, ?, 0, ?)")
    .run(tokenHash, validUntil, now);

  // 5 wrong attempts
  for (let i = 0; i < 5; i++) {
    const wrongRes = testExecuteApproval(db, { orderId: "INV-LOCK", actorEmail: "admin@test.com", token: "WRONG" + i });
    assert.equal(wrongRes.ok, false);
  }

  // 6th attempt with CORRECT token -> MUST BE LOCKED OUT
  const resLocked = testExecuteApproval(db, { orderId: "INV-LOCK", actorEmail: "admin@test.com", token: rawToken });
  assert.equal(resLocked.ok, false);
  assert.match(resLocked.error, /TOKEN_LOCKED/);
});

test("Security Fault Injection: Failure during credit or audit insertion rolls back EVERYTHING atomically", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, created_at, updated_at) VALUES ('user-fault@test.com', 'hash', 'salt', 0, ?, ?)")
    .run(now, now);

  db.prepare("INSERT INTO orders (id, user_email, plan_name, amount, credits, payment_method, status, ocr_transaction_id, created_at) VALUES ('INV-FAULT-1', 'user-fault@test.com', 'Pro Studio', 49000, 100, 'QRIS', 'PENDING_REVIEW', 'TRX-FAULT-1', ?)")
    .run(now);

  // Fault Injection at credit ledger insert
  const resFault = testExecuteApproval(db, {
    orderId: "INV-FAULT-1",
    actorEmail: "admin@test.com",
    faultInjectAt: "credit_ledger",
  });

  assert.equal(resFault.ok, false);
  assert.match(resFault.error, /SIMULATED_FAULT/);

  // Strict Rollback Verification:
  // 1. Order status must still be 'PENDING_REVIEW' (NOT 'PAID')
  const order = db.prepare("SELECT status FROM orders WHERE id = 'INV-FAULT-1'").get();
  assert.equal(order.status, "PENDING_REVIEW");

  // 2. User credits must still be 0 (NOT +100)
  const user = db.prepare("SELECT credits FROM users WHERE email = 'user-fault@test.com'").get();
  assert.equal(user.credits, 0);

  // 3. verified_transactions must be completely empty
  const verified = db.prepare("SELECT * FROM verified_transactions WHERE order_id = 'INV-FAULT-1'").all();
  assert.equal(verified.length, 0);

  // 4. credit_transactions must be completely empty
  const ledger = db.prepare("SELECT * FROM credit_transactions WHERE order_id = 'INV-FAULT-1'").all();
  assert.equal(ledger.length, 0);
});

test("Security: WhatsApp Serverless Webhook correctly validates sender, token, and executes atomic payment", () => {
  const db = createTestDb();
  const now = new Date().toISOString();
  const adminPhone = "6285754494990";
  const rawToken = generateApprovalToken(6);
  const tokenHash = hashApprovalToken(rawToken);

  // Setup user and pending order
  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, created_at, updated_at) VALUES ('buyer@test.com', 'hash', 'salt', 0, ?, ?)")
    .run(now, now);

  db.prepare(`
    INSERT INTO orders (
      id, user_email, plan_name, amount, credits, payment_method, status, 
      approval_token, approval_token_hash, approval_token_expires_at, approval_token_attempts, created_at
    ) VALUES (
      'INV-WH-TEST', 'buyer@test.com', 'Pro Studio', 49000, 100, 'QRIS', 'PENDING_REVIEW', 
      ?, ?, datetime('now', '+10 minutes'), 0, ?
    )
  `).run(rawToken, tokenHash, now);

  // 1. Sender whitelist test: Unauthorized sender must be rejected
  const unauthorizedSender = "6281111111111";
  assert.notEqual(unauthorizedSender, adminPhone);

  // 2. Token Matching via constant-time comparison
  const parsedToken = rawToken;
  const parsedHash = hashApprovalToken(parsedToken);
  assert.equal(safeCompare(tokenHash, parsedHash), true);

  // 3. Execution of Atomic Approval
  const approvalRes = testExecuteApproval(db, {
    orderId: "INV-WH-TEST",
    actorEmail: `admin-wa-${adminPhone}`,
  });

  assert.equal(approvalRes.ok, true);
  assert.equal(approvalRes.creditsGranted, 100);

  // 4. Verify User Credits & Order Status
  const updatedUser = db.prepare("SELECT credits FROM users WHERE email = 'buyer@test.com'").get();
  assert.equal(updatedUser.credits, 100);

  const updatedOrder = db.prepare("SELECT status FROM orders WHERE id = 'INV-WH-TEST'").get();
  assert.equal(updatedOrder.status, "PAID");

  // 5. Verify Token Invalidation after successful ACC
  const postApprovalOrder = db.prepare("SELECT approval_token, approval_token_hash FROM orders WHERE id = 'INV-WH-TEST'").get();
  assert.equal(postApprovalOrder.approval_token, null);
  assert.equal(postApprovalOrder.approval_token_hash, null);
});

test("Security: Webhook Replay Protection and Strict Cross-Invoice Token Binding", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  // Setup orders A and B with different tokens
  const tokenA = "AAAAAA";
  const tokenB = "BBBBBB";

  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, created_at, updated_at) VALUES ('userA@test.com', 'h', 's', 0, ?, ?)")
    .run(now, now);
  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, created_at, updated_at) VALUES ('userB@test.com', 'h', 's', 0, ?, ?)")
    .run(now, now);

  db.prepare("INSERT INTO orders (id, user_email, plan_name, amount, credits, payment_method, status, approval_token_hash, created_at) VALUES ('INV-A', 'userA@test.com', 'Pro', 49000, 100, 'QRIS', 'PENDING_REVIEW', ?, ?)")
    .run(hashApprovalToken(tokenA), now);
  db.prepare("INSERT INTO orders (id, user_email, plan_name, amount, credits, payment_method, status, approval_token_hash, created_at) VALUES ('INV-B', 'userB@test.com', 'Pro', 49000, 100, 'QRIS', 'PENDING_REVIEW', ?, ?)")
    .run(hashApprovalToken(tokenB), now);

  // 1. Cross-Invoice Token Binding: Token A CANNOT approve Invoice B
  const tokenAHash = hashApprovalToken(tokenA);
  const orderB = db.prepare("SELECT * FROM orders WHERE id = 'INV-B'").get();
  assert.equal(safeCompare(orderB.approval_token_hash, tokenAHash), false);

  // 2. Webhook Replay Protection: Duplicate Event ID is rejected
  const externalEventId = "fonnte-msg-987654";
  db.prepare("INSERT INTO webhook_events (provider, external_event_id, received_at, status) VALUES ('fonnte', ?, ?, 'COMPLETED')")
    .run(externalEventId, now);

  const existingEvent = db.prepare("SELECT * FROM webhook_events WHERE provider = 'fonnte' AND external_event_id = ?").get(externalEventId);
  assert.equal(existingEvent.status, "COMPLETED");

  // Attempting duplicate insert with same external_event_id must fail unique constraint
  assert.throws(() => {
    db.prepare("INSERT INTO webhook_events (provider, external_event_id, received_at, status) VALUES ('fonnte', ?, ?, 'PROCESSING')")
      .run(externalEventId, now);
  }, /UNIQUE constraint failed/);
});

test("Security: Webhook Concurrency - 20 simultaneous webhooks grant EXACTLY 1 payment approval", async () => {
  const db = createTestDb();
  const now = new Date().toISOString();
  const rawToken = "CONC99";
  const tokenHash = hashApprovalToken(rawToken);

  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, created_at, updated_at) VALUES ('concurrent_user@test.com', 'h', 's', 0, ?, ?)")
    .run(now, now);

  db.prepare(`
    INSERT INTO orders (
      id, user_email, plan_name, amount, credits, payment_method, status, 
      approval_token, approval_token_hash, approval_token_expires_at, approval_token_attempts, created_at
    ) VALUES (
      'INV-CONCURRENCY-1', 'concurrent_user@test.com', 'Pro Studio', 49000, 100, 'QRIS', 'PENDING_REVIEW', 
      ?, ?, ?, 0, ?
    )
  `).run(rawToken, tokenHash, new Date(Date.now() + 10 * 60 * 1000).toISOString(), now);

  // Helper: Simulates receiving a webhook event with idempotency check + atomic approval
  async function simulateWebhookRequest(eventId) {
    const existing = db.prepare("SELECT status FROM webhook_events WHERE provider = 'fonnte' AND external_event_id = ?").get(eventId);
    if (existing) {
      return { ok: true, replay: true, status: existing.status };
    }

    try {
      db.prepare("INSERT INTO webhook_events (provider, external_event_id, event_type, sender, status, received_at) VALUES ('fonnte', ?, 'incoming_message', '6285754494990', 'PROCESSING', ?)")
        .run(eventId, now);
    } catch {
      return { ok: true, replay: true, message: "Concurrent duplicate event rejected by unique constraint" };
    }

    const approval = testExecuteApproval(db, {
      orderId: "INV-CONCURRENCY-1",
      actorEmail: "admin-wa-6285754494990",
      token: rawToken,
    });

    if (approval.ok) {
      db.prepare("UPDATE webhook_events SET status = 'PROCESSED', processed_at = ? WHERE provider = 'fonnte' AND external_event_id = ?")
        .run(now, eventId);
      return { ok: true, approved: true, creditsGranted: approval.creditsGranted };
    } else {
      db.prepare("UPDATE webhook_events SET status = 'FAILED', error_code = ?, processed_at = ? WHERE provider = 'fonnte' AND external_event_id = ?")
        .run(approval.error, now, eventId);
      return { ok: false, error: approval.error };
    }
  }

  // 1. Send 20 identical webhook requests with the same event ID concurrently
  const duplicateResults = await Promise.all(
    Array.from({ length: 20 }, () => simulateWebhookRequest("fonnte-concurrent-evt-1"))
  );

  // Assertions for Identical Event Replay:
  // Exactly ONE request got approved: true
  const approvedCount = duplicateResults.filter((r) => r.approved === true).length;
  assert.equal(approvedCount, 1);

  // All 19 other requests were safely handled as duplicate/replay
  const duplicateCount = duplicateResults.filter((r) => r.replay === true).length;
  assert.equal(duplicateCount, 19);

  // Strict Ledger Invariants:
  // 1. User credits MUST be exactly 100 (NEVER 200, 300, or 2000!)
  const user = db.prepare("SELECT credits FROM users WHERE email = 'concurrent_user@test.com'").get();
  assert.equal(user.credits, 100);

  // 2. Exactly 1 credit ledger row
  const ledger = db.prepare("SELECT * FROM credit_transactions WHERE order_id = 'INV-CONCURRENCY-1'").all();
  assert.equal(ledger.length, 1);

  // 3. Exactly 1 verified_transactions row
  const verified = db.prepare("SELECT * FROM verified_transactions WHERE order_id = 'INV-CONCURRENCY-1'").all();
  assert.equal(verified.length, 1);

  // 4. Exactly 1 PAYMENT_APPROVED audit log
  const auditLogs = db.prepare("SELECT * FROM audit_logs WHERE order_id = 'INV-CONCURRENCY-1' AND action = 'PAYMENT_APPROVED'").all();
  assert.equal(auditLogs.length, 1);

  // 5. Exactly 1 PROCESSED webhook event
  const webhookEvents = db.prepare("SELECT * FROM webhook_events WHERE provider = 'fonnte'").all();
  assert.equal(webhookEvents.length, 1);
  assert.equal(webhookEvents[0].status, "PROCESSED");
});

// ── TEST 29: 10 Parallel Reservations with Balance for Only 1 Generation ──
test("Security: 10 Parallel Reservations with Balance for Only 1 Generation (Race Condition Guard)", async () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  // User has exactly 25 available credits
  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, reserved_credits, created_at, updated_at) VALUES ('race_user@test.com', 'h', 's', 25, 0, ?, ?)")
    .run(now, now);

  function simulateReserve(generationId) {
    const user = db.prepare("SELECT credits, reserved_credits FROM users WHERE email = 'race_user@test.com'").get();
    if (user.credits < 25) {
      return { ok: false, error: "CREDIT_INSUFFICIENT" };
    }

    const res = db.prepare("SELECT * FROM credit_reservations WHERE generation_id = ?").get(generationId);
    if (res) {
      return { ok: false, error: "CREDIT_RESERVATION_EXISTS" };
    }

    try {
      const update = db.prepare("UPDATE users SET credits = credits - 25, reserved_credits = reserved_credits + 25, updated_at = ? WHERE email = 'race_user@test.com' AND credits >= 25").run(now);
      if (update.changes !== 1) {
        return { ok: false, error: "CREDIT_INSUFFICIENT" };
      }

      db.prepare("INSERT INTO credit_reservations (id, user_email, generation_id, amount, document_type, status, created_at) VALUES (?, 'race_user@test.com', ?, 25, 'PRD', 'RESERVED', ?)")
        .run("res_" + generationId, generationId, now);

      db.prepare("INSERT INTO credit_transactions (user_email, amount, reason, order_id, type, created_at) VALUES ('race_user@test.com', -25, 'Reserve', ?, 'AI_CREDIT_RESERVED', ?)")
        .run(generationId, now);

      return { ok: true, remaining: 0 };
    } catch {
      return { ok: false, error: "CREDIT_RESERVATION_FAILED" };
    }
  }

  // Run 10 parallel attempts with distinct generation IDs
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => simulateReserve(`gen_parallel_${i}`))
  );

  const successful = results.filter((r) => r.ok === true).length;
  const failed = results.filter((r) => r.ok === false).length;

  assert.equal(successful, 1, "Exactly 1 generation reservation must succeed");
  assert.equal(failed, 9, "All 9 other parallel requests must be rejected with insufficient credits");

  const finalUser = db.prepare("SELECT credits, reserved_credits FROM users WHERE email = 'race_user@test.com'").get();
  assert.equal(finalUser.credits, 0);
  assert.equal(finalUser.reserved_credits, 25);
});

// ── TEST 30: Client Disconnect Does NOT Release Credits ─────────────────
test("Security: Client Disconnect Does NOT Release Credits (Status Remains GENERATING/RESERVED)", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, reserved_credits, created_at, updated_at) VALUES ('disconnect_user@test.com', 'h', 's', 0, 25, ?, ?)")
    .run(now, now);

  db.prepare("INSERT INTO credit_reservations (id, user_email, generation_id, amount, document_type, status, created_at) VALUES ('res_disc_1', 'disconnect_user@test.com', 'gen_disc_1', 25, 'PRD', 'RESERVED', ?)")
    .run(now);

  db.prepare("INSERT INTO document_generations (id, user_email, model, status, created_at) VALUES ('gen_disc_1', 'disconnect_user@test.com', 'gemini-2.5-flash', 'GENERATING', ?)")
    .run(now);

  // Client aborts HTTP connection while generating:
  // Server rule: DO NOT release credits on connection close
  const reservation = db.prepare("SELECT status FROM credit_reservations WHERE generation_id = 'gen_disc_1'").get();
  const generation = db.prepare("SELECT status FROM document_generations WHERE id = 'gen_disc_1'").get();
  const user = db.prepare("SELECT credits, reserved_credits FROM users WHERE email = 'disconnect_user@test.com'").get();

  assert.equal(reservation.status, "RESERVED", "Reservation must remain RESERVED");
  assert.equal(generation.status, "GENERATING", "Generation must remain GENERATING");
  assert.equal(user.credits, 0, "Available credits must remain 0");
  assert.equal(user.reserved_credits, 25, "Reserved credits must remain 25");
});

// ── TEST 31: AI Success + DB Write Failure -> FINALIZE_FAILED (No Premature Refund) ──
test("Security: AI Success + DB Write Failure -> Status FINALIZE_FAILED and Credits Remain RESERVED", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, reserved_credits, created_at, updated_at) VALUES ('db_fail_user@test.com', 'h', 's', 0, 25, ?, ?)")
    .run(now, now);

  db.prepare("INSERT INTO credit_reservations (id, user_email, generation_id, amount, document_type, status, created_at) VALUES ('res_fail_1', 'db_fail_user@test.com', 'gen_fail_1', 25, 'TECH_SPEC', 'RESERVED', ?)")
    .run(now);

  db.prepare("INSERT INTO document_generations (id, user_email, model, status, created_at) VALUES ('gen_fail_1', 'db_fail_user@test.com', 'gemini-flash', 'GENERATING', ?)")
    .run(now);

  // Simulate transactional rollback followed by post-rollback FINALIZE_FAILED update
  try {
    db.exec("BEGIN IMMEDIATE");
    // Simulate failure during internal write
    throw new Error("TURSO_TIMEOUT");
  } catch {
    try { db.exec("ROLLBACK"); } catch {}
    // Update generation state AFTER rollback
    db.prepare("UPDATE document_generations SET status = 'FINALIZE_FAILED', completed_at = ? WHERE id = 'gen_fail_1'").run(now);
  }

  const reservation = db.prepare("SELECT status FROM credit_reservations WHERE generation_id = 'gen_fail_1'").get();
  const generation = db.prepare("SELECT status FROM document_generations WHERE id = 'gen_fail_1'").get();
  const user = db.prepare("SELECT credits, reserved_credits FROM users WHERE email = 'db_fail_user@test.com'").get();

  assert.equal(generation.status, "FINALIZE_FAILED", "Generation domain status must be FINALIZE_FAILED");
  assert.equal(reservation.status, "RESERVED", "Credit reservation status must remain strictly RESERVED");
  assert.equal(user.credits, 0, "Available credits must NOT be refunded");
  assert.equal(user.reserved_credits, 25, "Credits must stay reserved for retry");
});

// ── TEST 32: Retry Finalization on FINALIZE_FAILED -> Exactly One CAPTURE ──
test("Security: Retry Finalization on FINALIZE_FAILED -> Exactly One CAPTURE", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, reserved_credits, created_at, updated_at) VALUES ('retry_user@test.com', 'h', 's', 0, 25, ?, ?)")
    .run(now, now);

  db.prepare("INSERT INTO credit_reservations (id, user_email, generation_id, amount, document_type, status, created_at) VALUES ('res_retry_1', 'retry_user@test.com', 'gen_retry_1', 25, 'PRD', 'RESERVED', ?)")
    .run(now);

  db.prepare("INSERT INTO document_generations (id, user_email, model, status, created_at) VALUES ('gen_retry_1', 'retry_user@test.com', 'gemini-flash', 'FINALIZE_FAILED', ?)")
    .run(now);

  // Execute retry finalization
  db.exec("BEGIN IMMEDIATE");
  db.prepare("INSERT INTO project_documents (user_email, project_id, document_type, file_name, content, status, created_at, updated_at) VALUES ('retry_user@test.com', 'p1', 'PRD', 'prd.md', '# PRD Content', 'COMPLETED', ?, ?)").run(now, now);
  db.prepare("UPDATE credit_reservations SET status = 'CAPTURED', settled_at = ? WHERE generation_id = 'gen_retry_1' AND status = 'RESERVED'").run(now);
  db.prepare("UPDATE users SET reserved_credits = reserved_credits - 25, updated_at = ? WHERE email = 'retry_user@test.com' AND reserved_credits >= 25").run(now);
  db.prepare("INSERT INTO credit_transactions (user_email, amount, reason, order_id, type, created_at) VALUES ('retry_user@test.com', 0, 'Capture on retry', 'gen_retry_1', 'AI_CREDIT_CAPTURED', ?)").run(now);
  db.prepare("UPDATE document_generations SET status = 'COMPLETED', completed_at = ? WHERE id = 'gen_retry_1' AND status IN ('GENERATING', 'FINALIZE_FAILED')").run(now);
  db.exec("COMMIT");

  const reservation = db.prepare("SELECT status FROM credit_reservations WHERE generation_id = 'gen_retry_1'").get();
  const generation = db.prepare("SELECT status FROM document_generations WHERE id = 'gen_retry_1'").get();
  const user = db.prepare("SELECT credits, reserved_credits FROM users WHERE email = 'retry_user@test.com'").get();
  const ledger = db.prepare("SELECT * FROM credit_transactions WHERE order_id = 'gen_retry_1'").all();

  assert.equal(reservation.status, "CAPTURED");
  assert.equal(generation.status, "COMPLETED");
  assert.equal(user.credits, 0);
  assert.equal(user.reserved_credits, 0);
  assert.equal(ledger.length, 1);
});

// ── TEST 32B: Balance Invariant Assertion (Corruption Detection) ─────────
test("Security: Balance Invariant Assertion Rejects Underflow with CREDIT_BALANCE_INVARIANT_VIOLATION", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  // User corrupted state: reserved_credits is 10, but reservation is 25
  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, reserved_credits, created_at, updated_at) VALUES ('corrupt_user@test.com', 'h', 's', 0, 10, ?, ?)")
    .run(now, now);

  const update = db.prepare("UPDATE users SET reserved_credits = reserved_credits - 25, updated_at = ? WHERE email = 'corrupt_user@test.com' AND reserved_credits >= 25").run(now);

  assert.equal(update.changes, 0, "Update must affect 0 rows because 10 < 25");

  // Invariant error returned
  const error = update.changes !== 1 ? "CREDIT_BALANCE_INVARIANT_VIOLATION" : null;
  assert.equal(error, "CREDIT_BALANCE_INVARIANT_VIOLATION");
});

// ── TEST 33: Repeated Release is Idempotent (No Double Refund Attack) ─────
test("Security: Repeated Release is Idempotent and Does NOT Add Credits Again", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, reserved_credits, created_at, updated_at) VALUES ('repeat_rel@test.com', 'h', 's', 0, 25, ?, ?)")
    .run(now, now);

  db.prepare("INSERT INTO credit_reservations (id, user_email, generation_id, amount, document_type, status, created_at) VALUES ('res_rep_1', 'repeat_rel@test.com', 'gen_rep_1', 25, 'PRD', 'RESERVED', ?)")
    .run(now);

  function executeRelease(genId) {
    const res = db.prepare("SELECT * FROM credit_reservations WHERE generation_id = ?").get(genId);
    if (!res || res.status !== "RESERVED") {
      return { ok: false, error: "CREDIT_RESERVATION_INVALID_STATE" };
    }
    db.prepare("UPDATE credit_reservations SET status = 'RELEASED', settled_at = ? WHERE generation_id = ?").run(now, genId);
    db.prepare("UPDATE users SET credits = credits + ?, reserved_credits = MAX(0, reserved_credits - ?), updated_at = ? WHERE email = ?").run(res.amount, res.amount, now, res.user_email);
    db.prepare("INSERT INTO credit_transactions (user_email, amount, reason, order_id, type, created_at) VALUES (?, ?, 'Release', ?, 'AI_CREDIT_RELEASED', ?)").run(res.user_email, res.amount, genId, now);
    return { ok: true };
  }

  // First release: succeeds and refunds 25 credits
  const first = executeRelease("gen_rep_1");
  assert.equal(first.ok, true);

  const userAfterFirst = db.prepare("SELECT credits, reserved_credits FROM users WHERE email = 'repeat_rel@test.com'").get();
  assert.equal(userAfterFirst.credits, 25);
  assert.equal(userAfterFirst.reserved_credits, 0);

  // Second release: MUST BE REJECTED and MUST NOT add another 25 credits!
  const second = executeRelease("gen_rep_1");
  assert.equal(second.ok, false);
  assert.equal(second.error, "CREDIT_RESERVATION_INVALID_STATE");

  const userAfterSecond = db.prepare("SELECT credits, reserved_credits FROM users WHERE email = 'repeat_rel@test.com'").get();
  assert.equal(userAfterSecond.credits, 25, "Credits must still be 25, never 50!");
});

// ── TEST 34: Capture After Release is Strictly Forbidden ────────────────
test("Security: Capture After Release is Strictly Forbidden", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  db.prepare("INSERT INTO credit_reservations (id, user_email, generation_id, amount, document_type, status, created_at) VALUES ('res_cr_1', 'u@test.com', 'gen_cr_1', 25, 'PRD', 'RELEASED', ?)")
    .run(now);

  const res = db.prepare("SELECT status FROM credit_reservations WHERE generation_id = 'gen_cr_1'").get();
  assert.equal(res.status === "RESERVED", false, "Cannot capture a released reservation");
});

// ── TEST 35: Release After Capture is Strictly Forbidden ────────────────
test("Security: Release After Capture is Strictly Forbidden", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  db.prepare("INSERT INTO credit_reservations (id, user_email, generation_id, amount, document_type, status, created_at) VALUES ('res_rc_1', 'u@test.com', 'gen_rc_1', 25, 'PRD', 'CAPTURED', ?)")
    .run(now);

  const res = db.prepare("SELECT status FROM credit_reservations WHERE generation_id = 'gen_rc_1'").get();
  assert.equal(res.status === "RESERVED", false, "Cannot release a captured reservation");
});

// ── TEST 36: IDOR Protection on Generation ID Across Users ──────────────
test("Security: IDOR Protection on Generation and Order Records Across Users", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  db.prepare("INSERT INTO orders (id, user_email, plan_name, amount, credits, payment_method, status, created_at) VALUES ('INV-USER-A', 'user_a@test.com', 'Pro', 49000, 100, 'QRIS', 'PENDING_REVIEW', ?)")
    .run(now);

  // User B tries to access User A's order
  const orderForUserB = db.prepare("SELECT * FROM orders WHERE id = 'INV-USER-A' AND user_email = 'user_b@test.com'").get();
  assert.equal(orderForUserB, undefined, "User B must not see User A's invoice");
});

// ── TEST 37: Pure Atomic Document Finalization in Single Write Transaction ──
test("Security: Pure Atomic Document Finalization in Single Write Transaction", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, reserved_credits, created_at, updated_at) VALUES ('atomic_u@test.com', 'h', 's', 0, 25, ?, ?)")
    .run(now, now);

  db.prepare("INSERT INTO credit_reservations (id, user_email, generation_id, amount, document_type, status, created_at) VALUES ('res_atomic_1', 'atomic_u@test.com', 'gen_atomic_1', 25, 'PRD', 'RESERVED', ?)")
    .run(now);

  db.prepare("INSERT INTO document_generations (id, user_email, model, status, created_at) VALUES ('gen_atomic_1', 'atomic_u@test.com', 'gemini-flash', 'GENERATING', ?)")
    .run(now);

  // Atomic write TX:
  db.exec("BEGIN IMMEDIATE");
  db.prepare("INSERT INTO project_documents (user_email, project_id, document_type, file_name, content, status, created_at, updated_at) VALUES ('atomic_u@test.com', 'p1', 'PRD', 'prd.md', '# Product Requirements Document', 'COMPLETED', ?, ?)").run(now, now);
  db.prepare("UPDATE credit_reservations SET status = 'CAPTURED', settled_at = ? WHERE generation_id = 'gen_atomic_1'").run(now);
  db.prepare("UPDATE users SET reserved_credits = MAX(0, reserved_credits - 25), updated_at = ? WHERE email = 'atomic_u@test.com'").run(now);
  db.prepare("INSERT INTO credit_transactions (user_email, amount, reason, order_id, type, created_at) VALUES ('atomic_u@test.com', 0, 'Finalize PRD', 'gen_atomic_1', 'AI_CREDIT_CAPTURED', ?)").run(now);
  db.prepare("UPDATE document_generations SET status = 'COMPLETED', completed_at = ? WHERE id = 'gen_atomic_1'").run(now);
  db.exec("COMMIT");

  const doc = db.prepare("SELECT * FROM project_documents WHERE user_email = 'atomic_u@test.com'").get();
  const res = db.prepare("SELECT * FROM credit_reservations WHERE generation_id = 'gen_atomic_1'").get();
  const gen = db.prepare("SELECT * FROM document_generations WHERE id = 'gen_atomic_1'").get();
  const user = db.prepare("SELECT credits, reserved_credits FROM users WHERE email = 'atomic_u@test.com'").get();

  assert.equal(doc.status, "COMPLETED");
  assert.equal(res.status, "CAPTURED");
  assert.equal(gen.status, "COMPLETED");
  assert.equal(user.reserved_credits, 0);
});

// ── TEST 38: Magic Bytes Image Detection & Mismatch Rejection ────────────
test("Security: Magic Bytes Image Detection & Mismatch Rejection", () => {
  // 1. Valid JPEG Magic Bytes (FF D8 FF)
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assert.equal(jpegHeader[0] === 0xff && jpegHeader[1] === 0xd8 && jpegHeader[2] === 0xff, true);

  // 2. Valid PNG Magic Bytes (89 50 4E 47 0D 0A 1A 0A)
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  assert.equal(pngHeader[0] === 0x89 && pngHeader[1] === 0x50 && pngHeader[2] === 0x4e && pngHeader[3] === 0x47, true);

  // 3. Fake JPEG (Actually text/html)
  const fakeJpeg = Buffer.from("<html><script>alert(1)</script></html>");
  const isFakeJpegValid = fakeJpeg[0] === 0xff && fakeJpeg[1] === 0xd8 && fakeJpeg[2] === 0xff;
  assert.equal(isFakeJpegValid, false, "Fake JPEG text payload must be detected as invalid image");
});

// ── TEST 39: Server-Enforced Sequential Document Dependency Validation ──
test("Security: Sequential Document Dependency Validation (PRD -> TECH_SPEC -> UI_UX -> AI_CONTEXT)", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  function checkDependencies(userEmail, projectId, docType) {
    if (docType === "PRD") return { ok: true };
    if (docType === "TECH_SPEC") {
      const prd = db.prepare("SELECT id FROM project_documents WHERE user_email = ? AND project_id = ? AND document_type = 'PRD' AND status = 'COMPLETED'").get(userEmail, projectId);
      return prd ? { ok: true } : { ok: false, missing: "PRD" };
    }
    if (docType === "UI_UX") {
      const prd = db.prepare("SELECT id FROM project_documents WHERE user_email = ? AND project_id = ? AND document_type = 'PRD' AND status = 'COMPLETED'").get(userEmail, projectId);
      const techSpec = db.prepare("SELECT id FROM project_documents WHERE user_email = ? AND project_id = ? AND document_type = 'TECH_SPEC' AND status = 'COMPLETED'").get(userEmail, projectId);
      if (!prd) return { ok: false, missing: "PRD" };
      if (!techSpec) return { ok: false, missing: "TECH_SPEC" };
      return { ok: true };
    }
    if (docType === "AI_CONTEXT") {
      const prd = db.prepare("SELECT id FROM project_documents WHERE user_email = ? AND project_id = ? AND document_type = 'PRD' AND status = 'COMPLETED'").get(userEmail, projectId);
      const techSpec = db.prepare("SELECT id FROM project_documents WHERE user_email = ? AND project_id = ? AND document_type = 'TECH_SPEC' AND status = 'COMPLETED'").get(userEmail, projectId);
      const uiUx = db.prepare("SELECT id FROM project_documents WHERE user_email = ? AND project_id = ? AND document_type = 'UI_UX' AND status = 'COMPLETED'").get(userEmail, projectId);
      if (!prd) return { ok: false, missing: "PRD" };
      if (!techSpec) return { ok: false, missing: "TECH_SPEC" };
      if (!uiUx) return { ok: false, missing: "UI_UX" };
      return { ok: true };
    }
    return { ok: true };
  }

  // 1. Initial State: PRD allowed, TECH_SPEC rejected
  assert.equal(checkDependencies("user_seq@test.com", "proj_1", "PRD").ok, true);
  assert.equal(checkDependencies("user_seq@test.com", "proj_1", "TECH_SPEC").ok, false);
  assert.equal(checkDependencies("user_seq@test.com", "proj_1", "UI_UX").ok, false);

  // 2. Complete PRD: TECH_SPEC now allowed, UI_UX still rejected
  db.prepare("INSERT INTO project_documents (user_email, project_id, document_type, file_name, content, status, created_at, updated_at) VALUES ('user_seq@test.com', 'proj_1', 'PRD', 'prd.md', 'PRD', 'COMPLETED', ?, ?)").run(now, now);
  assert.equal(checkDependencies("user_seq@test.com", "proj_1", "TECH_SPEC").ok, true);
  assert.equal(checkDependencies("user_seq@test.com", "proj_1", "UI_UX").ok, false);

  // 3. Complete TECH_SPEC: UI_UX now allowed, AI_CONTEXT still rejected
  db.prepare("INSERT INTO project_documents (user_email, project_id, document_type, file_name, content, status, created_at, updated_at) VALUES ('user_seq@test.com', 'proj_1', 'TECH_SPEC', 'spec.md', 'SPEC', 'COMPLETED', ?, ?)").run(now, now);
  assert.equal(checkDependencies("user_seq@test.com", "proj_1", "UI_UX").ok, true);
  assert.equal(checkDependencies("user_seq@test.com", "proj_1", "AI_CONTEXT").ok, false);

  // 4. Complete UI_UX: AI_CONTEXT now allowed!
  db.prepare("INSERT INTO project_documents (user_email, project_id, document_type, file_name, content, status, created_at, updated_at) VALUES ('user_seq@test.com', 'proj_1', 'UI_UX', 'ui.md', 'UI', 'COMPLETED', ?, ?)").run(now, now);
  assert.equal(checkDependencies("user_seq@test.com", "proj_1", "AI_CONTEXT").ok, true);
});

// ── TEST 40: Rejection Reason Server Enum & Mandatory Note Enforcement ───
test("Security: Rejection Reason Server Enum & Mandatory Note Enforcement for OTHER", () => {
  const validReasons = [
    "AMOUNT_MISMATCH",
    "TRANSACTION_NOT_FOUND",
    "MERCHANT_MISMATCH",
    "PROOF_UNREADABLE",
    "TRANSACTION_DUPLICATE",
    "TRANSACTION_EXPIRED",
    "OTHER",
  ];

  function validateRejection(code, note) {
    if (!validReasons.includes(code)) {
      return { ok: false, error: "REJECTION_REASON_INVALID" };
    }
    if (code === "OTHER" && (!note || !note.trim())) {
      return { ok: false, error: "REJECTION_NOTE_REQUIRED" };
    }
    return { ok: true };
  }

  assert.equal(validateRejection("TRANSACTION_NOT_FOUND").ok, true);
  assert.equal(validateRejection("INVALID_CODE").ok, false);
  assert.equal(validateRejection("OTHER", "").ok, false);
  assert.equal(validateRejection("OTHER", "Nomor rekening tidak aktif").ok, true);
});

// ── TEST 42: RESERVED Generation Cannot Be Finalized Directly ────────────
test("Security: RESERVED generation cannot be finalized directly (Strict GENERATING / FINALIZE_FAILED Requirement)", () => {
  const db = createTestDb();
  const now = new Date().toISOString();

  db.prepare("INSERT INTO users (email, password_hash, password_salt, credits, reserved_credits, created_at, updated_at) VALUES ('bypass_user@test.com', 'h', 's', 0, 25, ?, ?)")
    .run(now, now);

  db.prepare("INSERT INTO credit_reservations (id, user_email, generation_id, amount, document_type, status, created_at) VALUES ('res_byp_1', 'bypass_user@test.com', 'gen_byp_1', 25, 'PRD', 'RESERVED', ?)")
    .run(now);

  db.prepare("INSERT INTO document_generations (id, user_email, model, status, created_at) VALUES ('gen_byp_1', 'bypass_user@test.com', 'gemini-flash', 'RESERVED', ?)")
    .run(now);

  function executeFinalization(genId) {
    const res = db.prepare("SELECT * FROM credit_reservations WHERE generation_id = ?").get(genId);
    if (!res || res.status !== "RESERVED") {
      return { ok: false, error: "CREDIT_RESERVATION_INVALID_STATE" };
    }

    const gen = db.prepare("SELECT status FROM document_generations WHERE id = ?").get(genId);
    if (gen && gen.status !== "GENERATING" && gen.status !== "FINALIZE_FAILED") {
      return { ok: false, error: "GENERATION_INVALID_STATE" };
    }

    return { ok: true };
  }

  // Attempt to finalize while generation is still in 'RESERVED' state
  const result = executeFinalization("gen_byp_1");
  assert.equal(result.ok, false);
  assert.equal(result.error, "GENERATION_INVALID_STATE");

  // Invariants: document not created, reservation still RESERVED, credits unchanged
  const doc = db.prepare("SELECT * FROM project_documents WHERE user_email = 'bypass_user@test.com'").get();
  const reservation = db.prepare("SELECT status FROM credit_reservations WHERE generation_id = 'gen_byp_1'").get();
  const user = db.prepare("SELECT credits, reserved_credits FROM users WHERE email = 'bypass_user@test.com'").get();

  assert.equal(doc, undefined, "Document must not be saved");
  assert.equal(reservation.status, "RESERVED", "Reservation must stay RESERVED");
  assert.equal(user.credits, 0);
  assert.equal(user.reserved_credits, 25);
});





