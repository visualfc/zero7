export class LingxiAudioPlayer {
  private context: AudioContext | null = null
  private nextStartTime = 0
  private sources = new Set<AudioBufferSourceNode>()
  private generation = 0
  private playbackEndTimer: number | null = null
  private onPlaybackEnd: (() => void) | null = null

  async prepare() {
    if (!this.context) this.context = new AudioContext({ latencyHint: 'interactive' })
    if (this.context.state === 'suspended') await this.context.resume()
  }

  setPlaybackEndHandler(handler: () => void) {
    this.onPlaybackEnd = handler
  }

  async startStream() {
    await this.prepare()
    await this.stop()
  }

  async enqueue(packet: ArrayBuffer) {
    await this.prepare()
    if (!this.context || packet.byteLength < 2) return

    const currentGeneration = this.generation
    const samples = pcm16LittleEndianToFloat(packet)
    if (currentGeneration !== this.generation || samples.length === 0) return

    const buffer = this.context.createBuffer(1, samples.length, 16000)
    buffer.copyToChannel(samples, 0)
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.context.destination)

    const leadTime = 0.06
    const startAt = Math.max(this.nextStartTime, this.context.currentTime + leadTime)
    source.start(startAt)
    this.nextStartTime = startAt + buffer.duration
    this.sources.add(source)
    source.onended = () => this.sources.delete(source)
  }

  finishStream() {
    if (!this.context) {
      this.onPlaybackEnd?.()
      return
    }
    this.clearPlaybackEndTimer()
    const milliseconds = Math.max(0, (this.nextStartTime - this.context.currentTime) * 1000) + 80
    this.playbackEndTimer = window.setTimeout(() => {
      this.playbackEndTimer = null
      this.onPlaybackEnd?.()
    }, milliseconds)
  }

  async stop() {
    this.generation += 1
    this.clearPlaybackEndTimer()
    this.sources.forEach((source) => {
      try { source.stop() } catch { /* source may have already ended */ }
    })
    this.sources.clear()
    this.nextStartTime = this.context?.currentTime ?? 0
  }

  async dispose() {
    await this.stop()
    await this.context?.close()
    this.context = null
  }

  private clearPlaybackEndTimer() {
    if (this.playbackEndTimer !== null) window.clearTimeout(this.playbackEndTimer)
    this.playbackEndTimer = null
  }
}

export function pcm16LittleEndianToFloat(packet: ArrayBuffer) {
  const view = new DataView(packet)
  const output = new Float32Array(Math.floor(packet.byteLength / 2))
  for (let index = 0; index < output.length; index += 1) {
    const sample = view.getInt16(index * 2, true)
    output[index] = sample < 0 ? sample / 0x8000 : sample / 0x7fff
  }
  return output
}
