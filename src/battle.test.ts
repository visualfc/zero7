import { describe, expect, it, vi } from 'vitest'
import { battlePieces, chooseAiMove, createBattle, legalTargets, makeBattleMove, pointToSquare, squareToPoint } from './battle'

describe('完整人机对战规则', () => {
  it('正确转换棋盘坐标', () => {
    expect(squareToPoint('a9')).toEqual({ row: 0, col: 0 })
    expect(squareToPoint('i0')).toEqual({ row: 9, col: 8 })
    expect(pointToSquare({ row: 7, col: 1 })).toBe('b2')
  })

  it('标准开局包含 32 枚棋子', () => {
    expect(battlePieces(createBattle())).toHaveLength(32)
  })

  it('规则引擎生成马二进三对应的合法目标', () => {
    const game = createBattle()
    const targets = legalTargets(game, { row: 9, col: 7 })
    expect(targets).toContainEqual({ row: 7, col: 6 })
  })

  it('执行合法着并拒绝非法着', () => {
    const game = createBattle()
    expect(makeBattleMove(game, { row: 9, col: 7 }, { row: 7, col: 6 })?.zh).toBe('马二进三')
    expect(makeBattleMove(game, { row: 0, col: 1 }, { row: 1, col: 1 })).toBeNull()
  })

  it('AI 能从当前局面的合法着中选择一步', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const game = createBattle()
    game.move('h0g2')
    const aiMove = chooseAiMove(game, '初级')
    const legal = game.moves({ verbose: true })
    expect(legal.some((move) => move.from === aiMove?.from && move.to === aiMove?.to)).toBe(true)
  })
})
