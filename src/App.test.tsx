import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('小象棋伴', () => {
  it('从首页进入今日挑战', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /开始今日挑战/ }))
    expect(screen.getByText(/黑车正在将军/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '红炮' })).toBeInTheDocument()
  })

  it('可以点击红炮吃掉黑车完成挑战', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /开始今日挑战/ }))
    fireEvent.click(screen.getByRole('button', { name: '红炮' }))
    fireEvent.click(screen.getByRole('button', { name: '黑车' }))
    expect(screen.getByText('成功解围！')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '黑车' })).not.toBeInTheDocument()
  })

  it('分级提示会逐步显示解题信息', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /开始今日挑战/ }))
    fireEvent.click(screen.getByRole('button', { name: '再给我一点提示' }))
    expect(screen.getByText('看看棋盘中路，黑车正在将军。')).toBeInTheDocument()
  })
})
