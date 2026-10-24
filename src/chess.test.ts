import { describe, expect, it } from 'vitest'
import { applyMove, hasFacingGenerals, isHorseAttacking, isLegalMove, levels, normalizeMoveText, parseVoiceMove } from './chess'

describe('象棋规则', () => {
  it('所有训练局面都不会出现帅将对脸', () => {
    for (const level of levels) expect(hasFacingGenerals(level.pieces), level.id).toBe(false)
  })

  it('第三关目标走法确实形成马将军且没有蹩马腿', () => {
    const level = levels[2]
    const result = applyMove(level.pieces, level.move)
    const blackGeneral = result.find((piece) => piece.id === 'black-general')!
    expect(isHorseAttacking(result, 'red-horse', blackGeneral)).toBe(true)
    expect(isHorseAttacking(result, 'missing-horse', blackGeneral)).toBe(false)
    expect(isHorseAttacking(result, 'red-horse', { row: 0, col: 4 })).toBe(false)
    expect(isHorseAttacking([...result, { id: 'horse-leg', text: '卒', side: 'black', kind: 'pawn', row: 1, col: 4 }], 'red-horse', blackGeneral)).toBe(false)
    expect(isHorseAttacking([{ id: 'vertical-horse', text: '马', side: 'red', kind: 'horse', row: 2, col: 4 }], 'vertical-horse', { row: 0, col: 3 })).toBe(true)
  })

  it('炮隔着一枚棋子时可以吃掉目标', () => {
    const level = levels[0]
    expect(isLegalMove(level.pieces, level.move)).toBe(true)
    const result = applyMove(level.pieces, level.move)
    expect(result.find((piece) => piece.id === 'red-cannon')).toMatchObject(level.move.to)
    expect(result.some((piece) => piece.id === 'black-rook')).toBe(false)
  })

  it('炮没有炮架时不能吃子', () => {
    const level = levels[0]
    const withoutScreen = level.pieces.filter((piece) => piece.id !== 'red-pawn-screen')
    expect(isLegalMove(withoutScreen, level.move)).toBe(false)
  })

  it('车不能越过其他棋子', () => {
    const level = levels[1]
    expect(isLegalMove(level.pieces, level.move)).toBe(true)
    const blocked = [...level.pieces, { id: 'block', text: '兵', side: 'red' as const, kind: 'pawn' as const, row: 8, col: 6 }]
    expect(isLegalMove(blocked, level.move)).toBe(false)
  })

  it('马被蹩腿时不能走', () => {
    const level = levels[2]
    expect(isLegalMove(level.pieces, level.move)).toBe(true)
    const blocked = [...level.pieces, { id: 'block', text: '兵', side: 'red' as const, kind: 'pawn' as const, row: 2, col: 6 }]
    expect(isLegalMove(blocked, level.move)).toBe(false)
  })
})

describe('语音棋谱解析', () => {
  it.each([
    ['炮五进五', 0], ['跑五进五。', 0], ['炮5进5', 0],
    ['车衣平五', 1], ['車一平五', 1],
    ['马山进四', 2], ['马3进4', 2],
  ])('将“%s”匹配到当前关卡答案', (text, levelIndex) => {
    expect(parseVoiceMove(text, levels[levelIndex]).matched).toBe(true)
  })

  it('不会把其他关卡的答案误匹配到当前关卡', () => {
    expect(parseVoiceMove('马三进四', levels[0]).matched).toBe(false)
  })

  it('归一化常见同音字和数字', () => {
    expect(normalizeMoveText('跑 5 近 5！')).toBe('炮五进五')
    expect(normalizeMoveText('车2坪山')).toBe('车二平三')
  })
})
