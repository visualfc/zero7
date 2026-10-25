import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { puzzleToLevel, type PuzzleRecord } from './puzzles'
import { BATTLE_RULES } from './battle-rules'
import wukongRecords from '../data/puzzles/wukong.json'
import wukongMultiRecords from '../data/puzzles/wukong-multi.json'
import qiyiRecords from '../data/puzzles/xiangqi-pwa-offline.json'

const wukongSource = { id: 'wukong-xiangqi', name: 'Wukong Xiangqi', url: 'https://github.com/maksimKorzh/wukong-xiangqi', license: 'MIT', role: '经过搜索验证的将杀局面' } as const
const testRecords = [...wukongRecords.slice(0, 4), ...['mate2', 'mate3', 'mate4', 'mateN'].map((mode) => wukongMultiRecords.find((record) => record.mode === mode)!)].map((record) => ({ ...record, source: wukongSource })) as PuzzleRecord[]
const qiyiSource = { id: 'xiangqi-pwa-offline', name: '棋弈江湖', url: 'https://github.com/dffge552/xiangqi-pwa-offline', license: 'MIT', role: '残局、杀法与古谱题源' } as const
const endgameFixtures = [2, 0, 1, 19, 18, 9].map((index) => ({ ...qiyiRecords[index], source: qiyiSource }))
const testLevels = [...testRecords, ...endgameFixtures].map((record, index) => puzzleToLevel(record as PuzzleRecord, index))
const defendedCandidateLevel = puzzleToLevel({ ...testRecords[0], id: 'defended-candidate', solution: [{ from: 'c0', to: 'e2' }] }, 0)
const alternateVoiceMoveLevel = puzzleToLevel({ ...wukongRecords[11], source: wukongSource } as PuzzleRecord, 0)
const checkingResponseLevel = puzzleToLevel({ ...wukongMultiRecords[1], source: wukongSource } as PuzzleRecord, 0)
const matingResponseLevel = puzzleToLevel({ ...wukongMultiRecords[7], source: wukongSource } as PuzzleRecord, 0)
const puzzleMock = vi.hoisted(() => ({ fetch: vi.fn() }))

vi.mock('./puzzles', async (importOriginal) => ({ ...await importOriginal<typeof import('./puzzles')>(), fetchPuzzleLibrary: puzzleMock.fetch }))

const voiceMock = vi.hoisted(() => ({
  instances: [] as Array<{ emit: (event: { type: string; state?: string; text?: string }) => void; currentState: string; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; speakText: ReturnType<typeof vi.fn>; waitForPlayback: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }>,
  startError: null as Error | null,
  speakError: null as Error | null,
  playbackHangs: false,
}))

vi.mock('./linxi', () => ({
  LinxiVoiceClient: class {
    currentState = 'idle'
    start = vi.fn(async () => { if (voiceMock.startError) throw voiceMock.startError; this.currentState = 'listening'; this.emit({ type: 'state', state: 'listening' }) })
    stop = vi.fn(async () => { this.currentState = 'thinking'; this.emit({ type: 'state', state: 'thinking' }) })
    speakText = vi.fn(async () => { if (voiceMock.speakError) throw voiceMock.speakError })
    waitForPlayback = vi.fn(async () => { if (voiceMock.playbackHangs) await new Promise(() => {}) })
    disconnect = vi.fn(() => { this.currentState = 'idle' })
    emit: (event: { type: string; state?: string; text?: string }) => void
    constructor(emit: (event: { type: string; state?: string; text?: string }) => void) { this.emit = emit; voiceMock.instances.push(this) }
  },
}))

