import { describe, expect, it, vi } from 'vitest'
import { battlePieces, battleStatus, chooseAiMove, createBattle, describeBattleTurn, findVoiceMove, legalTargets, makeBattleMove, pointToSquare, squareToPoint, VoiceMoveAuthorization } from './battle'

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

  it('从语音识别结果匹配当前合法中文棋谱', () => {
    const game = createBattle()
    expect(findVoiceMove(game, '我走马二进三。')?.lan).toBe('h0g2')
    expect(findVoiceMove(game, '马二进五')).toBeNull()
  })

  it('每次语音授权只允许消费一个识别结果', () => {
    const authorization = new VoiceMoveAuthorization()
    expect(authorization.consume()).toBe(false)
    authorization.arm()
    expect(authorization.consume()).toBe(true)
    expect(authorization.consume()).toBe(false)
    authorization.arm()
    authorization.cancel()
    expect(authorization.consume()).toBe(false)
  })

  it('生成普通、吃子、将军和将死回合讲解', () => {
    const player = { zh: '马二进三', isCheckmate: false, captured: undefined }
    const normalAi = { zh: '马８进７', isCheckmate: false, isCheck: false }
    expect(describeBattleTurn(player as never, normalAi as never)).toBe('你走马二进三，零七应对马８进７。轮到你继续走棋。')
    expect(describeBattleTurn(player as never)).toBe('你走马二进三。')
    expect(describeBattleTurn({ ...player, captured: 'p' } as never, normalAi as never)).toContain('完成吃子')
    expect(describeBattleTurn(player as never, { ...normalAi, isCheck: true } as never)).toContain('红方正被将军')
    expect(describeBattleTurn(player as never, { ...normalAi, isCheckmate: true } as never)).toContain('形成将死')
    expect(describeBattleTurn({ ...player, isCheckmate: true } as never)).toContain('赢下这一局')
  })

  it('返回不同终局和回合状态', () => {
    const status = (overrides: Record<string, unknown>) => battleStatus({
      isCheckmate: () => false, isStalemate: () => false, isDraw: () => false,
      isCheck: () => false, turn: () => 'w', ...overrides,
    } as never)
    expect(status({})).toBe('轮到红方走棋')
    expect(status({ turn: () => 'b' })).toBe('ZERO7 正在思考…')
    expect(status({ isCheck: () => true })).toContain('红方被将军')
    expect(status({ isCheck: () => true, turn: () => 'b' })).toBe('黑方被将军。')
    expect(status({ isDraw: () => true })).toBe('本局和棋。')
    expect(status({ isStalemate: () => true })).toBe('本局困毙，和棋。')
    expect(status({ isCheckmate: () => true })).toContain('黑方获胜')
    expect(status({ isCheckmate: () => true, turn: () => 'b' })).toContain('红方获胜')
  })

  it('AI 支持入门随机着和中级评分着', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const game = createBattle()
    expect(chooseAiMove(game, '入门')).toBeTruthy()
    expect(chooseAiMove(game, '中级')).toBeTruthy()
    expect(chooseAiMove({ moves: () => [] } as never, '初级')).toBeNull()
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
