import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LinxiVoiceClient, PcmFrameBuffer, resampleToPcm16, type LinxiEvent } from './linxi'

class FakeTrack { stop = vi.fn() }
class FakeStream {
  track = new FakeTrack()
  getTracks() { return [this.track] }
}
class FakeProcessor {
  onaudioprocess: ((event: { inputBuffer: { getChannelData: (channel: number) => Float32Array } }) => void) | null = null
  connect = vi.fn()
  disconnect = vi.fn()
}
class FakeNode { connect = vi.fn(); disconnect = vi.fn() }
class FakeSourceNode extends FakeNode {
  buffer: unknown
  onended: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
}
class FakeAudioContext {
  state = 'running'
  sampleRate = 48000
  currentTime = 1
  destination = {}
  processor = new FakeProcessor()
  resume = vi.fn(async () => undefined)
  close = vi.fn(async () => undefined)
  createMediaStreamSource = vi.fn(() => new FakeNode())
  createScriptProcessor = vi.fn(() => this.processor)
  createGain = vi.fn(() => Object.assign(new FakeNode(), { gain: { value: 1 } }))
  createBuffer = vi.fn((_channels: number, samples: number, rate: number) => ({ duration: samples / rate, copyToChannel: vi.fn() }))
  createBufferSource = vi.fn(() => new FakeSourceNode())
}
class FakeWebSocket {
  static OPEN = 1
  static instances: FakeWebSocket[] = []
  readyState = FakeWebSocket.OPEN
  binaryType = ''
  sent: unknown[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()
  url: string
  constructor(url: string) { this.url = url; FakeWebSocket.instances.push(this) }
  send(value: unknown) { this.sent.push(value) }
  message(data: unknown) { this.onmessage?.({ data } as MessageEvent) }
}

async function latestSocket() {
  await Promise.resolve()
  await Promise.resolve()
  return FakeWebSocket.instances.at(-1)!
}

async function ready() {
  const socket = await latestSocket()
  socket.message(JSON.stringify({ type: 'ready' }))
  return socket
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => new FakeStream()) } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('灵矽语音客户端', () => {
  it('连接麦克风、发送音频帧并停止识别', async () => {
    const events: LinxiEvent[] = []
    const client = new LinxiVoiceClient((event) => events.push(event))
    const starting = client.start()
    await ready()
    await starting
    const socket = FakeWebSocket.instances[0]
    expect(socket.url).toBe('ws://localhost:3000/linxi')
    expect(socket.sent).toContain(JSON.stringify({ type: 'listen', state: 'start' }))

    const processor = (client as unknown as { processor: FakeProcessor }).processor
    processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(960).fill(.25) } })
    expect(socket.sent.some((item) => item instanceof ArrayBuffer)).toBe(true)

    await client.stop()
    expect(socket.sent).toContain(JSON.stringify({ type: 'listen', state: 'stop' }))
    expect(events.some((event) => event.state === 'thinking')).toBe(true)
  })

  it('处理识别结果、TTS 文本和播放结束', async () => {
    const events: LinxiEvent[] = []
    const client = new LinxiVoiceClient((event) => events.push(event))
    const starting = client.start(); await ready(); await starting
    const socket = FakeWebSocket.instances[0]
    socket.message(JSON.stringify({ type: 'stt', text: '炮二平五' }))
    socket.message(JSON.stringify({ type: 'tts', state: 'start' }))
    socket.message(new Int16Array([1, 2]).buffer)
    await Promise.resolve()
    await Promise.resolve()
    socket.message(JSON.stringify({ type: 'tts', state: 'sentence_start', text: '好棋' }))
    socket.message(JSON.stringify({ type: 'tts', state: 'stop' }))
    await vi.advanceTimersByTimeAsync(200)
    expect(events).toContainEqual({ type: 'transcript', text: '炮二平五' })
    expect(events).toContainEqual({ type: 'reply', text: '好棋' })
    expect(events.some((event) => event.state === 'speaking')).toBe(true)
    expect(events.at(-1)).toEqual({ type: 'state', state: 'ready' })
  })

  it('发送朗读请求并处理被打断的播放', async () => {
    const events: LinxiEvent[] = []
    const client = new LinxiVoiceClient((event) => events.push(event))
    await client.prepareAudio()
    const speaking = client.speakText('提示内容'); await ready(); await vi.waitFor(() => expect(FakeWebSocket.instances[0]?.sent).toContain(JSON.stringify({ type: 'speak', text: '提示内容' })))
    const socket = FakeWebSocket.instances[0]
    expect(socket.sent).toContain(JSON.stringify({ type: 'speak', text: '提示内容' }))
    socket.message(JSON.stringify({ type: 'tts', state: 'start' }))
    socket.message(JSON.stringify({ type: 'tts', state: 'stop', is_aborted: true }))
    await speaking
    expect(events.at(-1)).toEqual({ type: 'state', state: 'ready' })
    client.disconnect()
    expect(client.currentState).toBe('idle')
    expect(socket.close).toHaveBeenCalled()
  })

  it('自动断开时停止结束语和后续音频', async () => {
    const events: LinxiEvent[] = []
    const client = new LinxiVoiceClient((event) => events.push(event))
    const starting = client.start(); await ready(); await starting
    const socket = FakeWebSocket.instances[0]
    socket.message(JSON.stringify({ type: 'tts', state: 'start' }))
    socket.message(JSON.stringify({ type: 'tts', state: 'sentence_start', text: '时间过得真快，转眼间又到了告别的时候。' }))
    socket.message(new Int16Array([1, 2]).buffer)
    socket.message(JSON.stringify({ type: 'disconnected' }))
    await Promise.resolve()
    expect(events.some((event) => event.type === 'reply')).toBe(false)
    expect(events).toContainEqual({ type: 'error', text: '灵矽连接已断开，请重新按住语音按钮' })
  })

  it('报告服务端错误和断线', async () => {
    const events: LinxiEvent[] = []
    const client = new LinxiVoiceClient((event) => events.push(event))
    const starting = client.start(); await ready(); await starting
    const socket = FakeWebSocket.instances[0]
    socket.message(JSON.stringify({ type: 'error', message: '服务错误' }))
    socket.message(JSON.stringify({ type: 'disconnected' }))
    expect(events).toContainEqual({ type: 'error', text: '服务错误' })
    expect(events).toContainEqual({ type: 'error', text: '灵矽连接已断开，请重新按住语音按钮' })
  })

  it('处理浏览器不支持、连接错误和识别超时', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    const unsupported = new LinxiVoiceClient(vi.fn())
    await expect(unsupported.start()).rejects.toThrow('当前浏览器不支持麦克风录音')

    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => new FakeStream()) } })
    const errors: LinxiEvent[] = []
    const failed = new LinxiVoiceClient((event) => errors.push(event))
    const starting = failed.start()
    const failedSocket = await latestSocket()
    failedSocket.onerror?.()
    await expect(starting).rejects.toThrow('无法连接本地灵矽桥接服务')

    const timeoutClient = new LinxiVoiceClient((event) => errors.push(event))
    const timeoutStart = timeoutClient.start(); await ready(); await timeoutStart
    await timeoutClient.stop()
    await vi.advanceTimersByTimeAsync(12000)
    expect(errors).toContainEqual({ type: 'error', text: '没有收到识别结果，请靠近麦克风后重试' })
  })
})

