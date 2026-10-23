import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

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
})
