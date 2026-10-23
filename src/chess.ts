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

export const levels: Level[] = [
  {
    id: 'cannon-capture', number: '01', category: '观察力',
    title: '黑车闯进中路，\n红炮怎样吃掉它？',
    description: '炮要隔着一枚棋子才能吃子，找找它的炮架。',
    instruction: '红方走棋 · 用红炮吃掉黑车', answer: '炮五进五',
    answerAliases: ['炮5进5', '跑五进五', '砲五进五', '炮五近五', '炮五进伍'],
    pieces: [
      piece('black-general', '将', 'black', 'general', 0, 4),
      piece('black-advisor-a', '士', 'black', 'advisor', 0, 3),
      piece('black-advisor-b', '士', 'black', 'advisor', 0, 5),
      piece('black-rook', '车', 'black', 'rook', 2, 4),
      piece('black-pawn-a', '卒', 'black', 'pawn', 3, 2),
      piece('black-pawn-b', '卒', 'black', 'pawn', 3, 6),
      piece('red-pawn-screen', '兵', 'red', 'pawn', 5, 4),
      piece('red-cannon', '炮', 'red', 'cannon', 7, 4),
      piece('red-general', '帅', 'red', 'general', 9, 4),
      piece('red-advisor-a', '仕', 'red', 'advisor', 9, 3),
      piece('red-advisor-b', '仕', 'red', 'advisor', 9, 5),
    ],
    move: move('red-cannon', 7, 4, 2, 4, '炮五进五'),
    hints: ['看看中路，红炮和黑车之间有什么？', '中间的红兵可以给炮当“炮架”。', '选中红炮，再点黑车：炮五进五。'],
    successTitle: '隔山打牛！', successText: '红炮隔着红兵跳过去，成功吃掉了黑车。', reward: 10,
  },
  {
    id: 'rook-block', number: '02', category: '救将',
    title: '黑车正在将军，\n怎样挡住它？',
    description: '把红车移到中路，挡住黑车的进攻路线。',
    instruction: '红方走棋 · 用红车挡住将军', answer: '车一平五',
    answerAliases: ['车1平5', '車一平五', '居一平五', '车衣平五'],
    pieces: [
      piece('black-general', '将', 'black', 'general', 0, 4),
      piece('black-rook', '车', 'black', 'rook', 1, 4),
      piece('red-rook', '车', 'red', 'rook', 8, 8),
      piece('red-general', '帅', 'red', 'general', 9, 4),
      piece('red-advisor-a', '仕', 'red', 'advisor', 9, 3),
      piece('red-advisor-b', '仕', 'red', 'advisor', 9, 5),
    ],
    move: move('red-rook', 8, 8, 8, 4, '车一平五'),
    hints: ['黑车沿着中路直攻红帅，要堵住这条线。', '右边的红车可以横着走到中路。', '选中红车，再走到红帅前面：车一平五。'],
    successTitle: '成功解围！', successText: '红车挡在中路，黑车不能继续攻击红帅了。', reward: 10,
  },
  {
    id: 'horse-check', number: '03', category: '进攻',
    title: '找到一步漂亮的马将军！',
    description: '观察黑将周围，红马能跳到哪个位置？',
    instruction: '红方走棋 · 用红马将军', answer: '马三进四',
    answerAliases: ['马3进4', '馬三進四', '马山进四', '马三近四'],
    pieces: [
      piece('black-general', '将', 'black', 'general', 0, 4),
      piece('black-advisor-a', '士', 'black', 'advisor', 0, 3),
      piece('black-advisor-b', '士', 'black', 'advisor', 0, 5),
      piece('red-horse', '马', 'red', 'horse', 3, 6),
      piece('red-general', '帅', 'red', 'general', 9, 4),
      piece('red-advisor-a', '仕', 'red', 'advisor', 9, 3),
      piece('red-advisor-b', '仕', 'red', 'advisor', 9, 5),
    ],
    move: move('red-horse', 3, 6, 1, 5, '马三进四'),
    hints: ['马走“日”字，看看黑将右下方的位置。', '红马可以向前跳两格、向左跳一格。', '选中红马，再点黑将右下方：马三进四。'],
    successTitle: '马到成功！', successText: '红马跳到将旁边，形成了一步漂亮的将军。', reward: 10,
  },
]

function piece(id: string, text: string, side: Side, kind: PieceKind, row: number, col: number): Piece {
  return { id, text, side, kind, row, col }
}

function move(pieceId: string, fromRow: number, fromCol: number, toRow: number, toCol: number, notation: string): Move {
  return { pieceId, from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol }, notation }
}

export function sameSquare(a: Square, b: Square) {
  return a.row === b.row && a.col === b.col
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
  const matched = candidates.some((candidate) => candidate === normalized || normalized.includes(candidate) || editDistance(candidate, normalized) <= 1)
  return matched ? { matched: true, notation: level.answer } : { matched: false, normalized }
}

export function normalizeMoveText(text: string) {
  const replacements: Record<string, string> = {
    '砲': '炮', '跑': '炮', '車': '车', '居': '车', '馬': '马', '進': '进', '近': '进',
    '衣': '一', '壹': '一', '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '7': '七', '8': '八', '9': '九',
    '伍': '五', '肆': '四',
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