beforeEach(() => {
  sessionStorage.clear()
  vi.stubGlobal('isSecureContext', true)
  voiceMock.instances = []
  voiceMock.startError = null
  voiceMock.speakError = null
  voiceMock.playbackHangs = false
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
  it('导航顺序为首页、对战、训练、残局', () => {
    render(<App initialLevels={testLevels} />)
    const navigation = screen.getAllByRole('navigation', { name: '主导航' })[0]
    const labels = navigation.querySelectorAll('.nav-button span')
    expect([...labels].map((label) => label.textContent)).toEqual(['对战', '训练', '残局'])
    expect(navigation.querySelector('.battle-side-brand')).toHaveAttribute('aria-label', '返回首页')
  })

  it('训练和残局页面都可以选择指定题目', () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: '残局训练' })[0])
    const endgameType = screen.getByLabelText('残局类型')
    expect([...endgameType.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['车类残局', '马炮残局', '炮类残局', '马类残局', '兵类残局', '仕相残局'])
    expect([...screen.getByLabelText('选择题目').querySelectorAll('option')].map((option) => option.textContent)).toEqual(['10001'])
    fireEvent.change(endgameType, { target: { value: '马炮残局' } })
    expect([...screen.getByLabelText('选择题目').querySelectorAll('option')].map((option) => option.textContent)).toEqual(['20001'])
    expect(screen.getByRole('heading', { name: /單馬單炮 vs 單馬/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回首页' }))
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    expect(screen.getByLabelText('选择题目')).toBeInTheDocument()
    const modeSelect = screen.getByLabelText('杀棋类型')
    expect([...modeSelect.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['一步杀', '二步杀', '三步杀', '四步杀', 'N步杀'])
    expect([...screen.getByLabelText('选择题目').querySelectorAll('option')].map((option) => option.textContent)).toEqual(['1001', '1002', '1003', '1004'])
    fireEvent.change(modeSelect, { target: { value: 'mate2' } })
    expect([...screen.getByLabelText('选择题目').querySelectorAll('option')].map((option) => option.textContent)).toEqual(['2001'])
    expect(screen.getByRole('heading', { name: /二步杀.*寻找引擎认可的制胜路线/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回首页' }))
    fireEvent.click(screen.getAllByRole('button', { name: '残局' })[0])
    expect(screen.getByLabelText('残局类型')).toBeInTheDocument()
    expect(screen.getByLabelText('选择题目')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /残局/ })).toBeInTheDocument()
  })

  it('切换题目时预热最新局面且不改变棋盘', async () => {
    const requests: Array<{ fen: string; signal?: AbortSignal }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/pikafish/warmup') {
        requests.push({ fen: JSON.parse(String(init?.body)).fen, signal: init?.signal ?? undefined })
        return new Response(null, { status: 204 })
      }
      return new Response(JSON.stringify({ move: null, terminal: true, engine: 'Pikafish Test', level: '初级', score: null }), { status: 200 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    expect(requests.at(-1)?.fen).toBe(testLevels[0].fen)
    fireEvent.change(screen.getByLabelText('杀棋类型'), { target: { value: 'mate2' } })
    await waitFor(() => expect(requests.at(-1)?.fen).toBe(testLevels.find((item) => item.mode === 'mate2')!.fen))
    expect(screen.getByRole('heading', { name: /二步杀/ })).toBeInTheDocument()
    expect(screen.getByLabelText('残局棋谱')).toBeEmptyDOMElement()
  })

  it('从首页进入第一关', () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '红车' })[0]).toBeInTheDocument()
  })

  it('残局页面使用 Pikafish 显示并朗读当前局面讲解', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/warmup')) return new Response(null, { status: 204 })
      expect(JSON.parse(String(init?.body))).toMatchObject({ level: '中级', analysis: true })
      return new Response(JSON.stringify({ move: 'h0e0', engine: 'Pikafish Test', level: '中级', score: { type: 'cp', value: 180 } }), { status: 200 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: '残局训练' })[0])
    expect(screen.queryByText(/推荐走法/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /展开引擎讲解/ }))
    expect(await screen.findByText(/推荐走法：车二平五/)).toBeInTheDocument()
    expect(screen.getByText('当前行棋方占优')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /收起引擎讲解/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '语音讲解残局推荐' }))
    await waitFor(() => expect(voiceMock.instances.some((client) => client.speakText.mock.calls.some(([text]) => String(text).includes('推荐走法车二平五')))).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: /收起引擎讲解/ }))
    expect(screen.queryByText(/推荐走法：车二平五/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /展开引擎讲解/ })).toBeInTheDocument()
  })

  it.each([
    [{ type: 'mate', value: 3 }, '预计3步成杀'],
    [{ type: 'mate', value: -2 }, '需要防守对方2步杀棋'],
    [{ type: 'cp', value: 0 }, '局面接近均势'],
    [{ type: 'cp', value: -180 }, '当前行棋方需要谨慎防守'],
  ])('残局讲解显示不同引擎评分 %#', async (score, evaluation) => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(String(input).endsWith('/warmup') ? null : JSON.stringify({ move: null, engine: 'Pikafish Test', level: '中级', score }), { status: String(input).endsWith('/warmup') ? 204 : 200 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: '残局训练' })[0])
    fireEvent.click(screen.getByRole('button', { name: /展开引擎讲解/ }))
    expect(await screen.findByText(evaluation)).toBeInTheDocument()
    expect(screen.getByText(/推荐走法：当前没有合法着法/)).toBeInTheDocument()
  })

  it('残局讲解失败时显示错误且可以收起', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(String(input).endsWith('/warmup') ? null : JSON.stringify({ error: '分析失败' }), { status: String(input).endsWith('/warmup') ? 204 : 503 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: '残局训练' })[0])
    fireEvent.click(screen.getByRole('button', { name: /展开引擎讲解/ }))
    expect(await screen.findByRole('status')).toHaveTextContent('分析失败')
    fireEvent.click(screen.getByRole('button', { name: /收起引擎讲解/ }))
    expect(screen.getByRole('button', { name: /展开引擎讲解/ })).toBeInTheDocument()
  })

  it('残局讲解按钮保持焦点时按空格语音不会收起讲解', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(String(input).endsWith('/warmup') ? null : JSON.stringify({ move: 'h0e0', engine: 'Pikafish Test', level: '中级', score: { type: 'cp', value: 80 } }), { status: String(input).endsWith('/warmup') ? 204 : 200 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: '残局训练' })[0])
    const toggle = screen.getByRole('button', { name: /展开引擎讲解/ })
    fireEvent.click(toggle)
    await screen.findByText(/推荐走法：车二平五/)
    const collapse = screen.getByRole('button', { name: /收起引擎讲解/ })
    collapse.focus()
    fireEvent.keyDown(collapse, { code: 'Space', key: ' ' })
    expect(screen.getByRole('button', { name: /收起引擎讲解/ })).toBeInTheDocument()
    expect(document.activeElement).not.toBe(collapse)
    expect(screen.getAllByRole('button', { name: /松开完成/ })[0]).toBeInTheDocument()
    fireEvent.keyUp(window, { code: 'Space', key: ' ' })
    expect(screen.getByRole('button', { name: /收起引擎讲解/ })).toBeInTheDocument()
  })

  it('残局 TTS 播放卡住时黑棋仍按时应对', async () => {
    voiceMock.playbackHangs = true
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/warmup')) return new Response(null, { status: 204 })
      if (JSON.parse(String(init?.body)).analysis) return new Response(JSON.stringify({ move: 'h0e0', engine: 'Pikafish Test', level: '中级', score: { type: 'cp', value: 80 } }), { status: 200 })
      return new Response(JSON.stringify({ move: 'e9f9', engine: 'Pikafish Test', level: '初级', score: null }), { status: 200 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: '残局训练' })[0])
    const level = testLevels.find((item) => item.mode === 'endgame')!
    clickBoardSquare(level.move.from.row, level.move.from.col)
    clickBoardSquare(level.move.to.row, level.move.to.col)
    await act(async () => new Promise((resolve) => setTimeout(resolve, BATTLE_RULES.aiThinkDelayMs + 50)))
    expect(screen.getByLabelText('残局棋谱')).toHaveTextContent('将５平６')
    expect(screen.getByLabelText('最近一步走子路径')).toHaveClass('black')
  })

  it('残局引擎讲解展开后在黑棋应手后自动更新', async () => {
    let analysisCount = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/warmup')) return new Response(null, { status: 204 })
      const request = JSON.parse(String(init?.body))
      if (request.analysis) {
        analysisCount += 1
        return new Response(JSON.stringify({ move: analysisCount === 1 ? 'h0e0' : 'd2e1', engine: 'Pikafish Test', level: '中级', score: { type: 'cp', value: 80 } }), { status: 200 })
      }
      return new Response(JSON.stringify({ move: 'e9f9', engine: 'Pikafish Test', level: '初级', score: null }), { status: 200 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: '残局训练' })[0])
    fireEvent.click(screen.getByRole('button', { name: /展开引擎讲解/ }))
    await screen.findByText(/推荐走法：车二平五/)
    const level = testLevels.find((item) => item.mode === 'endgame')!
    clickBoardSquare(level.move.from.row, level.move.from.col)
    clickBoardSquare(level.move.to.row, level.move.to.col)
    await act(async () => new Promise((resolve) => setTimeout(resolve, BATTLE_RULES.aiThinkDelayMs + 50)))
    await waitFor(() => expect(analysisCount).toBeGreaterThanOrEqual(2))
    expect(screen.getByRole('button', { name: /收起引擎讲解/ })).toBeInTheDocument()
  })

  it('残局页面记录并朗读每一步棋', async () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: '残局训练' })[0])
    expect(screen.getByLabelText('残局棋谱')).toBeEmptyDOMElement()
    const level = testLevels.find((item) => item.mode === 'endgame')!
    clickBoardSquare(level.move.from.row, level.move.from.col)
    clickBoardSquare(level.move.to.row, level.move.to.col)
    expect(screen.getByLabelText('残局棋谱')).toHaveTextContent(level.answer)
    await waitFor(() => expect(voiceMock.instances.some((client) => client.speakText.mock.calls.some(([text]) => text === level.answer))).toBe(true))
  })

  it('训练题标题不显示 Tooltip', () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    expect(screen.getByRole('heading', { name: /车怎样完成最后一击/ })).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /车怎样完成最后一击/ }).querySelectorAll('br')).toHaveLength(1)
    expect(document.querySelector('.puzzle-source')).not.toBeInTheDocument()
  })

  it('明确显示红方先行和黑方先行，并允许对应一方完成题目', async () => {
    const { unmount } = render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    expect(screen.getByText('红方先行')).toBeInTheDocument()
    unmount()

    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    fireEvent.change(screen.getByLabelText('选择题目'), { target: { value: '2' } })
    expect(screen.getByText('黑方先行')).toBeInTheDocument()
    solveLevel(2)
    expect(await screen.findByText(/(?:闷杀|绝杀)！/)).toBeInTheDocument()
  })

  it('一步杀使用有时间上限的普通搜索完成验证', async () => {
    const engine = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).not.toHaveProperty('mateDepth')
      return new Response(JSON.stringify({ move: null, terminal: true, engine: 'Pikafish Test', level: '初级', score: null }), { status: 200 })
    })
    vi.stubGlobal('fetch', engine)
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    solveLevel(0)
    expect(await screen.findByText(/(?:闷杀|绝杀)！/)).toBeInTheDocument()
    expect(engine.mock.calls.filter(([input]) => String(input) === '/api/pikafish/bestmove')).toHaveLength(1)
  })

  it('从 API 加载题库后不会在走棋时重置局面', async () => {
    render(<App />)
    expect(screen.getByText('正在加载练习题库…')).toBeInTheDocument()
    await screen.findByText('今日三小关')
    expect(puzzleMock.fetch).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    solveLevel(0)
    expect(await screen.findByText(/(?:闷杀|绝杀)！/)).toBeInTheDocument()
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(await screen.findByText(/(?:闷杀|绝杀)！/)).toBeInTheDocument()
    expect(puzzleMock.fetch).toHaveBeenCalledTimes(1)
  })

  it('未完成时可以跳过，重新练习可以恢复初始局面', () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    fireEvent.click(screen.getByRole('button', { name: '跳过这题' }))
    expect(screen.getByText(/炮怎样完成最后一击/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新练习' }))
    expect(screen.getByText(/炮怎样完成最后一击/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '跳过这题' })).toBeEnabled()
  })

  it('其他合法着显示红方路径，延迟后显示黑方应手路径', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ move: 'g2g1', engine: 'Pikafish Test', level: '初级' }), { status: 200 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    clickBoardSquare(9, 2)
    clickBoardSquare(7, 4)
    expect(screen.getByText(/零七正在应对|正在验证/)).toBeInTheDocument()
    expect(screen.queryByText(/这步可以走/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('最近一步走子路径')).toHaveClass('red')
    expect(screen.queryByText(/零七走了车７进１/)).not.toBeInTheDocument()
    await act(async () => new Promise((resolve) => setTimeout(resolve, BATTLE_RULES.aiThinkDelayMs + 50)))
    expect(screen.getByText(/车７进１[。，]/)).toBeInTheDocument()
    expect(screen.getByLabelText('最近一步走子路径')).toHaveClass('black')
    await waitFor(() => {
      expect(voiceMock.instances.some((client) => client.speakText.mock.calls.some(([text]) => text === '相七进五'))).toBe(true)
      expect(voiceMock.instances.some((client) => client.speakText.mock.calls.some(([text]) => String(text).startsWith('车７进１')))).toBe(true)
    })
    expect(screen.getByRole('button', { name: '跳过这题' })).toBeEnabled()
  })

  it('多步杀使用目标深度验证并朗读双方走法', async () => {
    const engine = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ mateDepth: 2 })
      return new Response(JSON.stringify({ move: 'c5a7', terminal: false, engine: 'Pikafish Test', level: '初级', score: { type: 'mate', value: -2 } }), { status: 200 })
    })
    vi.stubGlobal('fetch', engine)
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    fireEvent.change(screen.getByLabelText('杀棋类型'), { target: { value: 'mate2' } })
    const level = testLevels.find((item) => item.mode === 'mate2')!
    clickBoardSquare(level.move.from.row, level.move.from.col)
    clickBoardSquare(level.move.to.row, level.move.to.col)
    await act(async () => new Promise((resolve) => setTimeout(resolve, BATTLE_RULES.aiThinkDelayMs + 50)))
    expect(screen.getByText('零七走了象３退１。')).toBeInTheDocument()
    expect(screen.queryByText(/这步仍有解法|继续尝试|继续完成/)).not.toBeInTheDocument()
    await waitFor(() => {
      expect(voiceMock.instances.some((client) => client.speakText.mock.calls.some(([text]) => text === level.answer))).toBe(true)
      expect(voiceMock.instances.some((client) => client.speakText.mock.calls.some(([text]) => text === '象３退１'))).toBe(true)
    })
  })

  it('多步杀无杀棋应手时回退普通搜索并由黑棋应对', async () => {
    const engine = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body))
      return new Response(JSON.stringify(request.mateDepth
        ? { move: null, terminal: true, engine: 'Pikafish Test', level: '初级', score: null }
        : { move: 'c5a7', terminal: false, engine: 'Pikafish Test', level: '初级', score: null }), { status: 200 })
    })
    vi.stubGlobal('fetch', engine)
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    fireEvent.change(screen.getByLabelText('杀棋类型'), { target: { value: 'mate2' } })
    const level = testLevels.find((item) => item.mode === 'mate2')!
    clickBoardSquare(level.move.from.row, level.move.from.col)
    clickBoardSquare(level.move.to.row, level.move.to.col)
    await act(async () => new Promise((resolve) => setTimeout(resolve, BATTLE_RULES.aiThinkDelayMs + 50)))
    const searches = engine.mock.calls.filter(([input]) => String(input) === '/api/pikafish/bestmove')
    expect(searches).toHaveLength(2)
    expect(JSON.parse(String(searches[0][1]?.body))).toMatchObject({ mateDepth: 2 })
    expect(JSON.parse(String(searches[1][1]?.body))).not.toHaveProperty('mateDepth')
    expect(screen.getByLabelText('残局棋谱')).toHaveTextContent('象３退１')
    expect(screen.getByLabelText('最近一步走子路径')).toHaveClass('black')
  })

  it('多步杀搜索失败时回退普通搜索', async () => {
    const engine = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body))
      if (request.mateDepth) return new Response(JSON.stringify({ error: '未找到杀棋路线' }), { status: 503 })
      return new Response(JSON.stringify({ move: 'c5a7', terminal: false, engine: 'Pikafish Test', level: '初级', score: null }), { status: 200 })
    })
    vi.stubGlobal('fetch', engine)
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    fireEvent.change(screen.getByLabelText('杀棋类型'), { target: { value: 'mate2' } })
    const level = testLevels.find((item) => item.mode === 'mate2')!
    clickBoardSquare(level.move.from.row, level.move.from.col)
    clickBoardSquare(level.move.to.row, level.move.to.col)
    await act(async () => new Promise((resolve) => setTimeout(resolve, BATTLE_RULES.aiThinkDelayMs + 50)))
    expect(engine.mock.calls.filter(([input]) => String(input) === '/api/pikafish/bestmove')).toHaveLength(2)
    expect(screen.getByLabelText('残局棋谱')).toHaveTextContent('象３退１')
  })

  it('黑棋应手将军时播报叫杀', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(String(input).endsWith('/warmup') ? null : JSON.stringify({ move: 'd0f0', terminal: false, engine: 'Pikafish Test', level: '初级', score: null }), { status: String(input).endsWith('/warmup') ? 204 : 200 })))
    render(<App initialLevels={[checkingResponseLevel]} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    clickBoardSquare(checkingResponseLevel.move.from.row, checkingResponseLevel.move.from.col)
    clickBoardSquare(checkingResponseLevel.move.to.row, checkingResponseLevel.move.to.col)
    await act(async () => new Promise((resolve) => setTimeout(resolve, BATTLE_RULES.aiThinkDelayMs + 50)))
    expect(screen.getByText('车４平６，将军。')).toBeInTheDocument()
    await waitFor(() => expect(voiceMock.instances.some((client) => client.speakText.mock.calls.some(([text]) => text === '车４平６，将军。'))).toBe(true))
  })

  it('黑棋应手将死时直接播报绝杀', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => new Response(String(input).endsWith('/warmup') ? null : JSON.stringify({ move: 'h2h8', terminal: false, engine: 'Pikafish Test', level: '初级', score: null }), { status: String(input).endsWith('/warmup') ? 204 : 200 })))
    render(<App initialLevels={[matingResponseLevel]} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    clickBoardSquare(matingResponseLevel.move.from.row, matingResponseLevel.move.from.col)
    clickBoardSquare(matingResponseLevel.move.to.row, matingResponseLevel.move.to.col)
    await act(async () => new Promise((resolve) => setTimeout(resolve, BATTLE_RULES.aiThinkDelayMs + 50)))
    expect(screen.getByText('车二进六，绝杀！')).toBeInTheDocument()
    expect(screen.queryByText(/将军/)).not.toBeInTheDocument()
    await waitFor(() => expect(voiceMock.instances.some((client) => client.speakText.mock.calls.some(([text]) => text === '车二进六，绝杀！'))).toBe(true))
  })

  it('N步杀使用二十步搜索上限', async () => {
    const engine = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ mateDepth: 20 })
      return new Response(JSON.stringify({ move: null, terminal: true, engine: 'Pikafish Test', level: '初级', score: null }), { status: 200 })
    })
    vi.stubGlobal('fetch', engine)
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    fireEvent.change(screen.getByLabelText('杀棋类型'), { target: { value: 'mateN' } })
    const level = testLevels.find((item) => item.mode === 'mateN')!
    clickBoardSquare(level.move.from.row, level.move.from.col)
    clickBoardSquare(level.move.to.row, level.move.to.col)
    await waitFor(() => expect(engine).toHaveBeenCalled())
  })

  it('走棋 TTS 失败时保留棋局并显示错误', async () => {
    voiceMock.speakError = new Error('走棋朗读失败')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ move: 'g2g1', terminal: false, engine: 'Pikafish Test', level: '初级', score: null }), { status: 200 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    clickBoardSquare(9, 2)
    clickBoardSquare(7, 4)
    expect(await screen.findByRole('status')).toHaveTextContent('走棋朗读失败')
    expect(screen.getByLabelText('残局棋谱')).toHaveTextContent('相七进五')
  })

  it('候选答案有合法应手时让引擎应对并继续棋局', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ move: 'g2g1', terminal: false, engine: 'Pikafish Test', level: '初级', score: null }), { status: 200 })))
    render(<App initialLevels={[defendedCandidateLevel, ...testLevels.slice(1)]} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    clickBoardSquare(9, 2)
    clickBoardSquare(7, 4)
    await act(async () => new Promise((resolve) => setTimeout(resolve, BATTLE_RULES.aiThinkDelayMs + 50)))
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
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    clickBoardSquare(9, 2)
    clickBoardSquare(7, 4)
    expect(await screen.findByText(/对方没有合法应手，但当前没有形成将死/)).toBeInTheDocument()
    expect(screen.queryByText('绝杀！')).not.toBeInTheDocument()
  })

  it('Pikafish 返回非法应手时保留局面并显示失败', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ move: 'a0a9', terminal: false, engine: 'Pikafish Test', level: '初级', score: null }), { status: 200 })))
    render(<App initialLevels={[defendedCandidateLevel, ...testLevels.slice(1)]} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    clickBoardSquare(9, 2)
    clickBoardSquare(7, 4)
    await act(async () => new Promise((resolve) => setTimeout(resolve, BATTLE_RULES.aiThinkDelayMs + 50)))
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
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    solveLevel(0)
    expect(await screen.findByText('引擎连接失败，请重试。')).toBeInTheDocument()
    expect(screen.queryByText(/标准着法|继续下一题/)).not.toBeInTheDocument()
    expect(screen.queryByText('绝杀！')).not.toBeInTheDocument()
  })

  it('Pikafish 应对失败时提示重试并保留棋局', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: '引擎超时' }), { status: 503 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    clickBoardSquare(9, 2)
    clickBoardSquare(7, 4)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('引擎超时'))
    expect(screen.queryByText('绝杀！')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('引擎超时')
    fireEvent.click(screen.getByRole('button', { name: '重新练习' }))
    expect(screen.getByRole('button', { name: '跳过这题' })).toBeEnabled()
  })

  it('分级提示会逐步朗读，但完整提示不会自动完成题目', async () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
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
    expect(await screen.findByText(/(?:闷杀|绝杀)！/)).toBeInTheDocument()
  })

  it('完成每日三题后仍可继续下一道 Wukong 题', async () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    solveLevel(0)
    await screen.findByText(/(?:闷杀|绝杀)！/)
    fireEvent.click(screen.getByRole('button', { name: /挑战下一关/ }))
    expect(screen.getByText(/炮怎样完成最后一击/)).toBeInTheDocument()
    solveLevel(1)
    await screen.findByText(/(?:闷杀|绝杀)！/)
    fireEvent.click(screen.getByRole('button', { name: /挑战下一关/ }))
    expect(screen.getByText(/炮怎样完成最后一击/)).toBeInTheDocument()
    solveLevel(2)
    await screen.findByText(/(?:闷杀|绝杀)！/)
    fireEvent.click(screen.getByRole('button', { name: /继续下一题/ }))
    expect(screen.getByText(/马怎样完成最后一击/)).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('损坏的人机与复盘会话状态会安全恢复', () => {
    sessionStorage.setItem('zero7-battle-moves', '{bad')
    sessionStorage.setItem('zero7-review-analysis', '{bad')
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
    expect(screen.getByLabelText('对局棋谱')).toBeEmptyDOMElement()
    expect(sessionStorage.getItem('zero7-battle-moves')).toBeNull()
  })

  it('进入人机对战后直接开局并提供重开一局按钮', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
    expect(await screen.findByText('基础 AI（Pikafish 未安装）')).toBeInTheDocument()
    expect(screen.queryByText('轮到红方走棋')).not.toBeInTheDocument()
    expect(screen.getByText(/按住语音按钮，说出“/)).toBeInTheDocument()
    expect(screen.getByText('也可以按住空格键进行语音输入')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /按住说走法/ })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /按住说走法/ })[0]).toBeEnabled()
    expect(screen.getByRole('button', { name: '重开一局' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '中级' }))
    fireEvent.click(screen.getByRole('button', { name: '重开一局' }))
    expect(screen.getByLabelText('对局棋谱')).toBeEmptyDOMElement()
  })

  it('进入人机对战并完成红方走棋和 Pikafish 应手', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/status')) return new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })
      return new Response(JSON.stringify({ move: 'h9g7', engine: 'Pikafish Test', level: '初级' }), { status: 200 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
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

  it('人机 TTS 播放卡住时引擎仍会走棋', async () => {
    voiceMock.playbackHangs = true
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => String(input).includes('/status')
      ? new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })
      : new Response(JSON.stringify({ move: 'h9g7', engine: 'Pikafish Test', level: '初级' }), { status: 200 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
    await screen.findByText('Pikafish Test')
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    expect(await screen.findByText('马８进７', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByLabelText('最近一步走子路径')).toHaveClass('black')
  })

  it('人机应手使用独立语音客户端并按顺序播报黑方走法', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => String(input).includes('/status')
      ? new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })
      : new Response(JSON.stringify({ move: 'h9g7', engine: 'Pikafish Test', level: '初级' }), { status: 200 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
    await screen.findByText('Pikafish Test')
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    await screen.findByText('马８进７', {}, { timeout: 4000 })
    await waitFor(() => {
      const speechClients = voiceMock.instances.filter((client) => client.speakText.mock.calls.length > 0)
      expect(speechClients).toHaveLength(2)
      expect(speechClients[0].speakText).toHaveBeenCalledWith('你走马二进三。')
      expect(speechClients[1].speakText).toHaveBeenCalledWith('零七应对马８进７。')
    })
  })

  it('重新开局后忽略上一局延迟返回的 AI 走法', async () => {
    let resolveMove!: (response: Response) => void
    const moveResponse = new Promise<Response>((resolve) => { resolveMove = resolve })
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })
      return moveResponse
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
    expect(await screen.findByText('Pikafish Test')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    fireEvent.click(screen.getByRole('button', { name: '重开一局' }))
    await act(async () => { resolveMove(new Response(JSON.stringify({ move: 'h9g7', engine: 'Pikafish Test', level: '初级' }), { status: 200 })); await new Promise((resolve) => setTimeout(resolve, 1600)) })
    expect(screen.getByLabelText('对局棋谱')).toBeEmptyDOMElement()
    expect(screen.queryByText('轮到红方走棋')).not.toBeInTheDocument()
  })

  it('训练语音可以执行带句号的非标准合法着', async () => {
    vi.useFakeTimers()
    render(<App initialLevels={[alternateVoiceMoveLevel]} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0])
    await act(async () => Promise.resolve())
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '马五进七。' }))
    expect(screen.getByText('听到“马五进七。”，识别为“马五进七”。')).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(450); await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByLabelText('残局棋谱')).toHaveTextContent('马五进七')
    expect(fetch).toHaveBeenCalledWith('/api/pikafish/bestmove', expect.objectContaining({ method: 'POST' }))
    vi.useRealTimers()
  })

  it('训练语音命中题目答案但当前局面不可走时提示合法走法', async () => {
    const unavailableAnswer = { ...testLevels[0], answer: '马五进七', answerAliases: [] }
    render(<App initialLevels={[unavailableAnswer]} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0])
    await act(async () => Promise.resolve())
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '马五进七。' }))
    expect(screen.getByRole('status')).toHaveTextContent('这步棋在当前局面不能走，请重新说合法走法')
  })

  it('支持训练语音识别、失败提示和分级提示朗读', async () => {
    vi.useFakeTimers()
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
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
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    await act(async () => fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0]))
    expect(screen.getByRole('status')).toHaveTextContent('麦克风不可用')

    voiceMock.speakError = new Error('播放失败')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '再给我一点提示' })))
    expect(screen.getByRole('status')).toHaveTextContent('播放失败')
  })

  it('在非安全上下文中提示使用 HTTPS 进行语音输入', async () => {
    vi.stubGlobal('isSecureContext', false)
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
    await act(async () => fireEvent.pointerDown(screen.getByRole('button', { name: /按住说走法/ })))
    expect(screen.getByText('手机语音输入需要使用 HTTPS，请访问终端显示的 https:// 地址。')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
    await act(async () => fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0]))
    expect(screen.getByText('手机语音输入需要使用 HTTPS，请访问终端显示的 https:// 地址。')).toBeInTheDocument()
  })

  it('支持首页卡片和品牌导航', () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: '训练' })[0])
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    fireEvent.click(screen.getAllByRole('button', { name: '对战' })[0])
    expect(screen.getByLabelText('对局棋谱')).toBeEmptyDOMElement()
    fireEvent.click(screen.getAllByRole('button', { name: '训练' })[0])
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '首页' }).at(-1)!)
    const dailyChallenge = screen.getAllByRole('button').find((button) => button.textContent?.includes('将杀') || button.textContent?.includes('杀：'))
    expect(dailyChallenge).toBeTruthy()
    fireEvent.click(dailyChallenge!)
    expect(screen.getByLabelText('选择题目')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    expect(screen.getByText('今日三小关')).toBeInTheDocument()
  })

  it('右侧导航可以从任意页面跳转到训练和对战', () => {
    render(<App initialLevels={testLevels} />)
    const navigate = (label: string) => fireEvent.click(within(screen.getByRole('navigation', { name: '主导航' })).getByRole('button', { name: label }))
    navigate('训练')
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    navigate('对战')
    expect(screen.getByLabelText('对局棋谱')).toBeEmptyDOMElement()
    fireEvent.click(screen.getByLabelText('返回首页'))
    expect(screen.getByText('今日三小关')).toBeInTheDocument()
  })

  it('移动端导航可以直接进入训练和对战', () => {
    render(<App initialLevels={testLevels} />)
    const mobileNavigation = within(screen.getByRole('navigation', { name: '移动端主导航' }))
    fireEvent.click(mobileNavigation.getByRole('button', { name: '训练' }))
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    fireEvent.click(mobileNavigation.getByRole('button', { name: '对战' }))
    expect(screen.getByLabelText('对局棋谱')).toBeEmptyDOMElement()
  })

  it('人机对战处理引擎失败、难度切换、非法点击和认输', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })
      return new Response(JSON.stringify({ error: '引擎超时' }), { status: 503 })
    }))
    vi.spyOn(Math, 'random').mockReturnValue(0)
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
    expect(await screen.findByText('Pikafish Test')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '中级' }))
    fireEvent.click(screen.getAllByRole('button', { name: '黑卒' })[0])
    expect(screen.getByLabelText('对局棋谱')).toBeEmptyDOMElement()
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    expect(await screen.findByText(/基础 AI（Pikafish 暂不可用）/, {}, { timeout: 4000 })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '认输' }))
    expect(screen.getByText(/你已认输，本局由 零七 获胜/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '语音总结' }))
  })

  it('人机对战语音只消费一次识别结果并处理无效走法', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: false }), { status: 200 })
      return new Response(JSON.stringify({ error: '不可用' }), { status: 503 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
    await act(async () => fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0]))
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '天气很好' }))
    expect(screen.getAllByText(/没听明白，请重新说/).length).toBeGreaterThan(0)
    await waitFor(() => expect(voiceMock.instances.some((client) => client.speakText.mock.calls.some(([text]) => text === '听到“天气很好”，没听明白，请重新说。'))).toBe(true))
    fireEvent.pointerUp(screen.getAllByRole('button', { name: /松开完成/ })[0])
    await act(async () => fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0]))
    act(() => voiceMock.instances.at(-1)!.emit({ type: 'transcript', text: '马二进五' }))
    expect(screen.getAllByText(/这步棋现在不能走，请重新说/).length).toBeGreaterThan(0)
    await waitFor(() => expect(voiceMock.instances.some((client) => client.speakText.mock.calls.some(([text]) => text === '听到“马二进五”，这步棋现在不能走，请重新说当前局面可以走的走法。'))).toBe(true))
    expect(screen.getAllByText(/这步棋现在不能走，请重新说/).length).toBeGreaterThan(0)
  })

  it('默认隐藏局面分析，点击后显示概率和推荐语音', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })
      expect(options?.body).toContain('"analysis":true')
      return new Response(JSON.stringify({ move: 'h0g2', score: { type: 'cp', value: 180 }, engine: 'Pikafish Test', level: '初级' }), { status: 200 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
    expect(await screen.findByText('Pikafish Test')).toBeInTheDocument()
    expect(screen.queryByText(/红方 .*%/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '局面分析' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /收起局面分析|正在分析/ })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /收起局面分析|正在分析/ })).toBeInTheDocument()
    const probability = screen.queryByText(/红方 \d+%/)
    const unavailable = screen.queryByText('当前无法获取胜负概率，请确认 Pikafish 可用。')
    expect(probability || unavailable).toBeTruthy()
    if (probability) expect(screen.getByText(/这步的目的：/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /语音讲解推荐/ })).not.toBeInTheDocument()
    if (!probability) expect(screen.getByText('当前无法获取胜负概率，请确认 Pikafish 可用。')).toBeInTheDocument()
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

  it('经典对局加载失败时显示错误状态', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/api/classic-games/classic-1')) throw new Error('network')
      if (String(input).includes('/api/classic-games')) return new Response(JSON.stringify({ items: [{ id: 'classic-1', event: '经典赛事', red: '刘殿中', redOriginal: 'LIU DianZhong', black: '柳大华', blackOriginal: 'LIU DaHua', source: 'Wukong Xiangqi master games database' }] }), { status: 200 })
      return new Response(JSON.stringify({ move: null, terminal: true }), { status: 200 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
    fireEvent.click(screen.getByRole('button', { name: /AI复盘/ }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/classic-games/classic-1'))
  })

  it('经典对局可以选择并逐步回放完整棋谱', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/api/classic-games/classic-1')) return new Response(JSON.stringify({ id: 'classic-1', event: 'Jiafun Cup National Champion 1997', red: '刘殿中', redOriginal: 'LIU DianZhong', black: '柳大华', blackOriginal: 'LIU DaHua', moves: ['h2e2', 'b9c7', 'h0g2', 'h7f7', 'g3g4', 'h9g7', 'b2c2', 'i9h9', 'b0a2', 'a9b9', 'a0b0', 'b7b3', 'c3c4', 'h9h5', 'i0h0', 'h5d5', 'c2c6', 'c9e7', 'e2f2', 'd5d6', 'c4c5', 'b3b2', 'h0h8', 'b2g2', 'b0b9', 'c7b9', 'h8b8', 'g2a2', 'c0a2', 'b9d8', 'c6c9', 'd9e8', 'c9a9', 'd6d7', 'b8b9', 'e8d9', 'b9b8', 'd9e8', 'f2d2', 'd7a7', 'b8b9', 'e8d9', 'b9d9', 'e9e8', 'c5d5', 'd8b7', 'a9f9', 'g6g5', 'd2g2', 'f7f8', 'g4g5', 'g7f9', 'd9f9', 'a7a9', 'f9a9', 'b7a9', 'g5g6', 'a9c8', 'g2e2', 'e8e9', 'e2e6', 'f8e8', 'e6e8', 'e9e8', 'i3i4', 'e7c9', 'g6h6', 'c8e7', 'd5e5', 'e7c6', 'e5e6', 'c6b4', 'a2c4'], source: 'Wukong Xiangqi master games database' }), { status: 200 })
      if (String(input).includes('/api/classic-games')) return new Response(JSON.stringify({ items: [{ id: 'classic-1', event: 'Jiafun Cup National Champion 1997', red: '刘殿中', redOriginal: 'LIU DianZhong', black: '柳大华', blackOriginal: 'LIU DaHua', source: 'Wukong Xiangqi master games database' }] }), { status: 200 })
      return new Response(JSON.stringify({ move: null, terminal: true }), { status: 200 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0]); fireEvent.click(screen.getByRole('button', { name: /AI复盘/ }))
    await screen.findByLabelText('选择经典对局')
    expect(screen.getByRole('button', { name: '分析关键步' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('复盘控制')).toHaveTextContent('0 / 73'))
    fireEvent.click(screen.getByRole('button', { name: '分析关键步' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /快速扫描|深度复核关键步/ })).toBeDisabled())
    await waitFor(() => expect(screen.getByRole('button', { name: '分析关键步' })).toBeEnabled(), { timeout: 30000 })
    const keyMoves = await screen.findByLabelText('全局分析关键步')
    const firstKeyMove = keyMoves.querySelector('button') as HTMLButtonElement
    fireEvent.click(firstKeyMove)
    expect(screen.getByLabelText('复盘控制')).toHaveTextContent(/\/ 73/)
    expect(screen.getByLabelText('选择经典对局')).toHaveTextContent('刘殿中 vs 柳大华')
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: '自动播放' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getByLabelText('复盘控制')).toHaveTextContent('2 / 73')
    fireEvent.click(screen.getByRole('button', { name: '停止自动播放' }))
    vi.useRealTimers()
    fireEvent.click(screen.getByRole('button', { name: '开局' }))
    expect(screen.getByLabelText('复盘控制')).toHaveTextContent('0 / 73')
    fireEvent.click(screen.getByRole('button', { name: '自动播放' }))
    expect(screen.getByRole('button', { name: '停止自动播放' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '停止自动播放' }))
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByLabelText('复盘控制')).toHaveTextContent('1 / 73')
    fireEvent.click(screen.getByRole('button', { name: '终局' }))
    expect(screen.getByLabelText('复盘控制')).toHaveTextContent('73 / 73')
    fireEvent.click(screen.getByRole('button', { name: '开局' }))
    expect(screen.getByLabelText('复盘控制')).toHaveTextContent('0 / 73')
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    await waitFor(() => expect(screen.getByLabelText('对局棋谱')).toHaveTextContent('炮二平五'))
    fireEvent.click(screen.getAllByRole('button', { name: /.+/ }).filter((button) => button.className.includes('move-replay')).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '展开局面分析' }))
    expect(await screen.findByText(/实战着：/)).toBeInTheDocument()
    expect(screen.getByText(/实战目的：/)).toBeInTheDocument()
    expect(screen.getByText(/推荐目的：/)).toBeInTheDocument()
    expect(screen.queryByText(/实战着与引擎首选/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByLabelText('复盘控制')).toHaveTextContent('72 / 73')
    fireEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByLabelText('复盘控制')).toHaveTextContent('71 / 73')
    fireEvent.click(screen.getByRole('button', { name: '返回对战' }))
    expect(screen.queryByLabelText('复盘控制')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /AI复盘/ })).toBeInTheDocument()
  }, 30000)

  it('点击棋谱可以跳转并返回当前局面', async () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo })
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/status')) return new Response(JSON.stringify({ available: false }), { status: 200 })
      return new Response(JSON.stringify({ error: '不可用' }), { status: 503 })
    }))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
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
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
    fireEvent.click(screen.getAllByRole('button', { name: '红马' }).at(-1)!)
    fireEvent.click(screen.getByRole('button', { name: '7-6' }))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 3600)) })
    fireEvent.click(screen.getByRole('button', { name: '悔棋' }))
    expect(screen.getByLabelText('对局棋谱')).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole('button', { name: '重开一局' }))
    expect(screen.queryByText('轮到红方走棋')).not.toBeInTheDocument()
  })

  it('按住和松开训练语音按钮，并处理空格快捷键', async () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
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
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
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

  it('全局语音支持首页帮助以及训练和对战导航', async () => {
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
    await sayGlobal('开始训练')
    expect(screen.getByText(/车怎样完成最后一击/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('返回首页'))
    await sayGlobal('开始人机对战')
    expect(screen.queryByText('轮到红方走棋')).not.toBeInTheDocument()
  })

  it('训练页语音支持帮助、提示、重开确认和下一关', async () => {
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
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
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
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
    fireEvent.click(screen.getAllByRole('button', { name: /杀棋训练/ })[0])
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
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
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
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
    await screen.findByText('基础 AI（Pikafish 未安装）')
    voiceMock.startError = new Error('对战麦克风不可用')
    await act(async () => fireEvent.pointerDown(screen.getAllByRole('button', { name: /按住说走法/ })[0]))
    await waitFor(() => expect(screen.getAllByText('对战麦克风不可用').length).toBeGreaterThan(0))
  })

  it('黑方走棋后一分钟无动作才语音提醒继续走棋', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false }), { status: 200 })))
    render(<App initialLevels={testLevels} />)
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
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
    fireEvent.click(screen.getAllByRole('button', { name: /人机对战/ })[0])
    await screen.findByText('基础 AI（Pikafish 未安装）')
    const voiceButton = screen.getAllByRole('button', { name: /按住说走法/ })[0]
    fireEvent.pointerDown(voiceButton)
    await act(async () => Promise.resolve())
    fireEvent.pointerUp(voiceButton)
    fireEvent.pointerCancel(voiceButton)
    fireEvent.click(screen.getByRole('button', { name: '认输' }))
    fireEvent.click(screen.getByRole('button', { name: '语音总结' }))
    fireEvent.click(screen.getAllByRole('button', { name: '返回首页' })[0])
    expect(screen.getByText('今日三小关')).toBeInTheDocument()
  })
})
