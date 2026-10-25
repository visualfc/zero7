import { normalizeMoveText } from './chess'

export type VoicePage = 'home' | 'lesson' | 'endgame' | 'battle' | 'progress' | 'profile'

export type VoiceCommand =
  | { type: 'move'; text: string }
  | { type: 'navigation.home' }
  | { type: 'battle.start'; level?: '入门' | '初级' | '中级' }
  | { type: 'battle.undo' }
  | { type: 'battle.restart' }
  | { type: 'battle.resign' }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'training.start' }
  | { type: 'training.next' }
  | { type: 'training.restart' }
  | { type: 'training.hint' }
  | { type: 'review.previous' }
  | { type: 'review.next' }
  | { type: 'review.exit' }
  | { type: 'analysis.show' }
  | { type: 'analysis.hide' }
  | { type: 'analysis.recommend' }
  | { type: 'help' }
  | { type: 'unknown'; text: string }

type CommandFactory = (first?: string, second?: string) => VoiceCommand
const commandPatterns: Array<[RegExp, CommandFactory]> = [
  [/^(返回首页|回首页|回到首页)$/, () => ({ type: 'navigation.home' })],
  [/^(开始人机对战|进入人机对战|开始对弈)$/, () => ({ type: 'battle.start' })],
  [/^换成(入门|初级|中级)$/, (level) => ({ type: 'battle.start', level: level as '入门' | '初级' | '中级' })],
  [/^悔棋$/, () => ({ type: 'battle.undo' })],
  [/^(重开一局|重新开始|重开)$/, () => ({ type: 'battle.restart' })],
  [/^认输$/, () => ({ type: 'battle.resign' })],
  [/^(确认|确定)$/, () => ({ type: 'confirm' })],
  [/^(取消|不要了)$/, () => ({ type: 'cancel' })],
  [/^(开始训练|进入训练)$/, () => ({ type: 'training.start' })],
  [/^(下一关|下一题)$/, () => ({ type: 'training.next' })],
  [/^(重新训练|重新练习)$/, () => ({ type: 'training.restart' })],
  [/^(提示|给我提示|再给我一点提示)$/, () => ({ type: 'training.hint' })],
  [/^(上一手|上一步)$/, () => ({ type: 'review.previous' })],
  [/^(下一手|下一步)$/, () => ({ type: 'review.next' })],
  [/^(返回当前局面|退出复盘|结束复盘)$/, () => ({ type: 'review.exit' })],
  [/^(打开|展开)局面分析$/, () => ({ type: 'analysis.show' })],
  [/^(关闭|收起)局面分析$/, () => ({ type: 'analysis.hide' })],
  [/^(推荐一步|推荐走法|怎么走)$/, () => ({ type: 'analysis.recommend' })],
  [/^(帮助|我可以说什么|能说什么)$/, () => ({ type: 'help' })],
]

export function normalizeVoiceCommandText(text: string) {
  return normalizeMoveText(text).replace(/[，。！？、\s]/g, '')
}

export function parseVoiceCommand(text: string): VoiceCommand {
  const normalized = normalizeVoiceCommandText(text)
  for (const [pattern, create] of commandPatterns) {
    const match = normalized.match(pattern)
    if (match) return create(match[1], match[2])
  }
  if (/^[车马炮兵卒相象仕士帅将进退平一二三四五六七八九前后中左右上下到]/.test(normalized)) {
    return { type: 'move', text }
  }
  return { type: 'unknown', text }
}

export function commandHelp(page: VoicePage) {
  if (page === 'battle') return '你可以说棋步、悔棋、重开一局、认输、返回首页、打开局面分析或返回当前局面。'
  if (page === 'lesson') return '你可以说棋步、提示、重新训练、下一关或返回首页。'
  return '你可以说开始训练、开始人机对战、进入残局练习或返回首页。'
}
