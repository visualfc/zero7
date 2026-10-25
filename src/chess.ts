export type Side = 'red' | 'black'
export type PieceKind = 'general' | 'advisor' | 'elephant' | 'horse' | 'rook' | 'cannon' | 'pawn'
export type Square = { row: number; col: number }
export type Piece = Square & { id: string; text: string; side: Side; kind: PieceKind }

export interface Move {
  pieceId: string
  from: Square
  to: Square
  notation: string
}

export interface Level {
  id: string
  number: string
  category: string
  difficulty: '入门' | '初级' | '中级'
  sourceId: 'wukong-xiangqi' | 'xiangqi-pwa-offline'
  sourcePuzzleId: string
  mode: 'mate1' | 'mate2' | 'mate3' | 'mate4' | 'mateN' | 'endgame'
  fen: string
  solution: { from: string; to: string }[]
  verifiedBy: ('source' | 'xiangqi.js' | 'chessdb')[]
  sourceBestMove?: string
  sourceResult?: string
  sourceType?: string
  chessdb?: { status: string; score?: number; bestMove?: string }
  source: { id: string; name: string; url: string; license: string; role: string }
  title: string
  description: string
  instruction: string
  answer: string
  answerAliases: string[]
  pieces: Piece[]
  move: Move
  hints: [string, string, string]
  successTitle: string
  successText: string
  reward: number
}


export function sameSquare(a: Square, b: Square) {
  return a.row === b.row && a.col === b.col
}

export function isHorseAttacking(pieces: Piece[], horseId: string, target: Square) {
  const horse = pieces.find((item) => item.id === horseId && item.kind === 'horse')
  if (!horse) return false
  const rowDelta = target.row - horse.row
  const colDelta = target.col - horse.col
  const isHorseStep = (Math.abs(rowDelta) === 2 && Math.abs(colDelta) === 1) || (Math.abs(rowDelta) === 1 && Math.abs(colDelta) === 2)
  if (!isHorseStep) return false
  const leg = Math.abs(rowDelta) === 2
    ? { row: horse.row + Math.sign(rowDelta), col: horse.col }
    : { row: horse.row, col: horse.col + Math.sign(colDelta) }
  return !pieces.some((item) => sameSquare(item, leg))
}

export function hasFacingGenerals(pieces: Piece[]) {
  const blackGeneral = pieces.find((item) => item.side === 'black' && item.kind === 'general')
  const redGeneral = pieces.find((item) => item.side === 'red' && item.kind === 'general')
  if (!blackGeneral || !redGeneral || blackGeneral.col !== redGeneral.col) return false
  return piecesBetween(pieces, blackGeneral, redGeneral) === 0
}

export function isLevelMove(level: Level, pieceId: string, target: Square) {
  return level.move.pieceId === pieceId && sameSquare(level.move.to, target) && isLegalMove(level.pieces, level.move)
}

export function applyMove(pieces: Piece[], moveToApply: Move) {
  return pieces
    .filter((pieceItem) => !sameSquare(pieceItem, moveToApply.to) || pieceItem.id === moveToApply.pieceId)
    .map((pieceItem) => pieceItem.id === moveToApply.pieceId ? { ...pieceItem, ...moveToApply.to } : pieceItem)
}

export function isLegalMove(pieces: Piece[], moveToCheck: Move) {
  const moving = pieces.find((item) => item.id === moveToCheck.pieceId)
  if (!moving || !sameSquare(moving, moveToCheck.from)) return false
  const target = pieces.find((item) => sameSquare(item, moveToCheck.to))
  if (target?.side === moving.side) return false

  const rowDistance = Math.abs(moveToCheck.to.row - moving.row)
  const colDistance = Math.abs(moveToCheck.to.col - moving.col)
  const blockers = piecesBetween(pieces, moving, moveToCheck.to)

  if (moving.kind === 'rook') return (rowDistance === 0 || colDistance === 0) && blockers === 0
  if (moving.kind === 'cannon') {
    if (rowDistance !== 0 && colDistance !== 0) return false
    return target ? blockers === 1 : blockers === 0
  }
  if (moving.kind === 'horse') {
    if (!((rowDistance === 2 && colDistance === 1) || (rowDistance === 1 && colDistance === 2))) return false
    const leg = rowDistance === 2
      ? { row: moving.row + Math.sign(moveToCheck.to.row - moving.row), col: moving.col }
      : { row: moving.row, col: moving.col + Math.sign(moveToCheck.to.col - moving.col) }
    return !pieces.some((item) => sameSquare(item, leg))
  }
  return false
}

function piecesBetween(pieces: Piece[], from: Square, to: Square) {
  if (from.row !== to.row && from.col !== to.col) return -1
  const rowStep = Math.sign(to.row - from.row)
  const colStep = Math.sign(to.col - from.col)
  let row = from.row + rowStep
  let col = from.col + colStep
  let count = 0
  while (row !== to.row || col !== to.col) {
    if (pieces.some((item) => item.row === row && item.col === col)) count += 1
    row += rowStep
    col += colStep
  }
  return count
}

export type ParseResult = { matched: true; notation: string } | { matched: false; normalized: string }

export function parseVoiceMove(text: string, level: Level): ParseResult {
  const normalized = normalizeMoveText(text)
  const candidates = [level.answer, ...level.answerAliases].map(normalizeMoveText)
  const matched = candidates.some((candidate) => candidate === normalized || normalized.includes(candidate) || (normalized.length === candidate.length && editDistance(candidate, normalized) <= 1))
  return matched ? { matched: true, notation: level.answer } : { matched: false, normalized }
}

export function normalizeMoveText(text: string) {
  const replacements: Record<string, string> = {
    '砲': '炮', '跑': '炮', '車': '车', '居': '车', '去': '车', '馬': '马', '進': '进', '近': '进', '晋': '进', '借': '进',
    '退': '退', '平': '平', '坪': '平', '评': '平',
    '衣': '一', '壹': '一', '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '7': '七', '8': '八', '9': '九',
    '１': '一', '２': '二', '３': '三', '４': '四', '５': '五', '６': '六', '７': '七', '８': '八', '９': '九',
    '伍': '五', '肆': '四', '两': '二', '兩': '二', '俩': '二', '倆': '二', '儿': '二', '山': '三', '叁': '三', '杉': '三', '散': '三',
  }
  return text.trim().replace(/[，。！？,.!?、\s]/g, '').split('').map((character) => replacements[character] ?? character).join('')
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[right.length]
}