describe('灵矽音频处理', () => {
  it('将 48kHz 音频降采样为 16kHz PCM16', () => {
    const input = new Float32Array(480)
    input.fill(0.5)
    const output = resampleToPcm16(input, 48000, 16000)
    expect(output).toHaveLength(160)
    expect(output[0]).toBeGreaterThan(16000)
    expect(output[0]).toBeLessThan(16400)
  })

  it('把超出范围的浮点采样裁剪到 PCM16 范围', () => {
    const output = resampleToPcm16(new Float32Array([-2, 2]), 16000, 16000)
    expect(output[0]).toBe(-32768)
    expect(output[1]).toBe(32767)
  })

  it('严格切分为每帧 320 个采样点并补齐尾帧', () => {
    const buffer = new PcmFrameBuffer(320)
    const frames: Int16Array[] = []
    buffer.push(new Int16Array(500).fill(7), (frame) => frames.push(frame))
    buffer.push(new Int16Array(200).fill(9), (frame) => frames.push(frame))
    buffer.flush((frame) => frames.push(frame))

    expect(frames).toHaveLength(3)
    expect(frames.every((frame) => frame.length === 320)).toBe(true)
    expect(frames[0][0]).toBe(7)
    expect(frames[2][59]).toBe(9)
    expect(frames[2][60]).toBe(0)
  })

  it('空缓冲区无需补帧', () => {
    const emit = vi.fn()
    new PcmFrameBuffer(320).flush(emit)
    expect(emit).not.toHaveBeenCalled()
  })
})
