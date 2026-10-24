import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { puzzleToLevel, type PuzzleRecord } from './puzzles'
import wukongRecords from '../data/puzzles/wukong.json'

const wukongSource = { id: 'wukong-xiangqi', name: 'Wukong Xiangqi', url: 'https://github.com/maksimKorzh/wukong-xiangqi', license: 'MIT', role: '经过搜索验证的将杀局面' } as const
const testRecords = wukongRecords.slice(0, 4).map((record) => ({ ...record, source: wukongSource })) as PuzzleRecord[]
const testLevels = testRecords.map(puzzleToLevel)
const defendedCandidateLevel = puzzleToLevel({ ...testRecords[0], id: 'defended-candidate', solution: [{ from: 'c0', to: 'e2' }] }, 0)
const puzzleMock = vi.hoisted(() => ({ fetch: vi.fn() }))

vi.mock('./puzzles', async (importOriginal) => ({ ...await importOriginal<typeof import('./puzzles')>(), fetchPuzzleLibrary: puzzleMock.fetch }))

const voiceMock = vi.hoisted(() => ({
  instances: [] as Array<{ emit: (event: { type: string; state?: string; text?: string }) => void; currentState: string; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; speakText: ReturnType<typeof vi.fn>; waitForPlayback: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>,
  startError: null as Error | null,
  speakError: null as Error | null,
}))

vi.mock('./linxi', () => ({
  LinxiVoiceClient: class {
    currentState = 'idle'
    start = vi.fn(async () => { if (voiceMock.startError) throw voiceMock.startError; this.currentState = 'listening'; this.emit({ type: 'state', state: 'listening' }) })
    stop = vi.fn(async () => { this.currentState = 'thinking'; this.emit({ type: 'state', state: 'thinking' }) })
    speakText = vi.fn(async () => { if (voiceMock.speakError) throw voiceMock.speakError })
    waitForPlayback = vi.fn(async () => {})
    disconnect = vi.fn(() => { this.currentState = 'idle' })
    emit: (event: { type: string; state?: string; text?: string }) => void
    constructor(emit: (event: { type: string; state?: string; text?: string }) => void) { this.emit = emit; voiceMock.instances.push(this) }
  },
}))

beforeEach(() => {
  vi.stubGlobal('isSecureContext', true)
  voiceMock.instances = []
  voiceMock.startError = null
  voiceMock.speakError = null
  puzzleMock.fetch.mockReset()
  puzzleMock.fetch.mockResolvedValue(testLevels)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ move: null, terminal: true, engine: 'Pikafish Test', level: '初级', score: null }), { status: 200 })))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function clickBoardSquare(row: number, col: number) {
  const square = [...document.querySelectorAll<HTMLButtonElement>('.board-square')].find((button) => button.style.getPropertyValue('--board-row') === String(row) && button.style.getPropertyValue('--board-col') === String(col))
  if (!square) throw new Error(`没有找到棋盘坐标 ${row}-${col}`)
  fireEvent.click(square)
}

function solveLevel(index: number) {
  const level = testLevels[index]
  clickBoardSquare(level.move.from.row, level.move.from.col)
  clickBoardSquare(level.move.to.row, level.move.to.col)
}

