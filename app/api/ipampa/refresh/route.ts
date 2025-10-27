import { sql } from "@/lib/db"
import { NextResponse } from "next/server"
import { parse } from "csv-parse/sync"
import AdmZip from "adm-zip"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST: Refresh IPAMPA data from INSEE CSV
export async function POST() {
  try {
    console.log("[IPAMPA Refresh] Starting data refresh from INSEE...")
    
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

    console.log("[IPAMPA Refresh] Successfully fetched ZIP file from INSEE")
    
    // Get the response as buffer
    const zipBuffer = await response.arrayBuffer()
    
    // Unzip the file
    const zip = new AdmZip(Buffer.from(zipBuffer))
    const zipEntries = zip.getEntries()
    
    console.log(`[IPAMPA Refresh] ZIP contains ${zipEntries.length} entries`)
    
    // Find the CSV file inside the ZIP (usually the first or only entry)
    const csvEntry = zipEntries.find((entry: any) => 
      entry.entryName.endsWith('.csv') || entry.entryName.endsWith('.txt')
    )
    
    if (!csvEntry) {
      throw new Error("No CSV file found in ZIP archive")
    }
    
    console.log(`[IPAMPA Refresh] Found CSV file: ${csvEntry.entryName}`)
    
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

    console.log(`[IPAMPA Refresh] Parsed ${records.length} CSV records`)

    // Get all column names
    const columns = Object.keys(records[0])
    
    console.log(`[IPAMPA Refresh] Found ${columns.length} columns`)
    
    // Find year columns (columns with 4-digit year names)
    const yearStartIndex = columns.findIndex(col => /^\d{4}$/.test(col))
    
    if (yearStartIndex === -1) {
      throw new Error("No year columns found in CSV")
    }

    const years = columns.slice(yearStartIndex).filter(col => /^\d{4}$/.test(col))
    
    console.log(`[IPAMPA Refresh] Found ${years.length} year columns: ${years[0]}-${years[years.length - 1]}`)

    console.log("[IPAMPA Refresh] Clearing existing data...")
    
    // Clear existing data
    await sql`DELETE FROM ipampa_values`
    await sql`DELETE FROM ipampa_indices`
    
    console.log("[IPAMPA Refresh] Existing data cleared")

    // Prepare data arrays for batch insertion
    const indicesData: Array<{ label: string; id_bank: string; last_update: string; period: string }> = []
    const valuesData: Array<{ index_id: number; year: number; value: number }> = []

    console.log("[IPAMPA Refresh] Processing CSV records to extract indices...")
    
    const ipampaRecords = records.filter(record => record['Libellé']?.includes('IPAMPA'))

    // Parse all data rows into arrays
    for (const record of ipampaRecords) {
      // Filter out null bytes from all values and get metadata
      const label = (record['Libellé'] || '').replace(/\0/g, '').trim()
      const idBank = (record['idBank'] || '').replace(/\0/g, '').trim()
      const lastUpdate = (record['Dernière mise à jour'] || '').replace(/\0/g, '').trim()
      const period = (record['Période'] || '').replace(/\0/g, '').trim()

      if (!label || !idBank) continue

      // Add to indices array
      indicesData.push({ label, id_bank: idBank, last_update: lastUpdate, period })
    }

    console.log(`[IPAMPA Refresh] Extracted ${indicesData.length} indices, preparing for insertion...`)

    // Insert all indices in one go using unnest for bulk insert
    const labels = indicesData.map(d => d.label)
    const idBanks = indicesData.map(d => d.id_bank)
    const lastUpdates = indicesData.map(d => d.last_update)
    const periods = indicesData.map(d => d.period)
    
    const insertedRecords = await sql`
      INSERT INTO ipampa_indices (label, id_bank, last_update, period)
      SELECT * FROM UNNEST(
        ${labels}::text[],
        ${idBanks}::text[],
        ${lastUpdates}::text[],
        ${periods}::text[]
      )
      RETURNING id
    `
    
    console.log(`[IPAMPA Refresh] Inserted ${insertedRecords.length} indices into database`)
    
    const insertedIndices = insertedRecords.map(r => r.id)

    console.log("[IPAMPA Refresh] Processing values data...")
    
    // Now collect all values data
    for (let i = 0; i < indicesData.length; i++) {
      if (i % 100 === 0 && i > 0) {
        console.log(`[IPAMPA Refresh] Processing values: ${i}/${indicesData.length} indices processed`)
      }
      
      const record = records.find(r => {
        const label = (r['Libellé'] || '').replace(/\0/g, '').trim()
        const idBank = (r['idBank'] || '').replace(/\0/g, '').trim()
        return label === indicesData[i].label && idBank === indicesData[i].id_bank
      })
      
      if (record) {
        for (const year of years) {
          const yearValue = record[year]
          if (yearValue && yearValue !== "" && yearValue !== "-") {
            const numericValue = Number.parseFloat(String(yearValue).replace(",", "."))
            if (!isNaN(numericValue)) {
              valuesData.push({
                index_id: insertedIndices[i],
                year: Number.parseInt(year),
                value: numericValue
              })
            }
          }
        }
      }
    }

    console.log(`[IPAMPA Refresh] Collected ${valuesData.length} values, inserting into database...`)

    // Batch insert all values using UNNEST
    if (valuesData.length > 0) {
      const indexIds = valuesData.map(d => d.index_id)
      const years = valuesData.map(d => d.year)
      const values = valuesData.map(d => d.value)
      
      await sql`
        INSERT INTO ipampa_values (index_id, year, value)
        SELECT * FROM UNNEST(
          ${indexIds}::integer[],
          ${years}::integer[],
          ${values}::numeric[]
        )
      `
    }

    console.log(`[IPAMPA Refresh] Successfully inserted ${valuesData.length} values into database`)

    return NextResponse.json({
      success: true,
      message: `Successfully refreshed ${indicesData.length} IPAMPA indices`,
      count: indicesData.length,
    })
  } catch (error) {
    console.error("[IPAMPA Refresh] Error refreshing IPAMPA data:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to refresh data",
        success: false,
      },
      { status: 500 },
    )
  }
}
