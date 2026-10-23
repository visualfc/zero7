import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const voiceMock = vi.hoisted(() => ({
  instances: [] as Array<{ emit: (event: { type: string; state?: string; text?: string }) => void; currentState: string; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; speakText: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>,
  startError: null as Error | null,
  speakError: null as Error | null,
}))

vi.mock('./linxi', () => ({
  LinxiVoiceClient: class {
    currentState = 'idle'
    start = vi.fn(async () => { if (voiceMock.startError) throw voiceMock.startError; this.currentState = 'listening'; this.emit({ type: 'state', state: 'listening' }) })
    stop = vi.fn(async () => { this.currentState = 'thinking'; this.emit({ type: 'state', state: 'thinking' }) })
    speakText = vi.fn(async () => { if (voiceMock.speakError) throw voiceMock.speakError })
    disconnect = vi.fn(() => { this.currentState = 'idle' })
    emit: (event: { type: string; state?: string; text?: string }) => void
    constructor(emit: (event: { type: string; state?: string; text?: string }) => void) { this.emit = emit; voiceMock.instances.push(this) }
  },
}))

beforeEach(() => {
  voiceMock.instances = []
  voiceMock.startError = null
  voiceMock.speakError = null
})

afterEach(() => vi.unstubAllGlobals())

describe('ZERO7', () => {
  it('从首页进入第一关', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    expect(screen.getByText(/黑车闯进中路/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '红炮' })).toBeInTheDocument()
  })

  it('按合法规则使用炮架吃掉黑车', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    expect(screen.getByRole('button', { name: '红兵' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '红炮' }))
    fireEvent.click(screen.getByRole('button', { name: '黑车' }))
    expect(screen.getByText('隔山打牛！')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '黑车' })).not.toBeInTheDocument()
  })

  it('分级提示会逐步显示当前关卡信息', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '再给我一点提示' })))
    expect(screen.getAllByText('看看中路，红炮和黑车之间有什么？')).toHaveLength(2)
  })

  it('完成第一关后进入第二关', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    fireEvent.click(screen.getByRole('button', { name: '红炮' }))
    fireEvent.click(screen.getByRole('button', { name: '黑车' }))
    fireEvent.click(screen.getByRole('button', { name: /挑战下一关/ }))
    expect(screen.getByText(/怎样挡住它/)).toBeInTheDocument()
    expect(screen.getByText(/车一平五/)).toBeInTheDocument()
  })

  it('进入人机对战后直接开局并提供重开一局按钮', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 })))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /开始人机对战/ }))
    expect(await screen.findByText('基础 AI（Pikafish 未安装）')).toBeInTheDocument()
    expect(screen.getByText('轮到红方走棋')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /按下说走法/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: '重开一局' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '中级' }))
    fireEvent.click(screen.getByRole('button', { name: '重开一局' }))
    expect(screen.getByText('走出第一步后，棋谱会显示在这里。')).toBeInTheDocument()
  })

  it('进入人机对战并完成红方走棋和 Pikafish 应手', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/status')) return new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })
      return new Response(JSON.stringify({ move: 'h9g7', engine: 'Pikafish Test', level: '初级' }), { status: 200 })
    }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /开始人机对战/ }))
    expect(await screen.findByText('Pikafish Test')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    expect(await screen.findByText('马二进三')).toBeInTheDocument()
    expect(await screen.findByText('马８进７')).toBeInTheDocument()
  })

  it('重新开局后忽略上一局延迟返回的 AI 走法', async () => {
    let resolveMove!: (response: Response) => void
    const moveResponse = new Promise<Response>((resolve) => { resolveMove = resolve })
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })
      return moveResponse
    }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /开始人机对战/ }))
    expect(await screen.findByText('Pikafish Test')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    fireEvent.click(screen.getByRole('button', { name: '重开一局' }))
    await act(async () => resolveMove(new Response(JSON.stringify({ move: 'h9g7', engine: 'Pikafish Test', level: '初级' }), { status: 200 })))
    expect(screen.getByText('走出第一步后，棋谱会显示在这里。')).toBeInTheDocument()
    expect(screen.getByText('轮到红方走棋')).toBeInTheDocument()
  })

  it('支持训练语音识别、失败提示和分级提示朗读', async () => {
    vi.useFakeTimers()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    fireEvent.click(screen.getByRole('button', { name: /按下说走法/ }))
    await act(async () => Promise.resolve())
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '炮五进五' }))
    await act(async () => vi.advanceTimersByTimeAsync(450))
    expect(screen.getByText('隔山打牛！')).toBeInTheDocument()
    vi.useRealTimers()

    fireEvent.click(screen.getByRole('button', { name: '重新开始' }))
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '马三进四' }))
    expect(screen.getByRole('status')).toHaveTextContent('这步还没有匹配成功')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '再给我一点提示' })))
    expect(voiceMock.instances.at(-1)!.speakText).toHaveBeenCalledWith('看看中路，红炮和黑车之间有什么？')
  })

  it('展示语音连接和提示播放错误', async () => {
    voiceMock.startError = new Error('麦克风不可用')
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /进入训练/ }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /按下说走法/ })))
    expect(screen.getByRole('status')).toHaveTextContent('麦克风不可用')

    voiceMock.speakError = new Error('播放失败')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '再给我一点提示' })))
    expect(screen.getByRole('status')).toHaveTextContent('播放失败')
  })

  it('支持首页卡片、成长页、个人页和品牌导航', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /一步解围/ }))
    expect(screen.getByText(/怎样挡住它/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    fireEvent.click(screen.getAllByRole('button', { name: /成长/ })[0])
    expect(screen.getByText('我的象棋成长')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /我的/ })[0])
    expect(screen.getByText('ZERO7 棋友')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    expect(screen.getByText('今日三小关')).toBeInTheDocument()
  })

  it('人机对战处理引擎失败、难度切换、非法点击和认输', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })
      return new Response(JSON.stringify({ error: '引擎超时' }), { status: 503 })
    }))
    vi.spyOn(Math, 'random').mockReturnValue(0)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /开始人机对战/ }))
    expect(await screen.findByText('Pikafish Test')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '中级' }))
    fireEvent.click(screen.getAllByRole('button', { name: '黑卒' })[0])
    expect(screen.getByText('走出第一步后，棋谱会显示在这里。')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    expect(await screen.findByText(/基础 AI（Pikafish 暂不可用）/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '认输' }))
    expect(screen.getByText('你已认输，本局由 ZERO7 获胜。')).toBeInTheDocument()
  })

  it('人机对战语音只消费一次识别结果并处理无效走法', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: false }), { status: 200 })
      return new Response(JSON.stringify({ error: '不可用' }), { status: 503 })
    }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /开始人机对战/ }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /按下说走法/ })))
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '马二进五' }))
    expect(screen.getByText(/没有匹配到当前合法走法/)).toBeInTheDocument()
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '马二进三' }))
    expect(screen.getByText('走出第一步后，棋谱会显示在这里。')).toBeInTheDocument()
  })

  it('点击棋谱可以跳转并返回当前局面', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: false }), { status: 200 })
      return new Response(JSON.stringify({ error: '不可用' }), { status: 503 })
    }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /开始人机对战/ }))
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 560)) })
    fireEvent.click(screen.getByRole('button', { name: '马二进三' }))
    expect(screen.getByText('正在复盘第 1 步，共 2 步')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回当前局面' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回当前局面' }))
    expect(screen.getByText(/ZERO7 正在思考|轮到红方走棋/)).toBeInTheDocument()
  })

  it('支持人机对战悔棋和重新开局', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: false }), { status: 200 })
      return new Response(JSON.stringify({ error: '不可用' }), { status: 503 })
    }))
    vi.spyOn(Math, 'random').mockReturnValue(0)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /开始人机对战/ }))
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 560)) })
    fireEvent.click(screen.getByRole('button', { name: '悔棋' }))
    expect(screen.getByText('走出第一步后，棋谱会显示在这里。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重开一局' }))
    expect(screen.getByText('轮到红方走棋')).toBeInTheDocument()
  })
})