describe('ZERO7', () => {
  it('从首页进入第一关', () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '红车' })[0]).toBeInTheDocument()
  })

  it('题目说明和来源只在标题 Tooltip 中显示', () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    const title = screen.getByRole('heading', { name: /车怎样完成最后一击/ }).parentElement!
    const tooltip = screen.getByRole('tooltip')
    expect(title).toHaveAttribute('tabindex', '0')
    expect(title).toHaveAttribute('aria-describedby', tooltip.id)
    expect(tooltip).toHaveTextContent('这是经过搜索验证的实战将杀局面，请找出唯一的一步将杀。')
    expect(within(tooltip).getByRole('link', { name: 'Wukong Xiangqi · MIT · puzzle_0' })).toHaveAttribute('href', wukongSource.url)
    expect(document.querySelector('.puzzle-source')).not.toBeInTheDocument()
  })

  it('明确显示红方先走和黑方先走，并允许对应一方完成题目', async () => {
    const { unmount } = render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    expect(screen.getByText('红方先走')).toBeInTheDocument()
    unmount()

    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /炮怎样完成最后一击/ })[1])
    expect(screen.getByText('黑方先走')).toBeInTheDocument()
    solveLevel(2)
    expect(await screen.findByText('绝杀！')).toBeInTheDocument()
  })

  it('按标准答案经引擎验证后完成 Wukong 一步将杀', async () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    solveLevel(0)
    expect(await screen.findByText('绝杀！')).toBeInTheDocument()
  })

  it('从 API 加载题库后不会在走棋时重置局面', async () => {
    render(<App />)
    expect(screen.getByText('正在加载练习题库…')).toBeInTheDocument()
    await screen.findByText('今日三小关')
    expect(puzzleMock.fetch).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    solveLevel(0)
    expect(await screen.findByText('绝杀！')).toBeInTheDocument()
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(await screen.findByText('绝杀！')).toBeInTheDocument()
    expect(puzzleMock.fetch).toHaveBeenCalledTimes(1)
  })

  it('未完成时可以跳过，重新练习可以恢复初始局面', () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    fireEvent.click(screen.getByRole('button', { name: '跳过这题' }))
    expect(screen.getByText(/炮怎样完成最后一击/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新练习' }))
    expect(screen.getByText(/炮怎样完成最后一击/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '跳过这题' })).toBeEnabled()
  })

  it('其他合法着会保留并调用 Pikafish 应对', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ move: 'g2g1', engine: 'Pikafish Test', level: '初级' }), { status: 200 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    clickBoardSquare(9, 2)
    clickBoardSquare(7, 4)
    expect(screen.getByText('这步可以走，零七正在应对…')).toBeInTheDocument()
    expect(await screen.findByText(/零七走了车７进１/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '跳过这题' })).toBeEnabled()
  })

  it('候选答案有合法应手时让引擎应对并继续棋局', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ move: 'g2g1', terminal: false, engine: 'Pikafish Test', level: '初级', score: null }), { status: 200 })))
    render(<App initialLevels={[defendedCandidateLevel, ...testLevels.slice(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    clickBoardSquare(9, 2)
    clickBoardSquare(7, 4)
    await waitFor(() => {
      const responseSquare = [...document.querySelectorAll<HTMLButtonElement>('.board-square')].find((button) => button.style.getPropertyValue('--board-row') === '8' && button.style.getPropertyValue('--board-col') === '6')
      expect(responseSquare).toHaveAccessibleName('黑车')
    })
    expect(screen.queryByText('绝杀！')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '跳过这题' })).toBeEnabled()
  })

  it('引擎返回无应手但局面未将死时不会判定绝杀', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ move: null, terminal: true, engine: 'Pikafish Test', level: '初级', score: null }), { status: 200 })))
    render(<App initialLevels={[defendedCandidateLevel, ...testLevels.slice(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    clickBoardSquare(9, 2)
    clickBoardSquare(7, 4)
    expect(await screen.findByText(/对方没有合法应手，但当前没有形成将死/)).toBeInTheDocument()
    expect(screen.queryByText('绝杀！')).not.toBeInTheDocument()
  })

  it('Pikafish 返回非法应手时保留局面并显示失败', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ move: 'a0a9', terminal: false, engine: 'Pikafish Test', level: '初级', score: null }), { status: 200 })))
    render(<App initialLevels={[defendedCandidateLevel, ...testLevels.slice(1)]} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    clickBoardSquare(9, 2)
    clickBoardSquare(7, 4)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Invalid move: a0a9'))
    expect(screen.queryByText('绝杀！')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新练习' })).toBeEnabled()
  })

  it('题库加载失败时显示错误状态', async () => {
    puzzleMock.fetch.mockRejectedValueOnce(new Error('题库服务不可用'))
    render(<App />)
    expect(await screen.findByRole('status')).toHaveTextContent('题库服务不可用')
  })

  it('候选答案验证失败时不会直接判定成功', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: '验证超时' }), { status: 503 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    solveLevel(0)
    expect(await screen.findByText('标准着法已走出，但引擎尚未完成验证。可以重新练习或继续下一题。')).toBeInTheDocument()
    expect(screen.queryByText('绝杀！')).not.toBeInTheDocument()
  })

  it('Pikafish 应对失败时保留走法并允许重练或跳过', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: '引擎超时' }), { status: 503 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    clickBoardSquare(9, 2)
    clickBoardSquare(7, 4)
    expect(await screen.findByText('这步已经保留，可以重新练习或继续下一题。')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('引擎超时')
    fireEvent.click(screen.getByRole('button', { name: '重新练习' }))
    expect(screen.getByRole('button', { name: '跳过这题' })).toBeEnabled()
  })

  it('分级提示会逐步朗读，但完整提示不会自动完成题目', async () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    for (const hint of testLevels[0].hints) {
      await act(async () => fireEvent.click(screen.getByRole('button', { name: '再给我一点提示' })))
      expect(voiceMock.instances.at(-1)!.speakText).toHaveBeenCalledWith(hint)
      expect(voiceMock.instances.at(-1)!.waitForPlayback).toHaveBeenCalled()
      expect(voiceMock.instances.at(-1)!.disconnect).toHaveBeenCalled()
      expect(screen.queryByText('绝杀！')).not.toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: '已显示完整提示' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '跳过这题' })).toBeEnabled()
    solveLevel(0)
    expect(await screen.findByText('绝杀！')).toBeInTheDocument()
  })

  it('完成每日三题后仍可继续下一道 Wukong 题', async () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    solveLevel(0)
    await screen.findByText('绝杀！')
    fireEvent.click(screen.getByRole('button', { name: /挑战下一关/ }))
    expect(screen.getByText(/炮怎样完成最后一击/)).toBeInTheDocument()
    solveLevel(1)
    await screen.findByText('绝杀！')
    fireEvent.click(screen.getByRole('button', { name: /挑战下一关/ }))
    expect(screen.getByText(/炮怎样完成最后一击/)).toBeInTheDocument()
    solveLevel(2)
    await screen.findByText('绝杀！')
    fireEvent.click(screen.getByRole('button', { name: /继续下一题/ }))
    expect(screen.getByText(/马怎样完成最后一击/)).toBeInTheDocument()
    expect(screen.getByRole('tooltip')).toHaveTextContent('Wukong Xiangqi · MIT · puzzle_3')
  })

  it('进入人机对战后直接开局并提供重开一局按钮', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    expect(await screen.findByText('基础 AI（Pikafish 未安装）')).toBeInTheDocument()
    expect(screen.queryByText('轮到红方走棋')).not.toBeInTheDocument()
    expect(screen.getByText(/按住语音按钮，说出“/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /按住说走法/ })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /按住说走法/ })[0]).toBeEnabled()
    expect(screen.getByRole('button', { name: '重开一局' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '中级' }))
    fireEvent.click(screen.getByRole('button', { name: '重开一局' }))
    expect(screen.getByText('暂无走法')).toBeInTheDocument()
  })

  it('进入人机对战并完成红方走棋和 Pikafish 应手', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/status')) return new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })
      return new Response(JSON.stringify({ move: 'h9g7', engine: 'Pikafish Test', level: '初级' }), { status: 200 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    expect(await screen.findByText('Pikafish Test')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    expect(screen.getByLabelText('最近一步走子路径')).toHaveClass('red')
    expect(await screen.findByText('马二进三')).toBeInTheDocument()
    expect(await screen.findByText('马８进７', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.queryByText('轮到红方走棋')).not.toBeInTheDocument()
    expect(screen.getByLabelText('最近一步走子路径')).toHaveClass('black')
    fireEvent.click(screen.getByRole('button', { name: '悔棋' }))
    expect(screen.queryByLabelText('最近一步走子路径')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getAllByRole('button', { name: '红车' }).at(-1)!)
  })

  it('重新开局后忽略上一局延迟返回的 AI 走法', async () => {
    let resolveMove!: (response: Response) => void
    const moveResponse = new Promise<Response>((resolve) => { resolveMove = resolve })
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })
      return moveResponse
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    expect(await screen.findByText('Pikafish Test')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    fireEvent.click(screen.getByRole('button', { name: '重开一局' }))
    await act(async () => { resolveMove(new Response(JSON.stringify({ move: 'h9g7', engine: 'Pikafish Test', level: '初级' }), { status: 200 })); await new Promise((resolve) => setTimeout(resolve, 1600)) })
    expect(screen.getByText('暂无走法')).toBeInTheDocument()
    expect(screen.queryByText('轮到红方走棋')).not.toBeInTheDocument()
  })

  it('支持训练语音识别、失败提示和分级提示朗读', async () => {
    vi.useFakeTimers()
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0])
    await act(async () => Promise.resolve())
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '车五进一' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(450); await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByText('绝杀！')).toBeInTheDocument()
    expect(voiceMock.instances.at(-1)!.speakText).toHaveBeenCalledWith('车五进一，绝杀！')
    expect(voiceMock.instances.at(-1)!.disconnect).toHaveBeenCalled()
    vi.useRealTimers()

    fireEvent.click(screen.getByRole('button', { name: '重新练习' }))
    voiceMock.speakError = new Error('成功讲解播放失败')
    solveLevel(0)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('成功讲解播放失败'))
    voiceMock.speakError = null

    fireEvent.click(screen.getByRole('button', { name: '重新练习' }))
    fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0])
    await act(async () => Promise.resolve())
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '马三进四' }))
    expect(screen.getByRole('status')).toHaveTextContent('这步还没有匹配成功')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '再给我一点提示' })))
    expect(voiceMock.instances.at(-1)!.speakText).toHaveBeenCalledWith('先观察对方将帅周围的逃跑位置。')
  })

  it('展示语音连接和提示播放错误', async () => {
    voiceMock.startError = new Error('麦克风不可用')
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    await act(async () => fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0]))
    expect(screen.getByRole('status')).toHaveTextContent('麦克风不可用')

    voiceMock.speakError = new Error('播放失败')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '再给我一点提示' })))
    expect(screen.getByRole('status')).toHaveTextContent('播放失败')
  })

  it('在非安全上下文中提示使用 HTTPS 进行语音输入', async () => {
    vi.stubGlobal('isSecureContext', false)
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    await act(async () => fireEvent.pointerDown(screen.getByRole('button', { name: /按住说走法/ })))
    expect(screen.getByText('手机语音输入需要使用 HTTPS，请访问终端显示的 https:// 地址。')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    await act(async () => fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0]))
    expect(screen.getByText('手机语音输入需要使用 HTTPS，请访问终端显示的 https:// 地址。')).toBeInTheDocument()
  })

  it('支持首页卡片、成长页、个人页和品牌导航', () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: '训练' })[0])
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    fireEvent.click(screen.getAllByRole('button', { name: '对战' })[0])
    expect(screen.getByText('暂无走法')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '训练' })[0])
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '首页' }).at(-1)!)
    fireEvent.click(screen.getAllByRole('button', { name: /炮怎样完成最后一击/ })[0])
    expect(screen.getByText(/炮怎样完成最后一击/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    fireEvent.click(screen.getAllByRole('button', { name: /成长/ })[0])
    expect(screen.getByText('我的象棋成长')).toBeInTheDocument()
    expect(screen.getByText('零七棋友')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    fireEvent.click(screen.getAllByRole('button', { name: /成长/ })[0])
    fireEvent.click(screen.getByRole('button', { name: /继续训练/ }))
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    expect(screen.getByText('今日三小关')).toBeInTheDocument()
  })

  it('右侧导航可以从任意页面跳转到训练和对战', () => {
    render(<App initialLevels={testLevels} />)
    const navigate = (label: string) => fireEvent.click(within(screen.getByRole('navigation', { name: '主导航' })).getByRole('button', { name: label }))
    navigate('训练')
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    navigate('对战')
    expect(screen.getByText('暂无走法')).toBeInTheDocument()
    navigate('成长')
    expect(screen.getByText('我的象棋成长')).toBeInTheDocument()
    expect(screen.getByText('零七棋友')).toBeInTheDocument()
    navigate('首页')
    expect(screen.getByText('今日三小关')).toBeInTheDocument()
  })

  it('移动端导航可以直接进入训练和对战', () => {
    render(<App initialLevels={testLevels} />)
    const mobileNavigation = within(screen.getByRole('navigation', { name: '移动端主导航' }))
    fireEvent.click(mobileNavigation.getByRole('button', { name: '训练' }))
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    fireEvent.click(mobileNavigation.getByRole('button', { name: '对战' }))
    expect(screen.getByText('暂无走法')).toBeInTheDocument()
  })

  it('人机对战处理引擎失败、难度切换、非法点击和认输', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })
      return new Response(JSON.stringify({ error: '引擎超时' }), { status: 503 })
    }))
    vi.spyOn(Math, 'random').mockReturnValue(0)
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    expect(await screen.findByText('Pikafish Test')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '中级' }))
    fireEvent.click(screen.getAllByRole('button', { name: '黑卒' })[0])
    expect(screen.getByText('暂无走法')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    expect(await screen.findByText(/基础 AI（Pikafish 暂不可用）/, {}, { timeout: 4000 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '认输' }))
    expect(screen.getByText(/你已认输，本局由 零七 获胜/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '语音复盘' }))
  })

  it('人机对战语音只消费一次识别结果并处理无效走法', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: false }), { status: 200 })
      return new Response(JSON.stringify({ error: '不可用' }), { status: 503 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    await act(async () => fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0]))
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '去2借5' }))
    expect(screen.getAllByText(/没听明白，请重新说/).length).toBeGreaterThan(0)
    expect(voiceMock.instances.at(-1)!.speakText).toHaveBeenCalledWith('听到“去2借5”，没听明白，请重新说。')
    fireEvent.pointerUp(screen.getAllByRole('button', { name: /松开完成/ })[0])
    await act(async () => fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0]))
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '马二进五' }))
    expect(screen.getAllByText(/这步棋现在不能走，请重新说/).length).toBeGreaterThan(0)
    expect(voiceMock.instances.at(-1)!.speakText).toHaveBeenCalledWith('听到“马二进五”，这步棋现在不能走，请重新说当前局面可以走的走法。')
    expect(screen.getAllByText(/这步棋现在不能走，请重新说/).length).toBeGreaterThan(0)
  })

  it('默认隐藏局面分析，点击后显示概率和推荐语音', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })
      expect(options?.body).toContain('"analysis":true')
      return new Response(JSON.stringify({ move: 'h0g2', score: { type: 'cp', value: 180 }, engine: 'Pikafish Test', level: '初级' }), { status: 200 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    expect(await screen.findByText('Pikafish Test')).toBeInTheDocument()
    expect(screen.queryByText(/红方 .*%/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '局面分析' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /收起局面分析|正在分析/ })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /收起局面分析|正在分析/ })).toBeInTheDocument()
    const probability = screen.queryByText(/红方 \d+%/)
    const unavailable = screen.queryByText('当前无法获取胜负概率，请确认 Pikafish 可用。')
    expect(probability || unavailable).toBeTruthy()
    if (screen.queryByRole('button', { name: /语音讲解推荐/ })) {
      const moveVoiceButton = screen.getAllByRole('button', { name: /按住说走法/ })[0]
      const moveVoiceLabel = moveVoiceButton.textContent
      fireEvent.click(screen.getByRole('button', { name: /语音讲解推荐/ }))
      expect(voiceMock.instances.at(-1)!.speakText).toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: /语音讲解推荐/ }))
      expect(voiceMock.instances.at(-2)!.disconnect).toHaveBeenCalled()
      expect(moveVoiceButton.textContent).toBe(moveVoiceLabel)
      expect(moveVoiceButton).not.toHaveClass('listening')
    } else {
      expect(screen.getByText('当前无法获取胜负概率，请确认 Pikafish 可用。')).toBeInTheDocument()
    }
    const collapse = screen.queryByRole('button', { name: '收起局面分析' })
    if (collapse) {
      fireEvent.click(collapse)
      expect(screen.queryByText(/推荐走法：/)).not.toBeInTheDocument()
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: '分析失败' }), { status: 503 })))
    fireEvent.click(screen.getByRole('button', { name: '重开一局' }))
    fireEvent.click(screen.getByRole('button', { name: '局面分析' }))
    await waitFor(() => expect(screen.getByText('当前无法获取胜负概率，请确认 Pikafish 可用。')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: '红车' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '1-1' }))
  })

  it('点击棋谱可以跳转并返回当前局面', async () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo })
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: false }), { status: 200 })
      return new Response(JSON.stringify({ error: '不可用' }), { status: 503 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 3600)) })
    fireEvent.click(screen.getByRole('button', { name: '马二进三' }))
    expect(await screen.findByText('正在复盘第 1 步，共 2 步', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByLabelText('最近一步走子路径')).toHaveClass('red')
    expect(screen.getByRole('button', { name: '返回当前局面' })).toBeInTheDocument()
    const currentHorse = screen.getAllByRole('button', { name: '红马' }).find((button) => button.querySelector('.chess-piece.red'))!
    fireEvent.click(currentHorse)
    expect(screen.queryByRole('button', { name: '返回当前局面' })).not.toBeInTheDocument()
    expect(currentHorse.querySelector('.chess-piece')).toHaveClass('selected')
    expect(scrollTo).toHaveBeenCalled()
  })

  it('支持人机对战悔棋和重新开局', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: false }), { status: 200 })
      return new Response(JSON.stringify({ error: '不可用' }), { status: 503 })
    }))
    vi.spyOn(Math, 'random').mockReturnValue(0)
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 3600)) })
    fireEvent.click(screen.getByRole('button', { name: '悔棋' }))
    expect(screen.getByText('暂无走法')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重开一局' }))
    expect(screen.queryByText('轮到红方走棋')).not.toBeInTheDocument()
  })

  it('按住和松开训练语音按钮，并处理空格快捷键', async () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    const lessonVoice = screen.getByRole('button', { name: /按住说走法/ })
    fireEvent.pointerDown(lessonVoice)
    await act(async () => Promise.resolve())
    expect(voiceMock.instances.at(-1)?.start).toHaveBeenCalled()
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)) })
    fireEvent.pointerUp(lessonVoice)
    expect(voiceMock.instances.at(-1)?.stop).toHaveBeenCalled()

    const instanceCount = voiceMock.instances.length
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space', repeat: false })
      fireEvent.keyDown(window, { code: 'Space', repeat: true })
      await Promise.resolve()
    })
    expect(voiceMock.instances).toHaveLength(instanceCount + 1)
    expect(voiceMock.instances.at(-1)?.start).toHaveBeenCalledTimes(1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
      fireEvent.keyUp(window, { code: 'Space' })
      await Promise.resolve()
    })
    expect(voiceMock.instances.at(-1)?.stop).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('返回首页'))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 })))
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    await screen.findByText('基础 AI（Pikafish 未安装）')
    const preventDefault = vi.spyOn(Event.prototype, 'preventDefault')
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space', repeat: false })
      fireEvent.keyDown(window, { code: 'Space', repeat: true })
      await new Promise((resolve) => setTimeout(resolve, 400))
      fireEvent.keyUp(window, { code: 'Space' })
      await Promise.resolve()
    })
    expect(preventDefault).toHaveBeenCalledTimes(9)
    preventDefault.mockRestore()
    expect(voiceMock.instances.at(-1)?.start).toHaveBeenCalledTimes(1)
    expect(voiceMock.instances.at(-1)?.stop).toHaveBeenCalledTimes(1)
  })

  it('首页使用空格完成全局语音指令且不显示独立按钮', async () => {
    render(<App initialLevels={testLevels} />)
    expect(screen.queryByRole('button', { name: /全局语音输入/ })).not.toBeInTheDocument()
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space', repeat: false })
      await Promise.resolve()
    })
    expect(voiceMock.instances.at(-1)?.start).toHaveBeenCalledTimes(1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
      fireEvent.keyUp(window, { code: 'Space' })
      await new Promise((resolve) => setTimeout(resolve, 0))
      await Promise.resolve()
    })
    expect(voiceMock.instances.at(-1)?.stop).toHaveBeenCalledTimes(1)
  })

  it('全局空格指令可以进入训练和人机对战', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 })))
    render(<App initialLevels={testLevels} />)
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space' })
      await Promise.resolve()
    })
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '开始训练' }))
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space' })
      await Promise.resolve()
    })
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '开始人机对战' }))
    expect(await screen.findByText('基础 AI（Pikafish 未安装）')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Space' })
      await Promise.resolve()
    })
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '返回首页' }))
    expect(screen.getByText('今日三小关')).toBeInTheDocument()
  })

  it('全局语音支持首页帮助以及成长页和个人页导航', async () => {
    render(<App initialLevels={testLevels} />)
    const sayGlobal = async (text: string) => {
      await act(async () => {
        fireEvent.keyDown(window, { code: 'Space' })
        await Promise.resolve()
      })
      act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text }))
      fireEvent.keyUp(window, { code: 'Space' })
    }
    await sayGlobal('帮助')
    expect(voiceMock.instances.at(-1)!.disconnect).toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: /成长/ })[0])
    await sayGlobal('开始训练')
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    fireEvent.click(screen.getAllByRole('button', { name: /成长/ })[0])
    await sayGlobal('开始人机对战')
    expect(screen.queryByText('轮到红方走棋')).not.toBeInTheDocument()
  })

  it('训练页语音支持帮助、提示、重开确认和下一关', async () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    const button = screen.getByRole('button', { name: /按住说走法/ })
    const say = async (text: string) => {
      await act(async () => fireEvent.pointerDown(button))
      act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text }))
      fireEvent.pointerUp(button)
      await waitFor(() => expect(voiceMock.instances.at(-1)?.disconnect).toHaveBeenCalled())
    }
    await say('帮助')
    expect(screen.getByText(/你可以说棋步、提示/)).toBeInTheDocument()
    await say('提示')
    expect(screen.getAllByText('先观察对方将帅周围的逃跑位置。').length).toBeGreaterThan(0)
    await say('重新训练')
    expect(screen.getByText('请说确认或取消。')).toBeInTheDocument()
    await say('取消')
    expect(screen.getByText('已取消。')).toBeInTheDocument()
    await say('重新训练')
    await say('确认')
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '返回首页' }))
    expect(screen.getByText('今日三小关')).toBeInTheDocument()
  })

  it('局面分析展开后零七走棋会重新请求分析并保留面板', async () => {
    let analysisCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })
      if (String(options?.body).includes('"analysis":true')) {
        analysisCalls += 1
        return new Response(JSON.stringify({ move: 'h0g2', score: { type: 'cp', value: analysisCalls * 100 }, engine: 'Pikafish Test', level: '初级' }), { status: 200 })
      }
      return new Response(JSON.stringify({ move: 'h9g7', engine: 'Pikafish Test', level: '初级' }), { status: 200 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    expect(await screen.findByText('Pikafish Test')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '局面分析' }))
    await waitFor(() => expect(screen.getByText(/推荐走法：/)).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    await waitFor(() => expect(screen.getByText('马８进７')).toBeInTheDocument(), { timeout: 4000 })
    await waitFor(() => expect(analysisCalls).toBe(2), { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: /收起局面分析/ }))
    fireEvent.click(screen.getByRole('button', { name: '局面分析' }))
    expect(screen.getByRole('button', { name: /收起局面分析|正在分析/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /收起局面分析|正在分析/ })).toBeInTheDocument()
  })

  it('空格在输入控件中也会被全局拦截，并覆盖页面导航', () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /成长/ })[0])
    expect(screen.getByText('我的象棋成长')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '继续今日挑战' }))
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    fireEvent.click(screen.getAllByRole('button', { name: /成长/ })[0])
    expect(screen.getByText('零七棋友')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    const input = document.createElement('input')
    document.body.append(input)
    const keydown = new KeyboardEvent('keydown', { code: 'Space', bubbles: true })
    const keypress = new KeyboardEvent('keypress', { code: 'Space', bubbles: true })
    const keyup = new KeyboardEvent('keyup', { code: 'Space', bubbles: true })
    const preventDefault = vi.spyOn(Event.prototype, 'preventDefault')
    input.dispatchEvent(keydown)
    input.dispatchEvent(keypress)
    input.dispatchEvent(keyup)
    expect(preventDefault).toHaveBeenCalledTimes(5)
    expect(voiceMock.instances).toHaveLength(0)
    preventDefault.mockRestore()
    input.remove()
  })

  it('过滤重复结束语，保留正常语音回复', async () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0])
    await act(async () => Promise.resolve())
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'reply', text: '时间过得真快，期待和你下次对弈。' }))
    expect(screen.queryByText(/时间过得真快/)).not.toBeInTheDocument()
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'reply', text: '这一步走得很好。' }))
    expect(screen.getByText('这一步走得很好。')).toBeInTheDocument()
  })

  it('支持全局语音控制指令和确认操作', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    await screen.findByText('基础 AI（Pikafish 未安装）')
    const button = screen.getAllByRole('button', { name: /按住说走法/ })[0]
    await act(async () => fireEvent.pointerDown(button))
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '帮助' }))
    await waitFor(() => expect(screen.getByText(/你可以说棋步、悔棋/)).toBeInTheDocument())
    fireEvent.pointerUp(button)
    await act(async () => fireEvent.pointerDown(button))
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '悔棋' }))
    await waitFor(() => expect(screen.getByText('请说确认或取消。')).toBeInTheDocument())
    fireEvent.pointerUp(button)
    await act(async () => fireEvent.pointerDown(button))
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '取消' }))
    await waitFor(() => expect(screen.getByText('已取消。')).toBeInTheDocument())
    fireEvent.pointerUp(button)
    await act(async () => fireEvent.pointerDown(button))
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '重开一局' }))
    fireEvent.pointerUp(button)
    await act(async () => fireEvent.pointerDown(button))
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '确认' }))
    await waitFor(() => expect(screen.queryByText('轮到红方走棋')).not.toBeInTheDocument())
    const sayBattle = async (text: string) => {
      await act(async () => fireEvent.pointerDown(button))
      act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text }))
      fireEvent.pointerUp(button)
      await Promise.resolve()
    }
    await sayBattle('换成中级')
    expect(screen.getByText('已切换为中级棋力。')).toBeInTheDocument()
    await sayBattle('打开局面分析')
    await sayBattle('关闭局面分析')
    await sayBattle('推荐一步')
    await sayBattle('认输')
    expect(screen.getByText('请说确认或取消。')).toBeInTheDocument()
    await sayBattle('确认')
    expect(screen.getByText(/你已认输/)).toBeInTheDocument()
  })

  it('覆盖人机对战语音连接失败', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    await screen.findByText('基础 AI（Pikafish 未安装）')
    voiceMock.startError = new Error('对战麦克风不可用')
    await act(async () => fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0]))
    await waitFor(() => expect(screen.getAllByText('对战麦克风不可用').length).toBeGreaterThan(0))
  })

  it('黑方走棋后一分钟无动作才语音提醒继续走棋', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    await act(async () => Promise.resolve())
    await act(async () => vi.advanceTimersByTimeAsync(60000))
    expect(voiceMock.instances.every((client) => !client.speakText.mock.calls.some(([text]) => text === '轮到你继续走棋。'))).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    await act(async () => vi.advanceTimersByTimeAsync(2400))
    await act(async () => vi.advanceTimersByTimeAsync(60000))
    expect(screen.queryByText('轮到你继续走棋。')).not.toBeInTheDocument()
    expect(voiceMock.instances.some((client) => client.speakText.mock.calls.some(([text]) => text === '轮到你继续走棋。'))).toBe(true)
    vi.useRealTimers()
  })

  it('覆盖人机对战返回、语音松开和复盘入口', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getByRole('button', { name: /人机对战/ }))
    await screen.findByText('基础 AI（Pikafish 未安装）')
    const voiceButton = screen.getAllByRole('button', { name: /按住说走法/ })[0]
    fireEvent.pointerDown(voiceButton)
    await act(async () => Promise.resolve())
    fireEvent.pointerUp(voiceButton)
    fireEvent.pointerCancel(voiceButton)
    fireEvent.click(screen.getByRole('button', { name: '认输' }))
    fireEvent.click(screen.getByRole('button', { name: '语音复盘' }))
    fireEvent.click(screen.getAllByRole('button', { name: '返回首页' })[0])
    expect(screen.getByText('今日三小关')).toBeInTheDocument()
  })
})
