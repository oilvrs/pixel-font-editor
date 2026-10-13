import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SHAPE_TYPES,
  shapeContour,
  reverseContour,
  flattenContour,
  shapeBounds,
  shapeContains,
  transformShape
} from '../src/core/shapes.js'

const unit = (type, extra = {}) => ({ type, cx: 0.5, cy: 0.5, w: 1, h: 1, angle: 0, ...extra })
const near = (a, b, tolerance = 1e-3) => Math.abs(a - b) < tolerance

function area(points) {
  let sum = 0
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  })
  return sum / 2
}

test('every shape has a clockwise outline with the expected area', () => {
  const expected = { rect: 1, ellipse: Math.PI / 4, quarter: Math.PI / 4, concave: 1 - Math.PI / 4, triangle: 0.5 }

  for (const type of SHAPE_TYPES) {
    const a = area(flattenContour(shapeContour(unit(type)), 32))
    assert.ok(near(a, expected[type]), `${type}: ${a}`)
  }
})

test('every contour ends where it starts', () => {
  for (const type of SHAPE_TYPES) {
    const contour = shapeContour(unit(type))
    const end = contour.segments[contour.segments.length - 1].to

    assert.ok(near(end.x, contour.start.x) && near(end.y, contour.start.y), type)
  }
})

test('mirroring keeps the outline clockwise and moves the right angle', () => {
  const contour = shapeContour(unit('quarter', { w: -1 }))

  assert.ok(area(flattenContour(contour, 32)) > 0)
  assert.ok(near(contour.start.x, 1) && near(contour.start.y, 0)) // The right angle is now at the top right
})

test('mirroring both axes is clockwise as well', () => {
  const contour = shapeContour(unit('triangle', { w: -1, h: -1 }))
  assert.ok(area(flattenContour(contour)) > 0)
})

test('reversing a contour flips its direction, and reversing twice restores it', () => {
  const contour = shapeContour(unit('quarter'))
  const reversed = reverseContour(contour)

  assert.ok(area(flattenContour(reversed, 32)) < 0)

  const again = reverseContour(reversed)
  const a = flattenContour(contour, 8)
  const b = flattenContour(again, 8)
  assert.ok(a.every((p, i) => near(p.x, b[i].x, 1e-9) && near(p.y, b[i].y, 1e-9)))
})

test('the bounds of a shape follow its size, position and rotation', () => {
  const plain = shapeBounds({ type: 'rect', cx: 4, cy: 3, w: 4, h: 2, angle: 0 })
  assert.deepEqual([plain.minX, plain.minY, plain.maxX, plain.maxY], [2, 2, 6, 4])

  const turned = shapeBounds({ type: 'rect', cx: 5.5, cy: 5.5, w: 3, h: 1, angle: Math.PI / 2 })
  assert.ok(near(turned.minX, 5) && near(turned.maxX, 6) && near(turned.minY, 4) && near(turned.maxY, 7))
})

test('an ellipse that is not rotated touches its bounds exactly', () => {
  const b = shapeBounds({ type: 'ellipse', cx: 3, cy: 3, w: 2, h: 2, angle: 0 })
  assert.deepEqual([b.minX, b.minY, b.maxX, b.maxY], [2, 2, 4, 4])
})

test('shapeContains tests the filled part of each shape', () => {
  assert.equal(shapeContains(unit('rect'), 0.5, 0.5), true)
  assert.equal(shapeContains(unit('rect'), 1.5, 0.5), false)

  assert.equal(shapeContains(unit('ellipse'), 0.5, 0.5), true)
  assert.equal(shapeContains(unit('ellipse'), 0.05, 0.05), false) // The corner is outside the circle

  assert.equal(shapeContains(unit('triangle'), 0.2, 0.2), true)
  assert.equal(shapeContains(unit('triangle'), 0.9, 0.9), false)

  assert.equal(shapeContains(unit('quarter'), 0.3, 0.3), true)
  assert.equal(shapeContains(unit('quarter'), 0.9, 0.9), false)

  assert.equal(shapeContains(unit('concave'), 0.1, 0.1), true)
  assert.equal(shapeContains(unit('concave'), 0.5, 0.5), false)
  assert.equal(shapeContains(unit('concave'), 0.9, 0.9), false)
})

test('shapeContains follows rotation', () => {
  const shape = { type: 'rect', cx: 5.5, cy: 5.5, w: 3, h: 1, angle: Math.PI / 2 }

  assert.equal(shapeContains(shape, 5.5, 4.2), true)
  assert.equal(shapeContains(shape, 4.2, 5.5), false)
})

test('transformShape: an unchanged frame leaves the shape as it is', () => {
  const frame = { cx: 5, cy: 5, w: 4, h: 4 }
  const shape = { type: 'quarter', cx: 6, cy: 4, w: 2, h: 1, angle: Math.PI / 2 }
  const out = transformShape(shape, frame, { ...frame, angle: 0 })

  assert.ok(near(out.cx, 6) && near(out.cy, 4) && near(out.w, 2) && near(out.h, 1) && near(out.angle, Math.PI / 2))
})

test('transformShape: moving the group moves the shape', () => {
  const shape = { type: 'rect', cx: 4, cy: 4, w: 2, h: 2, angle: 0 }
  const out = transformShape(shape, { cx: 5, cy: 5, w: 4, h: 4 }, { cx: 8, cy: 2, w: 4, h: 4, angle: 0 })

  assert.ok(near(out.cx, 7) && near(out.cy, 1))
})

test('transformShape: scaling the group scales position and size', () => {
  const shape = { type: 'rect', cx: 4, cy: 4, w: 2, h: 2, angle: 0 }
  const out = transformShape(shape, { cx: 5, cy: 5, w: 4, h: 4 }, { cx: 5, cy: 5, w: 8, h: 8, angle: 0 })

  assert.ok(near(out.cx, 3) && near(out.cy, 3) && near(out.w, 4) && near(out.h, 4))
})

test('transformShape: mirroring the group mirrors the shape', () => {
  const shape = { type: 'quarter', cx: 5, cy: 5, w: 2, h: 2, angle: 0 } // Right angle at the top left
  const out = transformShape(shape, { cx: 5, cy: 5, w: 2, h: 2 }, { cx: 5, cy: 5, w: -2, h: 2, angle: 0 })
  const start = shapeContour(out).start

  assert.ok(near(start.x, 6) && near(start.y, 4)) // Now at the top right
})

test('transformShape: rotating the group turns the shape around the group center', () => {
  const shape = { type: 'rect', cx: 6, cy: 5, w: 2, h: 2, angle: 0 }
  const out = transformShape(shape, { cx: 5, cy: 5, w: 4, h: 4 }, { cx: 5, cy: 5, w: 4, h: 4, angle: Math.PI / 2 })

  assert.ok(near(out.cx, 5) && near(out.cy, 6) && near(out.angle, Math.PI / 2))
})

test('transformShape: a shape turned 90° is scaled along the right axis', () => {
  const shape = { type: 'rect', cx: 5, cy: 5, w: 2, h: 1, angle: Math.PI / 2 }
  const out = transformShape(shape, { cx: 5, cy: 5, w: 2, h: 2 }, { cx: 5, cy: 5, w: 4, h: 2, angle: 0 }) // Twice as wide

  assert.ok(near(out.w, 2) && near(out.h, 2)) // Its height lies along x, so that is what doubles
})
