import { NextResponse } from "next/server";
import { getDatabase } from "@/db";

export async function GET() {
  try {
    const db = await getDatabase();

    const creditsResult = await db.execute("SELECT COALESCE(SUM(available_credits), 0) AS value FROM users");
    const credits = (creditsResult.rows[0] as unknown as { value: number })?.value ?? 0;

    const generationResult = await db.execute("SELECT COUNT(*) AS value FROM document_generations WHERE status = 'COMPLETED'");
    const completedDocs = (generationResult.rows[0] as unknown as { value: number })?.value ?? 0;

    const usersResult = await db.execute("SELECT COUNT(*) AS value FROM users");
    const totalUsers = (usersResult.rows[0] as unknown as { value: number })?.value ?? 0;

    return NextResponse.json({
      totalCredits: credits,
      completedDocuments: completedDocs,
      totalUsers,
    });
  } catch {
    return NextResponse.json({ totalCredits: 0, completedDocuments: 0, totalUsers: 0 });
  }
}
