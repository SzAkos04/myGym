import { describe, expect, it, vi } from 'vitest'
import { makeFastTap } from './fast-tap.js'

const touch = (x, y) => ({ clientX: x, clientY: y })
const down = (x, y) => ({ touches: [touch(x, y)] })
const up = (x, y) => ({ changedTouches: [touch(x, y)], cancelable: true, preventDefault: vi.fn() })

function setup() {
  let t = 1000
  const fn = vi.fn()
  const tap = makeFastTap(() => fn, () => t)
  return { fn, tap, at: ms => { t += ms } }
}

describe('makeFastTap', () => {
  it('a quick tap acts on release, without waiting for a click that never comes', () => {
    const { fn, tap, at } = setup()
    tap.onTouchStart(down(100, 700)); at(80)
    const end = up(101, 702)
    tap.onTouchEnd(end)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(end.preventDefault).toHaveBeenCalled()
  })

  it('swallows the click that follows a handled tap, so the button does not fire twice', () => {
    const { fn, tap, at } = setup()
    tap.onTouchStart(down(100, 700)); at(60); tap.onTouchEnd(up(100, 700)); at(20)
    tap.onClick({ preventDefault: vi.fn() })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('a click with no touch before it (keyboard, mouse) still works', () => {
    const { fn, tap } = setup()
    tap.onClick({})
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('a click long after a tap is a new press', () => {
    const { fn, tap, at } = setup()
    tap.onTouchStart(down(1, 1)); tap.onTouchEnd(up(1, 1)); at(2000)
    tap.onClick({})
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('a swipe that starts on the button is not a tap', () => {
    const { fn, tap, at } = setup()
    tap.onTouchStart(down(100, 700)); at(100)
    tap.onTouchEnd(up(100, 640))
    expect(fn).not.toHaveBeenCalled()
  })

  it('a long press is not a tap, a cancelled touch is not either', () => {
    const { fn, tap, at } = setup()
    tap.onTouchStart(down(1, 1)); at(900); tap.onTouchEnd(up(1, 1))
    tap.onTouchStart(down(1, 1)); tap.onTouchCancel(); tap.onTouchEnd(up(1, 1))
    tap.onTouchStart({ touches: [touch(1, 1), touch(9, 9)] }); tap.onTouchEnd(up(1, 1))
    expect(fn).not.toHaveBeenCalled()
  })
})
