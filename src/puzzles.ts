import { Chess, validateFen, type Move as EngineMove } from '@weshell/xiangqi.js'
import type { Level, Move, Piece, PieceKind, Side } from './chess'

export type PuzzleSourceId = 'wukong-xiangqi' | 'xiangqi-pwa-offline'
export type PuzzleVerification = 'source' | 'xiangqi.js' | 'chessdb'
export type PuzzleMode = 'mate1' | 'endgame'

export interface PuzzleSource {
  id: PuzzleSourceId
  name: string
  url: string
  license: 'Apache-2.0' | 'MIT'
  role: string
}

export interface PuzzleRecord {
  id: string
  sourceId: PuzzleSourceId
  sourcePuzzleId: string
  mode: PuzzleMode
  fen: string
  solution: { from: string; to: string }[]
  category: string
  difficulty: '入门' | '初级' | '中级'
  title: string
  description: string
  instruction: string
  hints: [string, string, string]
  successTitle: string
  successText: string
  reward: number
  verifiedBy: PuzzleVerification[]
  sourceBestMove?: string
  sourceResult?: string
  sourceType?: string
  chessdb?: { status: string; score?: number; bestMove?: string }
  source: PuzzleSource
}

const pieceNames = {
  w: { k: '帅', a: '仕', b: '相', n: '马', r: '车', c: '炮', p: '兵' },
  b: { k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒' },
} as const
const pieceKinds: Record<string, PieceKind> = { k: 'general', a: 'advisor', b: 'elephant', n: 'horse', r: 'rook', c: 'cannon', p: 'pawn' }

export function validatePuzzleRecord(record: PuzzleRecord) {
  const fenResult = validateFen(record.fen)
  if (!fenResult.ok) return { ok: false as const, error: fenResult.error }
  if (record.solution.length === 0) return { ok: false as const, error: '题目缺少标准答案' }
  try {
    const game = new Chess(record.fen)
    for (const step of record.solution) {
      const legal = (game.moves({ verbose: true }) as EngineMove[]).find((move) => move.from === step.from && move.to === step.to)
      if (!legal) return { ok: false as const, error: `非法答案：${step.from}${step.to}` }
      game.move(step)
    }
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : '题目校验失败' }
  }
}

export function puzzleToLevel(record: PuzzleRecord, index: number): Level {
  const validation = validatePuzzleRecord(record)
  if (!validation.ok) throw new Error(`${record.id}: ${validation.error}`)
  const game = new Chess(record.fen)
  const first = record.solution[0]
  const engineMove = (game.moves({ verbose: true }) as EngineMove[]).find((move) => move.from === first.from && move.to === first.to)!
  const pieces = game.board().flat().filter((item): item is NonNullable<typeof item> => item !== null).map((item): Piece => ({
    id: item.square,
    text: pieceNames[item.color][item.type],
    side: (item.color === 'w' ? 'red' : 'black') as Side,
    kind: pieceKinds[item.type],
    row: 9 - Number(item.square[1]),
    col: item.square.charCodeAt(0) - 97,
  }))
  const move: Move = {
    pieceId: first.from,
    from: { row: 9 - Number(first.from[1]), col: first.from.charCodeAt(0) - 97 },
    to: { row: 9 - Number(first.to[1]), col: first.to.charCodeAt(0) - 97 },
    notation: engineMove.zh,
  }
  return {
    ...record,
    number: String(index + 1).padStart(2, '0'),
    answer: engineMove.zh,
    answerAliases: [engineMove.zh.replace(/[一二三四五六七八九]/g, (number) => String('一二三四五六七八九'.indexOf(number) + 1))],
    pieces,
    move,
  }
}

export async function fetchPuzzleLibrary(signal?: AbortSignal) {
  const response = await fetch('/api/puzzles?limit=10000', { signal })
  if (!response.ok) throw new Error(`题库加载失败（${response.status}）`)
  const payload = await response.json() as { items?: PuzzleRecord[] }
  if (!Array.isArray(payload.items) || payload.items.length === 0) throw new Error('题库中还没有练习题')
  return payload.items.map(puzzleToLevel)
}
