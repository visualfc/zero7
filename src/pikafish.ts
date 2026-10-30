export const ENGINE_LEVELS = ['初级', '中级', '高级', '大师'] as const
export type EngineLevel = (typeof ENGINE_LEVELS)[number]
export const ANALYSIS_LEVEL: EngineLevel = '大师'

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

export async function warmupPikafish(fen: string, signal?: AbortSignal) {
  const response = await fetch('/api/pikafish/warmup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fen }),
    signal,
  })
  if (!response.ok) throw new Error(`Pikafish 预热失败（${response.status}）`)
}

export async function getPikafishMove(fen: string, level: EngineLevel, analysis = false, mateDepth?: number, moveTime?: number) {
  const response = await fetch('/api/pikafish/bestmove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(analysis ? { fen, level, analysis: true, ...(moveTime ? { moveTime } : {}) } : { fen, level, ...(mateDepth ? { mateDepth } : {}), ...(moveTime ? { moveTime } : {}) }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || `Pikafish 请求失败（${response.status}）`)
  return result as { move: string | null; terminal?: boolean; score: { type: 'cp' | 'mate'; value: number } | null; engine: string; level: EngineLevel }
}
