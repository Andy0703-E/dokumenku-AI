import { NextRequest } from "next/server";
import { getDatabase } from "@/db";
import { getCurrentAdmin } from "@/lib/auth";
import {
  ERROR_CODES,
  apiError,
  apiSuccess,
  generateRequestId,
} from "@/lib/errors";

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const user = await getCurrentAdmin();
  if (!user) {
    return apiError(ERROR_CODES.AUTH_FORBIDDEN, "Akses terbatas untuk administrator.", 403, requestId);
  }

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(searchParams.get("limit") || "10", 10) || 10));
  const type = (searchParams.get("type") || "all").trim() as "all" | "add" | "deduct";
  const offset = (page - 1) * limit;

  try {
    const db = await getDatabase();
    let totalQuery = "SELECT COUNT(*) AS value FROM credit_transactions";
    let dataQuery = "SELECT id, user_email AS userEmail, amount, reason, created_at AS createdAt FROM credit_transactions";
    const args: (string | number)[] = [];

    if (type === "add") {
      totalQuery += " WHERE amount > 0";
      dataQuery += " WHERE amount > 0";
    } else if (type === "deduct") {
      totalQuery += " WHERE amount < 0";
      dataQuery += " WHERE amount < 0";
    }

    const countResult = await db.execute({ sql: totalQuery, args });
    const total = Number(countResult.rows[0]?.value ?? 0);

    dataQuery += " ORDER BY id DESC LIMIT ? OFFSET ?";
    const dataResult = await db.execute({ sql: dataQuery, args: [...args, limit, offset] });

    return apiSuccess({
      transactions: dataResult.rows,
      total,
      page,
      limit,
    }, 200, requestId);
  } catch (error) {
    return apiError(ERROR_CODES.INTERNAL_SERVER_ERROR, error instanceof Error ? error.message : "Gagal memuat riwayat transaksi.", 500, requestId);
  }
}
