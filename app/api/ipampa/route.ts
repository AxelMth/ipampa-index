import { sql } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// GET: Fetch all IPAMPA data from database
export async function GET() {
  try {
    // Fetch all indices with their values
    const indices = await sql`
      SELECT 
        i.id,
        i.label,
        i.id_bank,
        i.last_update,
        i.period,
        json_agg(
          json_build_object(
            'year', v.year,
            'value', v.value
          ) ORDER BY v.year
        ) as values
      FROM ipampa_indices i
      LEFT JOIN ipampa_values v ON i.id = v.index_id
      GROUP BY i.id, i.label, i.id_bank, i.last_update, i.period
      ORDER BY i.label
    `

    return NextResponse.json({ data: indices, success: true })
  } catch (error) {
    console.error("[v0] Error fetching IPAMPA data:", error)
    return NextResponse.json({ error: "Failed to fetch data", success: false }, { status: 500 })
  }
}
