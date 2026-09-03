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
  const search = (searchParams.get("search") || "").trim();
  const offset = (page - 1) * limit;

  try {
    const db = await getDatabase();
    let totalQuery = "SELECT COUNT(*) AS value FROM users";
    let dataQuery = "SELECT email, available_credits AS credits, reserved_credits AS reservedCredits, updated_at AS updatedAt FROM users";
    const args: (string | number)[] = [];

    if (search) {
      const whereClause = " WHERE email LIKE ?";
      totalQuery += whereClause;
      dataQuery += whereClause;
      args.push(`%${search}%`);
    }

    const countResult = await db.execute({ sql: totalQuery, args });
    const total = Number(countResult.rows[0]?.value ?? 0);

    dataQuery += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";
    const dataResult = await db.execute({ sql: dataQuery, args: [...args, limit, offset] });

    return apiSuccess({
      users: dataResult.rows,
      total,
      page,
      limit,
    }, 200, requestId);
  } catch (error) {
    return apiError(ERROR_CODES.INTERNAL_SERVER_ERROR, error instanceof Error ? error.message : "Gagal memuat daftar pengguna.", 500, requestId);
  }
}
