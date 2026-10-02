import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  snapAngle,
  alignedCenter,
  toLocal,
  fromLocal,
  transformCorners,
  renderTransformed,
  resizeTransform,
  rotatedAngle
} from '../src/core/transform.js'

const source = (width, height, pixels) => ({ width, height, pixels: new Uint8Array(pixels) })
const near = (a, b) => Math.abs(a - b) < 1e-9

test('an identity transform returns the source unchanged', () => {
  const src = source(3, 2, [1, 0, 1, 0, 1, 0])
  const out = renderTransformed(src, { cx: 3.5, cy: 2, w: 3, h: 2, angle: 0 })

  assert.equal(out.x, 2)
  assert.equal(out.y, 1)
  assert.equal(out.region.width, 3)
  assert.equal(out.region.height, 2)
  assert.deepEqual(out.region.pixels, src.pixels)
})

test('scaling by 2 turns each pixel into a 2x2 block', () => {
  const src = source(2, 1, [1, 0])
  const out = renderTransformed(src, { cx: 4, cy: 1, w: 4, h: 2, angle: 0 })

  assert.equal(out.region.width, 4)
  assert.equal(out.region.height, 2)
  assert.deepEqual(out.region.pixels, new Uint8Array([1, 1, 0, 0, 1, 1, 0, 0]))
})

test('a negative width flips the content', () => {
  const src = source(2, 1, [1, 0])
  const out = renderTransformed(src, { cx: 3, cy: 0.5, w: -2, h: 1, angle: 0 })

  assert.deepEqual(out.region.pixels, new Uint8Array([0, 1]))
})

test('a 90° rotation is lossless, also when the center is off the grid', () => {
  const src = source(3, 1, [1, 0, 0])
  const out = renderTransformed(src, { cx: 5.5, cy: 5.5, w: 3, h: 1, angle: Math.PI / 2 })

  assert.equal(out.region.width, 1)
  assert.equal(out.region.height, 3)
  assert.equal(out.x, 5)
  assert.equal(out.y, 4)
  assert.deepEqual(out.region.pixels, new Uint8Array([1, 0, 0])) // The left end goes to the top
})

test('a 270° rotation sends the left end to the bottom', () => {
  const src = source(3, 1, [1, 0, 0])
  const out = renderTransformed(src, { cx: 5.5, cy: 5.5, w: 3, h: 1, angle: (3 * Math.PI) / 2 })

  assert.equal(out.region.width, 1)
  assert.equal(out.region.height, 3)
  assert.deepEqual(out.region.pixels, new Uint8Array([0, 0, 1]))
})

test('a 180° rotation reverses the content', () => {
  const src = source(3, 1, [1, 0, 0])
  const out = renderTransformed(src, { cx: 4.5, cy: 3.5, w: 3, h: 1, angle: Math.PI })

  assert.deepEqual(out.region.pixels, new Uint8Array([0, 0, 1]))
})

test('a 45° rotation of a solid square stays roughly the same size', () => {
  const src = source(4, 4, new Array(16).fill(1))
  const out = renderTransformed(src, { cx: 4, cy: 4, w: 4, h: 4, angle: Math.PI / 4 })
  const filled = out.region.pixels.reduce((sum, v) => sum + v, 0)

  assert.ok(out.region.width >= 6 && out.region.width <= 7)
  assert.ok(filled >= 10 && filled <= 24)
})

test('alignedCenter moves a 90° rotated odd-sized frame onto the grid', () => {
  const center = alignedCenter({ cx: 5, cy: 5, w: 3, h: 1, angle: Math.PI / 2 })
  assert.equal(center.cx, 5.5)
  assert.equal(center.cy, 5.5)
})

test('toLocal and fromLocal are inverses', () => {
  const t = { cx: 7.3, cy: 2.1, w: 5, h: 3, angle: 0.6 }
  const p = fromLocal(t, 1.2, -0.7)
  const local = toLocal(t, p.x, p.y)

  assert.ok(near(local.x, 1.2))
  assert.ok(near(local.y, -0.7))
})

test('transformCorners of an unrotated frame', () => {
  const corners = transformCorners({ cx: 4, cy: 3, w: 4, h: 2, angle: 0 })
  const expected = [[2, 2], [6, 2], [6, 4], [2, 4]]

  corners.forEach((p, i) => {
    assert.ok(near(p.x, expected[i][0]))
    assert.ok(near(p.y, expected[i][1]))
  })
})

test('resizing the south-east corner keeps the north-west corner fixed', () => {
  const start = { cx: 4, cy: 3, w: 4, h: 2, angle: 0 }
  const out = resizeTransform(start, 1, 1, toLocal(start, 8, 6))

  assert.equal(out.w, 6)
  assert.equal(out.h, 4)
  assert.ok(near(out.cx, 5))
  assert.ok(near(out.cy, 4))
})

test('dragging an edge past the opposite edge flips the content', () => {
  const start = { cx: 4, cy: 3, w: 4, h: 2, angle: 0 }
  const out = resizeTransform(start, 1, 0, toLocal(start, 0, 3))

  assert.equal(out.w, -2)
  assert.equal(out.h, 2)
  assert.ok(near(out.cx, 1))
})

test('keepRatio scales both sides by the same factor', () => {
  const start = { cx: 4, cy: 3, w: 4, h: 2, angle: 0 }
  const out = resizeTransform(start, 1, 1, { x: 6, y: 1 }, true)

  assert.equal(out.w, 8)
  assert.equal(out.h, 4)
})

test('the size never goes below one cell', () => {
  const start = { cx: 4, cy: 3, w: 4, h: 2, angle: 0 }
  const out = resizeTransform(start, 1, 0, { x: -2, y: 0 })

  assert.equal(Math.abs(out.w), 1)
})

test('rotatedAngle follows the pointer around the center and snaps with shift', () => {
  const start = { cx: 0, cy: 0, w: 4, h: 4, angle: 0 }

  assert.ok(near(rotatedAngle(start, { x: 1, y: 0 }, { x: 0, y: 1 }), Math.PI / 2))
  assert.ok(near(rotatedAngle(start, { x: 1, y: 0 }, { x: 0.1, y: 1 }, true), Math.PI / 2))
})

test('snapAngle rounds to 45° steps', () => {
  assert.equal(snapAngle(0.3), 0)
  assert.ok(near(snapAngle(1.6), Math.PI / 2))
})
