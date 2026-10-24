import type { Move } from '@weshell/xiangqi.js'

export const BATTLE_RULES = {
  brandName: '零七',
  aiThinkDelayMs: 2000,
  moveAnimationMs: 1250,
  captureAnimationMs: 1200,
  voicePlaybackSettleMs: 120,
  invalidMovePrompt: (text: string) => `听到“${text}”，这步棋现在不能走，请重新说当前局面可以走的走法。`,
  unclearMovePrompt: (text: string) => `听到“${text}”，没听明白，请重新说。`,
} as const

const pieceNames: Record<'w' | 'b', Record<string, string>> = {
  w: { k: '红帅', a: '红仕', b: '红相', n: '红马', r: '红车', c: '红炮', p: '红兵' },
  b: { k: '黑将', a: '黑士', b: '黑象', n: '黑马', r: '黑车', c: '黑炮', p: '黑卒' },
}

type Side = 'w' | 'b'

export function capturedPieceName(pieceType: string | undefined, side: Side = 'b') {
  return pieceType ? pieceNames[side][pieceType] ?? '对方棋子' : '对方棋子'
}

export function describeMove(move: Move, speaker = '你', capturedSide: Side = move.color === 'w' ? 'b' : 'w') {
  if (move.isCheckmate) return `${speaker}走${move.zh}，完成将死，赢下这一局。`
  if (move.captured) return `${speaker}走${move.zh}，吃掉了${capturedPieceName(move.captured, capturedSide)}。`
  return `${speaker}走${move.zh}。`
}

export function describePlayerMove(playerMove: Move) {
  return describeMove(playerMove, '你')
}

export function capturedAiPieceName(pieceType: string | undefined) {
  return capturedPieceName(pieceType, 'w')
}

export function describeResponse(move: Move, speaker: string = BATTLE_RULES.brandName, capturedSide: Side = move.color === 'w' ? 'b' : 'w') {
  const capture = move.captured ? `，吃掉了${capturedPieceName(move.captured, capturedSide)}` : ''
  if (move.isCheckmate) return `${speaker}应对${move.zh}${capture}，形成将死。`
  if (move.isCheck) return `${speaker}应对${move.zh}${capture}，对方正在被将军，请先应将。`
  return `${speaker}应对${move.zh}${capture}。轮到你继续走棋。`
}

export function describeAiResponse(aiMove: Move) {
  return describeResponse(aiMove)
}

export function describeBattleTurn(playerMove: Move, aiMove?: Move | null) {
  if (!aiMove) return describePlayerMove(playerMove)
  return `${describePlayerMove(playerMove)}${describeAiResponse(aiMove)}`
}
