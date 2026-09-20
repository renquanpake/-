// grader.test.ts — Grader 机判引擎单测
import { describe, it, expect } from 'vitest'
import { evalNumber, gradeInput, canGrade } from '../src/core/Grader'

describe('Grader.evalNumber', () => {
  it('数值表达式求值', () => {
    expect(evalNumber('2')).toBe(2)
    expect(evalNumber('-8√2/3')).toBeCloseTo((-8 * Math.sqrt(2)) / 3, 6)
    expect(evalNumber('2√6/3')).toBeCloseTo((2 * Math.sqrt(6)) / 3, 6)
    expect(evalNumber('4/√6')).toBeCloseTo(4 / Math.sqrt(6), 6)
    expect(Math.abs(evalNumber('2√6/3')! - evalNumber('4/√6')!) < 1e-9).toBe(true)
  })
  it('√3/3 与 1/√3 数值等价', () => {
    expect(evalNumber('√3/3')!).toBeCloseTo(1 / Math.sqrt(3), 6)
    expect(evalNumber('1/√3')!).toBeCloseTo(1 / Math.sqrt(3), 6)
  })
  it('含 π 的表达式', () => {
    expect(evalNumber('√2π/2')).toBeCloseTo((Math.sqrt(2) * Math.PI) / 2, 6)
    expect(evalNumber('π/2')).toBeCloseTo(Math.PI / 2, 6)
    expect(evalNumber('pi/2')).toBeCloseTo(Math.PI / 2, 6)
  })
  it('含变量/不可解析 → null', () => {
    expect(evalNumber('10x+7y+6z-7=0')).toBeNull()
    expect(evalNumber('x²+y²')).toBeNull()
    expect(evalNumber('')).toBeNull()
    expect(evalNumber('∫_L')).toBeNull()
  })
  it('标签前缀 ∫_L = 可剥离', () => {
    expect(evalNumber('∫_L = √2π/2')).toBeCloseTo((Math.sqrt(2) * Math.PI) / 2, 6)
  })
})

describe('Grader.gradeInput', () => {
  it('数值精确/等价判对', () => {
    expect(gradeInput('√3/3', '√3/3').verdict).toBe('correct')
    expect(gradeInput('1/√3', '√3/3').verdict).toBe('correct')
    expect(gradeInput('4/√6', '2√6/3').verdict).toBe('correct')
  })
  it('数值不等判错', () => {
    expect(gradeInput('√2/3', '√3/3').verdict).toBe('wrong')
  })
  it('符号答案归一化后判对', () => {
    expect(gradeInput('10x+7y+6z-7=0', '10x + 7y + 6z − 7 = 0').verdict).toBe('correct')
    expect(gradeInput('2x + 2y + 3z = 9', '2x+2y+3z=9').verdict).toBe('correct')
  })
  it('符号答案不等判错', () => {
    expect(gradeInput('10x+7y+6z=9', '10x + 7y + 6z − 7 = 0').verdict).toBe('wrong')
  })
  it('多部分答案全对', () => {
    const key = 'dy/dx = (3x − z)/(2z − 3y)，dz/dx = (y − 2x)/(2z − 3y)'
    expect(gradeInput('dy/dx=(3x-z)/(2z-3y)；dz/dx=(y-2x)/(2z-3y)', key).verdict).toBe('correct')
  })
  it('多部分答案部分对', () => {
    const key = 'dy/dx = (3x − z)/(2z − 3y)，dz/dx = (y − 2x)/(2z − 3y)'
    expect(gradeInput('dy/dx=(3x-z)/(2z-3y)', key).verdict).toBe('partial')
  })
  it('空答案', () => {
    expect(gradeInput('', '√3/3').verdict).toBe('wrong')
  })
  it('无机判键 → ungraded', () => {
    expect(gradeInput('任意', '').verdict).toBe('ungraded')
    expect(canGrade('')).toBe(false)
    expect(canGrade('√3/3')).toBe(true)
  })
  it('全角/负号归一化', () => {
    expect(gradeInput('－１／２', '-1/2').verdict).toBe('correct')
    expect(gradeInput('−1/2', '-1/2').verdict).toBe('correct')
  })
})
