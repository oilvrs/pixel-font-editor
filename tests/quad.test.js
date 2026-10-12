import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cubicToQuads } from '../src/core/quad.js'

const K = 0.5522847498307936

function arc(radius) {
  return [
    { x: radius, y: 0 },
    { x: radius, y: radius * K },
    { x: radius * K, y: radius },
    { x: 0, y: radius }
  ]
}

/** Largest distance from the circle over a chain of quadratic curves. */
function circleError(start, quads, radius) {
  let from = start
  let worst = 0

  for (const q of quads) {
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      const u = 1 - t
      const x = u * u * from.x + 2 * u * t * q.control.x + t * t * q.to.x
      const y = u * u * from.y + 2 * u * t * q.control.y + t * t * q.to.y
      worst = Math.max(worst, Math.abs(Math.hypot(x, y) - radius))
    }
    from = q.to
  }

  return worst
}

test('a quarter circle stays within half a unit of the cubic it came from', () => {
  // The cubic itself is off a true circle by up to 0.03% of the radius, so that is allowed on top of the tolerance.
  for (const radius of [64, 256, 1024, 2048]) {
    const [p0, c1, c2, p3] = arc(radius)
    const quads = cubicToQuads(p0, c1, c2, p3, 0.5)

    assert.ok(circleError(p0, quads, radius) <= 0.5 + 0.0003 * radius, `radius ${radius}`)
  }
})

test('the chain ends where the cubic ends, and every piece is one quadratic', () => {
  const [p0, c1, c2, p3] = arc(1024)
  const quads = cubicToQuads(p0, c1, c2, p3)

  assert.deepEqual(quads[quads.length - 1].to, p3)
  assert.ok(quads.every((q) => q.control && q.to))
})

test('a smaller tolerance gives more pieces', () => {
  const [p0, c1, c2, p3] = arc(1024)

  assert.ok(cubicToQuads(p0, c1, c2, p3, 0.05).length > cubicToQuads(p0, c1, c2, p3, 1).length)
})

test('a cubic that is really a straight line becomes one quadratic', () => {
  const quads = cubicToQuads({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 })
  assert.equal(quads.length, 1)
})
