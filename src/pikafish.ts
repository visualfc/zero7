export type EngineLevel = '入门' | '初级' | '中级'

export interface PikafishStatus {
  available: boolean
  name?: string
  error?: string
}

export async function getPikafishStatus(): Promise<PikafishStatus> {
  const response = await fetch('/api/pikafish/status')
  if (!response.ok) return { available: false, error: `状态查询失败（${response.status}）` }
  return response.json()
}

export async function getPikafishMove(fen: string, level: EngineLevel, analysis = false) {
  const response = await fetch('/api/pikafish/bestmove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(analysis ? { fen, level, analysis: true } : { fen, level }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || `Pikafish 请求失败（${response.status}）`)
  return result as { move: string; score: { type: 'cp' | 'mate'; value: number } | null; engine: string; level: EngineLevel }
}
