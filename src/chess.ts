import { pinyin } from 'pinyin-pro'

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

const NUMBER_CHARACTERS = new Set('一二三四五六七八九')
const CHESS_READINGS: Record<string, string[]> = {
  车: ['ju', 'che'],
  马: ['ma'],
  炮: ['pao'],
  兵: ['bing'],
  卒: ['zu'],
  相: ['xiang'],
  象: ['xiang'],
  仕: ['shi'],
  士: ['shi'],
  帅: ['shuai'],
  将: ['jiang'],
  进: ['jin'],
  退: ['tui'],
  平: ['ping'],
  前: ['qian'],
  后: ['hou'],
  中: ['zhong'],
  左: ['zuo'],
  右: ['you'],
  上: ['shang'],
  下: ['xia'],
  一: ['yi'],
  二: ['er'],
  三: ['san'],
  四: ['si'],
  五: ['wu'],
  六: ['liu'],
  七: ['qi'],
  八: ['ba'],
  九: ['jiu'],
}
const pinyinCache = new Map<string, string[]>()

export function parseVoiceMove(text: string, level: Level): ParseResult {
  const normalized = normalizeMoveText(text)
  const candidates = [level.answer, ...level.answerAliases].map(normalizeMoveText)
  const matched = candidates.some((candidate) => notationMatchesSpeech(normalized, candidate))
  return matched ? { matched: true, notation: level.answer } : { matched: false, normalized }
}

export function normalizeMoveText(text: string) {
  const replacements: Record<string, string> = {
    '砲': '炮', '跑': '炮', '車': '车', '居': '车', '去': '车', '馬': '马', '進': '进', '近': '进', '晋': '进', '借': '进',
    '退': '退', '平': '平', '坪': '平', '评': '平',
    '衣': '一', '壹': '一', '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '7': '七', '8': '八', '9': '九',
    '１': '一', '２': '二', '３': '三', '４': '四', '５': '五', '６': '六', '７': '七', '８': '八', '９': '九',
    '伍': '五', '肆': '四', '贰': '二', '貳': '二', '陆': '六', '陸': '六', '柒': '七', '捌': '八', '玖': '九',
    '两': '二', '兩': '二', '俩': '二', '倆': '二', '儿': '二', '山': '三', '叁': '三', '杉': '三', '散': '三',
  }
  return text.trim().replace(/[，。！？,.!?、\s]/g, '').split('').map((character) => replacements[character] ?? character).join('')
}

export function looksLikeChessMove(text: string) {
  const normalized = normalizeMoveText(text).replace(/^(我走|走)/, '')
  const flags = [...normalized].map((character) => isNumberSound(character))
  if (flags.length === 4 && !flags[0] && flags[1] && !flags[2] && flags[3]) return true
  if (flags.length === 4 && '前后中左右上下'.includes(normalized[0]) && !flags[1] && !flags[2] && flags[3]) return true
  if (flags.length === 5 && '前后中左右上下'.includes(normalized[0]) && !flags[1] && flags[2] && !flags[3] && flags[4]) return true
  return false
}

export function notationMatchesSpeech(speech: string, notation: string) {
  const spoken = normalizeMoveText(speech)
  const expected = normalizeMoveText(notation)
  if (!expected) return false
  if (spoken === expected || spoken.includes(expected)) return true
  if (spoken.length < expected.length) return false
  for (let start = 0; start <= spoken.length - expected.length; start += 1) {
    if (windowMatchesNotation(spoken.slice(start, start + expected.length), expected)) return true
  }
  return false
}

function windowMatchesNotation(window: string, expected: string) {
  for (let index = 0; index < expected.length; index += 1) {
    if (!sameMoveSound(window[index], expected[index])) return false
  }
  return true
}

function isNumberSound(character: string) {
  if (NUMBER_CHARACTERS.has(character)) return true
  const keys = characterSoundKeys(character)
  return [...NUMBER_CHARACTERS].some((number) => keys.some((key) => chessSoundKeys(number).includes(key)))
}

function sameMoveSound(spoken: string, expected: string) {
  if (spoken === expected) return true
  const expectedKeys = chessSoundKeys(expected)
  return characterSoundKeys(spoken).some((key) => expectedKeys.includes(key))
}

function chessSoundKeys(character: string) {
  const readings = CHESS_READINGS[character]
  if (readings) return uniqueKeys(readings.map(syllableKey))
  return characterSoundKeys(character)
}

function characterSoundKeys(character: string) {
  const cached = pinyinCache.get(character)
  if (cached) return cached
  const result = pinyin(character, { toneType: 'none', type: 'array', multiple: true })
  const readings = (Array.isArray(result) ? result : String(result).split(/\s+/)).flatMap((item) => String(item).split(/\s+/))
  const keys = uniqueKeys(readings.map(syllableKey).filter(Boolean))
  pinyinCache.set(character, keys)
  return keys
}

function syllableKey(syllable: string) {
  let normalized = syllable.toLowerCase().replace(/ü/g, 'v').replace(/[^a-z]/g, '')
  if (normalized.startsWith('zh')) normalized = `z${normalized.slice(2)}`
  else if (normalized.startsWith('ch')) normalized = `c${normalized.slice(2)}`
  else if (normalized.startsWith('sh')) normalized = `s${normalized.slice(2)}`
  if (normalized.endsWith('ing') || normalized.endsWith('eng')) return normalized.slice(0, -1)
  return normalized
}

function uniqueKeys(keys: string[]) {
  return [...new Set(keys)]
}
