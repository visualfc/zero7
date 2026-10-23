import { LingxiAudioPlayer } from './audio-player'

export type LinxiState = 'idle' | 'connecting' | 'ready' | 'listening' | 'thinking' | 'speaking' | 'error'

export interface LinxiEvent {
  type: 'state' | 'transcript' | 'reply' | 'error'
  state?: LinxiState
  text?: string
}

interface LinxiMessage {
  type: string
  state?: string
  text?: string
  message?: string
  is_aborted?: boolean
}

export class LinxiVoiceClient {
  private socket: WebSocket | null = null
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private silentGain: GainNode | null = null
  private frameBuffer = new PcmFrameBuffer(320)
  private player = new LingxiAudioPlayer()
  private recognitionTimer: number | null = null
  private state: LinxiState = 'idle'
  private readonly emit: (event: LinxiEvent) => void

  constructor(emit: (event: LinxiEvent) => void) {
    this.emit = emit
    this.player.setPlaybackEndHandler(() => {
      if (this.state === 'speaking') this.setState('ready')
    })
  }

  get currentState() {
    return this.state
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风录音')
    }

    this.setState('connecting')
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })

    await this.connect()
    await this.startCapture()
    this.socket?.send(JSON.stringify({ type: 'listen', state: 'start' }))
    this.setState('listening')
  }

  async speakText(text: string) {
    await this.player.prepare()
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.setState('connecting')
      await this.connect()
    }
    this.socket?.send(JSON.stringify({ type: 'speak', text }))
  }

  async stop() {
    if (this.state === 'listening') {
      this.frameBuffer.flush((frame) => this.sendFrame(frame))
      this.socket?.send(JSON.stringify({ type: 'listen', state: 'stop' }))
      this.setState('thinking')
      this.startRecognitionTimeout()
    }
    this.stopCapture()
  }

  disconnect() {
    this.clearRecognitionTimeout()
    this.stopCapture()
    void this.player.dispose()
    this.socket?.close()
    this.socket = null
    this.setState('idle')
  }

  private connect() {
    return new Promise<void>((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(`${protocol}//${window.location.host}/linxi`)
      socket.binaryType = 'arraybuffer'
      this.socket = socket
      const timeout = window.setTimeout(() => {
        reject(new Error('连接灵矽超时'))
        socket.close()
      }, 10000)

      socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          void this.player.enqueue(event.data).catch(() => {
            this.emit({ type: 'error', text: '零七的语音播放失败，请重试' })
          })
          return
        }
        if (typeof event.data !== 'string') return
        const message = JSON.parse(event.data) as LinxiMessage
        if (message.type === 'ready') {
          window.clearTimeout(timeout)
          this.setState('ready')
          resolve()
        } else if (message.type === 'stt' && message.text) {
          this.clearRecognitionTimeout()
          this.emit({ type: 'transcript', text: message.text })
          this.setState('thinking')
        } else if (message.type === 'tts') {
          if (message.state === 'start') {
            this.clearRecognitionTimeout()
            this.setState('speaking')
            void this.player.startStream()
          }
          if (message.state === 'sentence_start' && message.text) {
            this.emit({ type: 'reply', text: message.text })
          }
          if (message.state === 'stop') {
            this.clearRecognitionTimeout()
            if (message.is_aborted) {
              void this.player.stop()
              this.setState('ready')
            } else {
              this.player.finishStream()
            }
          }
        } else if (message.type === 'error') {
          this.clearRecognitionTimeout()
          const error = new Error(message.message || '灵矽服务发生错误')
          this.emit({ type: 'error', text: error.message })
          reject(error)
        } else if (message.type === 'disconnected') {
          this.setState('error')
          this.emit({ type: 'error', text: '灵矽连接已断开' })
        }
      }
      socket.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error('无法连接本地灵矽桥接服务'))
      }
    })
  }

  private async startCapture() {
    if (!this.stream || !this.socket) return
    this.audioContext = new AudioContext()
    await this.audioContext.resume()
    this.source = this.audioContext.createMediaStreamSource(this.stream)
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)
    this.silentGain = this.audioContext.createGain()
    this.silentGain.gain.value = 0

    const inputRate = this.audioContext.sampleRate
    this.processor.onaudioprocess = (event) => {
      if (this.state !== 'listening' || this.socket?.readyState !== WebSocket.OPEN) return
      const pcm = resampleToPcm16(event.inputBuffer.getChannelData(0), inputRate, 16000)
      this.frameBuffer.push(pcm, (frame) => this.sendFrame(frame))
    }
    this.source.connect(this.processor)
    this.processor.connect(this.silentGain)
    this.silentGain.connect(this.audioContext.destination)
  }

  private sendFrame(frame: Int16Array) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(frame.slice().buffer)
  }

  private startRecognitionTimeout() {
    this.clearRecognitionTimeout()
    this.recognitionTimer = window.setTimeout(() => {
      this.setState('error')
      this.emit({ type: 'error', text: '没有收到识别结果，请靠近麦克风后重试' })
      this.socket?.close()
    }, 12000)
  }

  private clearRecognitionTimeout() {
    if (this.recognitionTimer !== null) window.clearTimeout(this.recognitionTimer)
    this.recognitionTimer = null
  }

  private stopCapture() {
    if (this.processor) this.processor.onaudioprocess = null
    this.source?.disconnect()
    this.processor?.disconnect()
    this.silentGain?.disconnect()
    this.stream?.getTracks().forEach((track) => track.stop())
    void this.audioContext?.close()
    this.stream = null
    this.audioContext = null
    this.source = null
    this.processor = null
    this.silentGain = null
  }

  private setState(state: LinxiState) {
    this.state = state
    this.emit({ type: 'state', state })
  }
}

export class PcmFrameBuffer {
  private pending = new Int16Array(0)
  private readonly frameSamples: number

  constructor(frameSamples: number) {
    this.frameSamples = frameSamples
  }

  push(input: Int16Array, emit: (frame: Int16Array) => void) {
    const combined = new Int16Array(this.pending.length + input.length)
    combined.set(this.pending)
    combined.set(input, this.pending.length)

    let offset = 0
    while (combined.length - offset >= this.frameSamples) {
      emit(combined.slice(offset, offset + this.frameSamples))
      offset += this.frameSamples
    }
    this.pending = combined.slice(offset)
  }

  flush(emit: (frame: Int16Array) => void) {
    if (this.pending.length > 0) {
      const padded = new Int16Array(this.frameSamples)
      padded.set(this.pending)
      emit(padded)
    }
    this.pending = new Int16Array(0)
  }
}

export function resampleToPcm16(input: Float32Array, inputRate: number, outputRate: number) {
  if (inputRate === outputRate) return floatsToPcm16(input)
  const ratio = inputRate / outputRate
  const output = new Float32Array(Math.round(input.length / ratio))
  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor(index * ratio)
    const end = Math.min(Math.floor((index + 1) * ratio), input.length)
    let sum = 0
    for (let source = start; source < end; source += 1) sum += input[source]
    output[index] = sum / Math.max(1, end - start)
  }
  return floatsToPcm16(output)
}

function floatsToPcm16(input: Float32Array) {
  const output = new Int16Array(input.length)
  for (let index = 0; index < input.length; index += 1) {
    const value = Math.max(-1, Math.min(1, input[index]))
    output[index] = value < 0 ? value * 0x8000 : value * 0x7fff
  }
  return output
}
