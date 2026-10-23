import { Chess, type Move, type Square as EngineSquare } from '@weshell/xiangqi.js'
import { normalizeMoveText, type Piece, type PieceKind, type Square } from './chess'

const pieceNames = {
  w: { k: '帅', a: '仕', b: '相', n: '马', r: '车', c: '炮', p: '兵' },
  b: { k: '将', a: '士', b: '象', n: '马', r: '车', c: '炮', p: '卒' },
} as const

const kinds: Record<string, PieceKind> = {
  k: 'general', a: 'advisor', b: 'elephant', n: 'horse', r: 'rook', c: 'cannon', p: 'pawn',
}

const values: Record<string, number> = { k: 10000, r: 900, c: 450, n: 400, b: 200, a: 200, p: 100 }

export function createBattle() {
  return new Chess()
}

export function squareToPoint(square: string): Square {
  return { row: 9 - Number(square[1]), col: square.charCodeAt(0) - 97 }
}

export function pointToSquare(point: Square) {
  return `${String.fromCharCode(97 + point.col)}${9 - point.row}`
}

export function battlePieces(game: Chess): Piece[] {
  return game.board().flat().filter((item): item is NonNullable<typeof item> => item !== null).map((item) => {
    const point = squareToPoint(item.square)
    return {
      id: item.square,
      text: pieceNames[item.color][item.type],
      side: item.color === 'w' ? 'red' : 'black',
      kind: kinds[item.type],
      ...point,
    }
  })
}

export function legalTargets(game: Chess, from: Square) {
  const square = pointToSquare(from) as EngineSquare
  return (game.moves({ verbose: true, square }) as Move[]).map((move) => squareToPoint(move.to))
}

export function makeBattleMove(game: Chess, from: Square, to: Square) {
  try {
    return game.move({ from: pointToSquare(from), to: pointToSquare(to) })
  } catch {
    return null
  }
}

export function findVoiceMove(game: Chess, transcript: string) {
  const normalized = normalizeMoveText(transcript)
  const moves = game.moves({ verbose: true }) as Move[]
  return moves.find((move) => {
    const notation = normalizeMoveText(move.zh)
    return normalized === notation || normalized.includes(notation)
  }) ?? null
}

export class VoiceMoveAuthorization {
  private armed = false

  arm() {
    this.armed = true
  }

  cancel() {
    this.armed = false
  }

  consume() {
    if (!this.armed) return false
    this.armed = false
    return true
  }
}

export function describeBattleTurn(playerMove: Move, aiMove?: Move | null) {
  if (playerMove.isCheckmate) return `你走${playerMove.zh}，完成将死，赢下这一局。`
  if (!aiMove) return `你走${playerMove.zh}。`
  if (aiMove.isCheckmate) return `你走${playerMove.zh}，零七应对${aiMove.zh}，形成将死。`
  if (aiMove.isCheck) return `你走${playerMove.zh}，零七应对${aiMove.zh}，红方正被将军，请先应将。`
  if (playerMove.captured) return `你走${playerMove.zh}，完成吃子；零七应对${aiMove.zh}。`
  return `你走${playerMove.zh}，零七应对${aiMove.zh}。轮到你继续走棋。`
}

export function chooseAiMove(game: Chess, difficulty: '入门' | '初级' | '中级' = '初级') {
  const moves = game.moves({ verbose: true }) as Move[]
  if (moves.length === 0) return null
  if (difficulty === '入门') return moves[Math.floor(Math.random() * moves.length)]

  const scored = moves.map((move) => ({
    move,
    score: (move.captured ? values[move.captured] : 0) + (move.isCheckmate ? 100000 : 0) + (move.isCheck ? 500 : 0) + Math.random() * (difficulty === '中级' ? 30 : 180),
  }))
  scored.sort((left, right) => right.score - left.score)
  const range = difficulty === '中级' ? 2 : Math.min(5, scored.length)
  return scored[Math.floor(Math.random() * range)].move
}

export function battleStatus(game: Chess) {
  if (game.isCheckmate()) return game.turn() === 'w' ? '黑方获胜，红方被将死。' : '红方获胜，黑方被将死。'
  if (game.isStalemate()) return '本局困毙，和棋。'
  if (game.isDraw()) return '本局和棋。'
  if (game.isCheck()) return game.turn() === 'w' ? '红方被将军，请先应将。' : '黑方被将军。'
  return game.turn() === 'w' ? '轮到红方走棋' : 'ZERO7 正在思考…'
}
