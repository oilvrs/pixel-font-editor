import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, setPixel } from '../src/core/grid.js'
import { effectiveSpacing } from '../src/core/spacing.js'

function glyphWithPixel(extra = {}) {
  const grid = createGrid(16)
  setPixel(grid, 2, 3, 1)
  return { grid, shapes: [], spacing: { left: null, right: null }, ...extra }
}

test('automatic spacing follows the margin', () => {
  const s = effectiveSpacing(glyphWithPixel(), 16, 1)

  assert.equal(s.left, 128) // 1 px of 128 units
  assert.equal(s.right, 128)
  assert.equal(s.ink, 128)
  assert.equal(s.width, 384)
  assert.equal(s.leftIsAuto, true)
  assert.equal(s.rightIsAuto, true)
  assert.equal(s.unit, 128)
})

test('a value of its own replaces the automatic one, one side at a time', () => {
  const s = effectiveSpacing(glyphWithPixel({ spacing: { left: 300, right: null } }), 16, 1)

  assert.equal(s.left, 300)
  assert.equal(s.right, 128)
  assert.equal(s.width, 556)
  assert.equal(s.leftIsAuto, false)
  assert.equal(s.rightIsAuto, true)
})

test('sidebearings can be negative', () => {
  const s = effectiveSpacing(glyphWithPixel({ spacing: { left: -50, right: 20 } }), 16, 1)
  assert.equal(s.width, -50 + 128 + 20)
})

test('shapes count in the width', () => {
  const circle = { type: 'ellipse', cx: 7, cy: 2, w: 2, h: 2, angle: 0 } // Cells 6 and 7, the pixel is in column 2
  const s = effectiveSpacing(glyphWithPixel({ shapes: [circle] }), 16, 1)

  assert.equal(s.ink, 6 * 128)
})

test('an empty glyph has no spacing', () => {
  assert.equal(effectiveSpacing({ grid: createGrid(16), shapes: [], spacing: null }, 16, 1), null)
})
