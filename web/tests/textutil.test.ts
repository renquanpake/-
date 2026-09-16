import { describe, it, expect } from 'vitest'
import { breakMath } from '../src/textutil'

describe('breakMath', () => {
  it('给数学符号两侧补空格，让词级断行有断点', () => {
    expect(breakMath('∂z/∂x')).toBe('∂ z / ∂ x')
    expect(breakMath('∑n=1 un')).toBe('∑ n = 1 un')
  })

  it('普通中文与已排好的公式不被破坏', () => {
    expect(breakMath('设 z = f(x,y)，求偏导')).toBe('设 z = f(x,y)，求偏导')
    expect(breakMath('a  +  b')).toBe('a + b')
  })
})
