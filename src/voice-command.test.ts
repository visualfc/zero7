import { describe, expect, it } from 'vitest'
import { commandHelp, normalizeVoiceCommandText, parseVoiceCommand } from './voice-command'

describe('全局语音指令', () => {
  it('解析页面和对战指令', () => {
    expect(parseVoiceCommand('开始人机对战')).toEqual({ type: 'battle.start' })
    expect(parseVoiceCommand('换成入门')).toEqual({ type: 'battle.start', level: '入门' })
    expect(parseVoiceCommand('换成初级')).toEqual({ type: 'battle.start', level: '初级' })
    expect(parseVoiceCommand('换成中级')).toEqual({ type: 'battle.start', level: '中级' })
    expect(parseVoiceCommand('悔棋')).toEqual({ type: 'battle.undo' })
    expect(parseVoiceCommand('重开一局')).toEqual({ type: 'battle.restart' })
    expect(parseVoiceCommand('认输')).toEqual({ type: 'battle.resign' })
    expect(parseVoiceCommand('确认')).toEqual({ type: 'confirm' })
    expect(parseVoiceCommand('取消')).toEqual({ type: 'cancel' })
    expect(parseVoiceCommand('返回首页。')).toEqual({ type: 'navigation.home' })
    expect(parseVoiceCommand('进入训练')).toEqual({ type: 'training.start' })
  })

  it('解析训练、复盘、分析和帮助指令', () => {
    expect(parseVoiceCommand('下一关')).toEqual({ type: 'training.next' })
    expect(parseVoiceCommand('下一题')).toEqual({ type: 'training.next' })
    expect(parseVoiceCommand('重新训练')).toEqual({ type: 'training.restart' })
    expect(parseVoiceCommand('重新练习')).toEqual({ type: 'training.restart' })
    expect(parseVoiceCommand('提示')).toEqual({ type: 'training.hint' })
    expect(parseVoiceCommand('上一手')).toEqual({ type: 'review.previous' })
    expect(parseVoiceCommand('下一手')).toEqual({ type: 'review.next' })
    expect(parseVoiceCommand('返回当前局面')).toEqual({ type: 'review.exit' })
    expect(parseVoiceCommand('打开局面分析')).toEqual({ type: 'analysis.show' })
    expect(parseVoiceCommand('关闭局面分析')).toEqual({ type: 'analysis.hide' })
    expect(parseVoiceCommand('推荐一步')).toEqual({ type: 'analysis.recommend' })
    expect(parseVoiceCommand('帮助')).toEqual({ type: 'help' })
  })

  it('解析棋步、帮助和未知内容', () => {
    expect(parseVoiceCommand('马二进三。')).toEqual({ type: 'move', text: '马二进三。' })
    expect(parseVoiceCommand('车一平二')).toEqual({ type: 'move', text: '车一平二' })
    expect(parseVoiceCommand('我可以说什么')).toEqual({ type: 'help' })
    expect(parseVoiceCommand('去2借5')).toEqual({ type: 'move', text: '去2借5' })
    expect(normalizeVoiceCommandText('  返回首页！ ')).toBe('返回首页')
  })

  it('按页面提供帮助', () => {
    expect(commandHelp('battle')).toContain('悔棋')
    expect(commandHelp('lesson')).toContain('提示')
    expect(commandHelp('home')).toContain('开始训练')
    expect(commandHelp('progress')).toContain('开始训练')
    expect(commandHelp('profile')).toContain('开始训练')
  })
})
