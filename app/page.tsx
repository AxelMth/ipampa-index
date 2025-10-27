import { sql } from "@/lib/db"
import { IPAMPATable } from "@/components/ipampa-table"
import { TrendingUp } from "lucide-react"

export const dynamic = "force-dynamic"

async function getIPAMPAData() {
  try {
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

    return indices
  } catch (error) {
    console.error("[v0] Error fetching IPAMPA data:", error)
    return []
  }
}

export default async function Home() {
  const data = await getIPAMPAData()

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold tracking-tight">IPAMPA Index</h1>
          </div>
          <p className="text-lg text-muted-foreground">Agricultural Production Price Index from INSEE</p>
        </div>

        <IPAMPATable initialData={data} />
      </div>
    </main>
  )
}
