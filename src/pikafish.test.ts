import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPikafishMove, getPikafishStatus, warmupPikafish } from './pikafish'

afterEach(() => vi.unstubAllGlobals())

describe('Pikafish 浏览器客户端', () => {
  it('读取可用的引擎状态', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: true, name: 'Pikafish Test' }), { status: 200 })))
    await expect(getPikafishStatus()).resolves.toEqual({ available: true, name: 'Pikafish Test' })
    expect(fetch).toHaveBeenCalledWith('/api/pikafish/status')
  })

  it('状态接口失败时返回不可用状态', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    await expect(getPikafishStatus()).resolves.toEqual({ available: false, error: '状态查询失败（503）' })
  })

  it('发送 FEN 和难度并返回最佳着', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ move: 'h9g7', engine: 'Pikafish Test', level: '初级' }), { status: 200 })))
    await expect(getPikafishMove('test-fen', '初级')).resolves.toMatchObject({ move: 'h9g7' })
    expect(fetch).toHaveBeenCalledWith('/api/pikafish/bestmove', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ fen: 'test-fen', level: '初级' }),
    }))
  })

  it('分析请求携带分析标记并返回评估分', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ move: 'h9g7', score: { type: 'cp', value: 35 }, engine: 'Pikafish Test', level: '初级' }), { status: 200 })))
    await expect(getPikafishMove('test-fen', '初级', true)).resolves.toMatchObject({ score: { value: 35 } })
    expect(fetch).toHaveBeenCalledWith('/api/pikafish/bestmove', expect.objectContaining({ body: JSON.stringify({ fen: 'test-fen', level: '初级', analysis: true }) }))
  })

  it('发送可取消的引擎预热请求', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    await expect(warmupPikafish('warmup-fen', controller.signal)).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith('/api/pikafish/warmup', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ fen: 'warmup-fen' }),
      signal: controller.signal,
    }))
  })

  it('预热接口失败时抛出错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    await expect(warmupPikafish('warmup-fen')).rejects.toThrow('Pikafish 预热失败（503）')
  })

  it('最佳着接口错误时抛出服务端信息', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: '引擎超时' }), { status: 503 })))
    await expect(getPikafishMove('test-fen', '中级')).rejects.toThrow('引擎超时')
  })
})
