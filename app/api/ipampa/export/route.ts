import { sql } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// GET: Export IPAMPA data to CSV
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const searchQuery = searchParams.get("q") || ""

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

    // Filter data based on search query (matching the client-side filtering logic)
    let filteredData = indices
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filteredData = indices.filter(
        (index: any) =>
          index.label.toLowerCase().includes(query) ||
          index.id_bank.toLowerCase().includes(query) ||
          index.period.toLowerCase().includes(query)
      )
    }

    if (filteredData.length === 0) {
      // Return empty CSV with headers if no data
      const csvHeader = "Label;ID Bank;Last Update;Period\n"
      return new NextResponse(csvHeader, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ipampa-export-${Date.now()}.csv"`,
        },
      })
    }

    // Get all unique years from the data
    const allYears = Array.from(
      new Set(
        filteredData.flatMap((index: any) => index.values?.map((v: any) => v.year) || [])
      )
    ).sort((a: any, b: any) => a - b)

    // Generate CSV header
    const csvHeader = ["Libellé", "ID Bank", "Dernière mise à jour", "Période", ...allYears.map((y: any) => String(y))].join(";") + "\n"

    // Generate CSV rows
    const csvRows = filteredData
      .map((index: any) => {
        const values = index.values || []
        const rowData = [
          escapeCSV(index.label),
          escapeCSV(index.id_bank),
          escapeCSV(index.last_update),
          escapeCSV(index.period),
          ...allYears.map((year: any) => {
            const value = values.find((v: any) => v.year === year)
            return value ? value.value.toFixed(2) : ""
          }),
        ]
        return rowData.join(";")
      })
      .join("\n")

    const csv = "\ufeff" + csvHeader + csvRows

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ipampa-export-${Date.now()}.csv"`,
      },
    })
  } catch (error) {
    console.error("[v0] Error exporting IPAMPA data:", error)
    return NextResponse.json({ error: "Failed to export data", success: false }, { status: 500 })
  }
}

// Helper function to escape CSV values
function escapeCSV(value: any): string {
  if (value === null || value === undefined) return ""
  const str = String(value)
  // If the value contains semicolon, newline, or quote, wrap it in quotes and escape quotes
  if (str.includes(";") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}
