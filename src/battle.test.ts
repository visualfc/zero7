import { describe, expect, it, vi } from 'vitest'
import { BATTLE_RULES, capturedAiPieceName, capturedPieceName, describeAiResponse, describeBattleTurn, describeMove, describePlayerMove, describeResponse } from './battle-rules'
import { battlePieces, battleStatus, buildBattleReview, chooseAiMove, createBattle, findVoiceMove, isChessMoveTranscript, legalTargets, makeBattleMove, pointToSquare, squareToPoint, terminalType, VoiceMoveAuthorization } from './battle'
import { normalizeMoveText } from './chess'

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
    expect(findVoiceMove(game, '马二进三。')?.lan).toBe('h0g2')
    expect(findVoiceMove(game, '去一进二')?.lan).toBe('i0i2')
    expect(findVoiceMove(game, '车1进2')?.lan).toBe('i0i2')
    expect(findVoiceMove(game, '吗二进三')?.lan).toBe('h0g2')
    expect(findVoiceMove(game, '向七敬酒。')?.zh).toBe('相七进九')
    expect(findVoiceMove(game, '马二进五')).toBeNull()
    expect(isChessMoveTranscript('马二进五')).toBe(true)
    expect(isChessMoveTranscript('泡五瓶二。')).toBe(true)
    expect(isChessMoveTranscript('居酒平吧。')).toBe(true)
    expect(isChessMoveTranscript('天气很好')).toBe(false)
  })

  it('按拼音和当前合法着识别同音棋步，数字也按读音匹配', () => {
    const game = createBattle()
    game.move('h2e2')
    game.move('a6a5')
    expect(findVoiceMove(game, '泡五瓶二。')?.zh).toBe('炮五平二')
    expect(findVoiceMove(game, '袍五苹二')?.lan).toBe('e2h2')
    expect(findVoiceMove(game, '司四进五')?.zh).toBe('仕四进五')
    expect(findVoiceMove(game, '像三进一')?.zh).toBe('相三进一')
    expect(findVoiceMove(game, '摔五进一')?.zh).toBe('帅五进一')
    expect(findVoiceMove(game, '兵五进一')?.zh).toBe('兵五进一')
    expect(findVoiceMove(game, '泡五瓶九')).toBeNull()
    const rook = createBattle()
    rook.move('b0c2')
    rook.move('a6a5')
    expect(findVoiceMove(rook, '居酒平吧。')?.zh).toBe('车九平八')
    const black = createBattle()
    black.move('h2e2')
    expect(normalizeMoveText(findVoiceMove(black, '族五进一')?.zh ?? '')).toBe('卒五进一')
    expect(normalizeMoveText(findVoiceMove(black, '象三进五')?.zh ?? '')).toBe('象三进五')
    expect(normalizeMoveText(findVoiceMove(black, '士四进五')?.zh ?? '')).toBe('士四进五')
    expect(normalizeMoveText(findVoiceMove(black, '将五进一')?.zh ?? '')).toBe('将五进一')
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
    expect(describeBattleTurn(player as never, normalAi as never)).toBe('你走马二进三。零七应对马８进７。')
    expect(describePlayerMove({ ...player, isCheck: true } as never)).toBe('你走马二进三，将军。')
    expect(describePlayerMove({ ...player, captured: 'r', isCheck: true } as never)).toBe('你走马二进三，吃掉了红车，将军。')
    expect(describeAiResponse(normalAi as never)).toBe('零七应对马８进７。')
    expect(describeAiResponse({ ...normalAi, isCheck: true } as never)).toBe('零七应对马８进７，将军。')
    expect(capturedAiPieceName('r')).toBe('红车')
    expect(describeMove({ ...player, color: 'b', captured: 'r' } as never, '零七', 'w')).toBe('零七走马二进三，吃掉了红车。')
    expect(describeResponse({ ...normalAi, color: 'w', captured: 'p' } as never, '玩家', 'b')).toBe('玩家应对马８进７，吃掉了黑卒。')
    expect(describeAiResponse({ ...normalAi, captured: 'r' } as never)).toBe('零七应对马８进７，吃掉了红车。')
    expect(describeBattleTurn(player as never)).toBe('你走马二进三。')
    expect(BATTLE_RULES.aiThinkDelayMs).toBe(2000)
    expect(BATTLE_RULES.turnReminderDelayMs).toBe(60000)
    expect(capturedPieceName('r')).toBe('黑车')
    expect(describeBattleTurn({ ...player, captured: 'p' } as never, normalAi as never)).toBe('你走马二进三，吃掉了红兵。零七应对马８进７。')
    expect(describeBattleTurn(player as never, { ...normalAi, isCheck: true } as never)).toContain('将军')
    expect(describeBattleTurn(player as never, { ...normalAi, isCheckmate: true } as never)).toContain('形成将死')
    expect(describeBattleTurn({ ...player, isCheckmate: true } as never)).toContain('赢下这一局')
  })

  it('生成对局复盘摘要', () => {
    const game = createBattle()
    game.move('h0g2')
    game.move('h9g7')
    expect(buildBattleReview(game)).toContain('本局共进行1回合')
    expect(buildBattleReview(game)).toContain('最后一步是马８进７')
    expect(buildBattleReview(game, true)).toContain('你选择认输')
  })

  it('区分闷杀、绝杀和困毙杀', () => {
    const smothered = {
      isCheckmate: () => true,
      turn: () => 'b',
      board: () => [[
        { square: 'e9', color: 'b', type: 'k' },
        { square: 'e8', color: 'b', type: 'a' },
        { square: 'd9', color: 'b', type: 'r' },
        { square: 'f9', color: 'b', type: 'r' },
      ]],
    } as never
    const exposed = {
      isCheckmate: () => true,
      turn: () => 'b',
      board: () => [[{ square: 'e9', color: 'b', type: 'k' }]],
    } as never
    expect(terminalType(smothered)).toBe('闷杀')
    expect(terminalType(exposed)).toBe('绝杀')
    expect(terminalType({ isCheckmate: () => false } as never)).toBe('困毙杀')
  })

  it('返回不同终局和回合状态', () => {
    const status = (overrides: Record<string, unknown>) => battleStatus({
      isCheckmate: () => false, isStalemate: () => false, isDraw: () => false,
      isCheck: () => false, turn: () => 'w', ...overrides,
    } as never)
    expect(status({})).toBe('轮到红方走棋')
    expect(status({ turn: () => 'b' })).toBe('零七正在思考…')
    expect(status({ isCheck: () => true })).toContain('红方被将军')
    expect(status({ isCheck: () => true, turn: () => 'b' })).toBe('黑方被将军。')
    expect(status({ isDraw: () => true })).toBe('本局和棋。')
    expect(status({ isStalemate: () => true })).toBe('本局困毙，和棋。')
    expect(status({ isCheckmate: () => true })).toContain('黑方获胜')
    expect(status({ isCheckmate: () => true, turn: () => 'b' })).toContain('红方获胜')
  })

  it('AI 支持初级随机着和大师评分着', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const game = createBattle()
    expect(chooseAiMove(game, '初级')).toBeTruthy()
    expect(chooseAiMove(game, '高级')).toBeTruthy()
    expect(chooseAiMove(game, '大师')).toBeTruthy()
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
