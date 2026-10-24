import { describe, expect, it } from 'vitest'
import wukongRecords from '../data/puzzles/wukong.json'
import { applyMove, hasFacingGenerals, isLegalMove, normalizeMoveText, parseVoiceMove } from './chess'
import { puzzleToLevel, type PuzzleRecord } from './puzzles'

const source = { id: 'wukong-xiangqi', name: 'Wukong Xiangqi', url: 'https://github.com/maksimKorzh/wukong-xiangqi', license: 'MIT', role: '经过搜索验证的将杀局面' } as const
const levels = wukongRecords.slice(0, 4).map((record, index) => puzzleToLevel({ ...record, source } as PuzzleRecord, index))

describe('象棋规则', () => {
  it('Wukong 训练局面不会出现帅将对脸', () => {
    for (const level of levels) expect(hasFacingGenerals(level.pieces), level.id).toBe(false)
  })

  it('标准答案可由训练规则执行并移动正确棋子', () => {
    for (const level of levels) {
      expect(isLegalMove(level.pieces, level.move), level.id).toBe(true)
      const result = applyMove(level.pieces, level.move)
      expect(result.find((piece) => piece.id === level.move.pieceId)).toMatchObject(level.move.to)
    }
  })

  it('车不能越过阻挡棋子', () => {
    const level = levels[0]
    const blocked = level.pieces.map((piece) => piece.id === level.move.pieceId ? { ...piece, row: 3 } : piece)
    blocked.push({ id: 'block', text: '兵', side: 'red', kind: 'pawn', row: 1, col: 4 })
    expect(isLegalMove(blocked, { ...level.move, from: { row: 3, col: 4 }, to: { row: 0, col: 4 } })).toBe(false)
  })

  it('不会执行起点与答案不一致的走法', () => {
    expect(isLegalMove(levels[0].pieces, { ...levels[0].move, from: { row: 0, col: 0 } })).toBe(false)
  })
})

describe('语音棋谱解析', () => {
  it.each([
    ['车五进一', 0], ['車五進一。', 0], ['车5进1', 0],
    ['炮三平四', 1], ['跑山坪肆', 1],
    ['炮三进二', 2], ['炮3进2', 2],
    ['马一进三', 3], ['馬1進3', 3],
  ])('将“%s”匹配到当前 Wukong 题目答案', (text, levelIndex) => {
    expect(parseVoiceMove(text, levels[levelIndex]).matched).toBe(true)
  })

  it('不会把其他题目的答案误匹配到当前题目', () => {
    expect(parseVoiceMove('马一进三', levels[0]).matched).toBe(false)
  })

  it('归一化常见同音字和数字', () => {
    expect(normalizeMoveText('跑 5 近 5！')).toBe('炮五进五')
    expect(normalizeMoveText('车2坪山')).toBe('车二平三')
  })
})
