"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCw, Database } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface IPAMPAValue {
  year: number
  value: number
}

interface IPAMPAIndex {
  id: number
  label: string
  id_bank: string
  last_update: string
  period: string
  values: IPAMPAValue[]
}

interface IPAMPATableProps {
  initialData: IPAMPAIndex[]
}

export function IPAMPATable({ initialData }: IPAMPATableProps) {
  const [data, setData] = useState<IPAMPAIndex[]>(initialData)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { toast } = useToast()

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const response = await fetch("/api/ipampa/refresh", {
        method: "POST",
      })

      const result = await response.json()

      if (result.success) {
        // Fetch updated data
        const dataResponse = await fetch("/api/ipampa")
        const dataResult = await dataResponse.json()

        if (dataResult.success) {
          setData(dataResult.data)
          toast({
            title: "Données actualisées",
            description: result.message,
          })
        }
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast({
        title: "Échec de l'actualisation",
        description: error instanceof Error ? error.message : "Échec de l'actualisation des données",
        variant: "destructive",
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  // Get all unique years from the data
  const allYears = Array.from(new Set(data.flatMap((index) => index.values?.map((v) => v.year) || []))).sort(
    (a, b) => a - b,
  )

  // Get recent years for display (last 10 years)
  const recentYears = allYears.slice(-10)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{data.length} indices chargés depuis la base de données</p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Actualisation..." : "Actualiser les données"}
        </Button>
      </div>

      {data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Database className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">Aucune donnée disponible</p>
            <p className="text-sm text-muted-foreground mb-4">
              Cliquez sur le bouton d'actualisation pour charger les données IPAMPA depuis l'INSEE
            </p>
            <Button onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              Charger les données
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.map((index) => {
            const indexValues = index.values || []
            const recentValues = recentYears.map((year) => {
              const value = indexValues.find((v) => v.year === year)
              return { year, value: value?.value }
            })

            return (
              <Card key={index.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{index.label}</CardTitle>
                  <CardDescription>
                    ID : {index.id_bank} • Période : {index.period} • Dernière mise à jour : {index.last_update}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-4 font-medium text-sm text-muted-foreground">Année</th>
                          {recentValues.map(({ year }) => (
                            <th key={year} className="text-right py-2 px-4 font-medium text-sm text-muted-foreground">
                              {year}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="py-2 px-4 font-medium text-sm">Indice</td>
                          {recentValues.map(({ year, value }) => (
                            <td key={year} className="text-right py-2 px-4 font-mono text-sm">
                              {value ? value.toFixed(2) : "-"}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
