import { sql } from "@/lib/db"
import { NextResponse } from "next/server"
import { parse } from "csv-parse/sync"
import AdmZip from "adm-zip"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST: Refresh IPAMPA data from INSEE CSV
export async function POST() {
  try {
    // Fetch ZIP from INSEE with proper headers
    const response = await fetch("https://bdm.insee.fr/famille/117608561/csv?lang=fr", {
      headers: {
        'accept': '*/*',
        'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'dnt': '1',
        'origin': 'https://www.insee.fr',
        'priority': 'u=1, i',
        'sec-ch-ua': '"Chromium";v="141", "Not?A_Brand";v="8"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
      }
    })

    if (!response.ok) {
      throw new Error("Failed to fetch ZIP from INSEE")
    }

    // Get the response as buffer
    const zipBuffer = await response.arrayBuffer()
    
    // Unzip the file
    const zip = new AdmZip(Buffer.from(zipBuffer))
    const zipEntries = zip.getEntries()
    
    // Find the CSV file inside the ZIP (usually the first or only entry)
    const csvEntry = zipEntries.find((entry: any) => 
      entry.entryName.endsWith('.csv') || entry.entryName.endsWith('.txt')
    )
    
    if (!csvEntry) {
      throw new Error("No CSV file found in ZIP archive")
    }
    
    // Extract and get the CSV content
    const csvText = zip.readAsText(csvEntry)

    // Parse CSV using csv-parse with semicolon delimiter
    const records = parse(csvText, {
      delimiter: ';',
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      trim: true,
      skip_records_with_error: true,
      encoding: 'utf-8'
    }) as Record<string, string>[]

    if (!records || records.length === 0) {
      throw new Error("Invalid CSV format")
    }

    // Get all column names
    const columns = Object.keys(records[0])
    
    // Find year columns (columns with 4-digit year names)
    const yearStartIndex = columns.findIndex(col => /^\d{4}$/.test(col))
    
    if (yearStartIndex === -1) {
      throw new Error("No year columns found in CSV")
    }

    const years = columns.slice(yearStartIndex).filter(col => /^\d{4}$/.test(col))

    // Clear existing data
    await sql`DELETE FROM ipampa_values`
    await sql`DELETE FROM ipampa_indices`

    let insertedCount = 0

    // Parse data rows
    for (const record of records) {
      // Filter out null bytes from all values and get metadata
      const label = (record['Libellé'] || '').replace(/\0/g, '').trim()
      const idBank = (record['idBank'] || '').replace(/\0/g, '').trim()
      const lastUpdate = (record['Dernière mise à jour'] || '').replace(/\0/g, '').trim()
      const period = (record['Période'] || '').replace(/\0/g, '').trim()

      if (!label || !idBank) continue

      // Insert index metadata
      const [indexRecord] = await sql`
        INSERT INTO ipampa_indices (label, id_bank, last_update, period)
        VALUES (${label}, ${idBank}, ${lastUpdate}, ${period})
        RETURNING id
      `

      // Insert values for each year
      for (const year of years) {
        const yearValue = record[year]
        if (yearValue && yearValue !== "" && yearValue !== "-") {
          const numericValue = Number.parseFloat(String(yearValue).replace(",", "."))
          if (!isNaN(numericValue)) {
            await sql`
              INSERT INTO ipampa_values (index_id, year, value)
              VALUES (${indexRecord.id}, ${Number.parseInt(year)}, ${numericValue})
            `
          }
        }
      }

      insertedCount++
    }

    return NextResponse.json({
      success: true,
      message: `Successfully refreshed ${insertedCount} IPAMPA indices`,
      count: insertedCount,
    })
  } catch (error) {
    console.error("[v0] Error refreshing IPAMPA data:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to refresh data",
        success: false,
      },
      { status: 500 },
    )
  }
}
