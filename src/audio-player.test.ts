import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LingxiAudioPlayer, pcm16LittleEndianToFloat } from './audio-player'

class FakeSource {
  buffer: unknown
  onended: (() => void) | null = null
  connect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

class FakeAudioContext {
  state = 'running'
  currentTime = 1
  destination = {}
  sources: FakeSource[] = []
  resume = vi.fn(async () => undefined)
  close = vi.fn(async () => undefined)
  createBuffer = vi.fn((_channels: number, samples: number, rate: number) => ({ duration: samples / rate, copyToChannel: vi.fn() }))
  createBufferSource = vi.fn(() => {
    const source = new FakeSource()
    this.sources.push(source)
    return source
  })
}

function pcmPacket(samples: number) {
  return new Int16Array(samples).fill(1200).buffer
}

describe('灵矽 TTS 播放器', () => {
  let context: FakeAudioContext

  beforeEach(() => {
    vi.useFakeTimers()
    context = new FakeAudioContext()
    class AudioContextMock { constructor() { return context } }
    vi.stubGlobal('AudioContext', AudioContextMock)
  })

  it('将连续 PCM 帧按时间顺序加入播放队列', async () => {
    const player = new LingxiAudioPlayer()
    await player.startStream()
    await player.enqueue(pcmPacket(320))
    await player.enqueue(pcmPacket(320))

    expect(context.sources).toHaveLength(2)
    expect(context.sources[0].start).toHaveBeenCalledWith(1.06)
    expect(context.sources[1].start).toHaveBeenCalledWith(1.08)
  })

  it('收到打断时停止所有已排队音频', async () => {
    const player = new LingxiAudioPlayer()
    await player.startStream()
    await player.enqueue(pcmPacket(320))
    await player.stop()
    expect(context.sources[0].stop).toHaveBeenCalled()
  })

  it('等待最后一帧播放结束后通知状态恢复', async () => {
    const player = new LingxiAudioPlayer()
    const ended = vi.fn()
    player.setPlaybackEndHandler(ended)
    await player.startStream()
    await player.enqueue(pcmPacket(320))
    player.finishStream()
    await vi.runAllTimersAsync()
    expect(ended).toHaveBeenCalledOnce()
  })

  it('恢复挂起上下文、忽略空包并释放播放器', async () => {
    context.state = 'suspended'
    const player = new LingxiAudioPlayer()
    await player.prepare()
    expect(context.resume).toHaveBeenCalled()
    await player.enqueue(new ArrayBuffer(0))
    expect(context.sources).toHaveLength(0)
    await player.dispose()
    expect(context.close).toHaveBeenCalled()
  })

  it('没有音频上下文时立即通知播放结束', () => {
    const player = new LingxiAudioPlayer()
    const ended = vi.fn()
    player.setPlaybackEndHandler(ended)
    player.finishStream()
    expect(ended).toHaveBeenCalledOnce()
  })

  it('已结束的音源从队列移除，重复停止保持安全', async () => {
    const player = new LingxiAudioPlayer()
    await player.enqueue(pcmPacket(320))
    context.sources[0].onended?.()
    await player.stop()
    expect(context.sources[0].stop).not.toHaveBeenCalled()
  })

  it('将小端 PCM16 转换为浮点音频', () => {
    const result = pcm16LittleEndianToFloat(new Int16Array([-32768, 0, 32767]).buffer)
    expect(Array.from(result)).toEqual([-1, 0, 1])
  })
})
