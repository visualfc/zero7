import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

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
    fireEvent.click(screen.getByRole('button', { name: '重新开局' }))
    await act(async () => resolveMove(new Response(JSON.stringify({ move: 'h9g7', engine: 'Pikafish Test', level: '初级' }), { status: 200 })))
    expect(screen.getByText('走出第一步后，棋谱会显示在这里。')).toBeInTheDocument()
    expect(screen.getByText('轮到红方走棋')).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: '重新开局' }))
    expect(screen.getByText('轮到红方走棋')).toBeInTheDocument()
  })
})
