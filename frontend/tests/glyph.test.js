import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, setPixel, getPixel } from '../src/core/grid.js'
import {
  inkBounds,
  asGlyph,
  glyphIsEmpty,
  glyphBounds,
  cloneShapes,
  sanitizeShapes,
  serializeGlyph,
  deserializeGlyph,
  sanitizeSpacing
} from '../src/core/glyph.js'

const rect = { type: 'rect', cx: 7, cy: 3, w: 2, h: 2, angle: 0 } // Cells 6 and 7

function gridWithPixel(x = 2, y = 1) {
  const grid = createGrid(16)
  setPixel(grid, x, y, 1)
  return grid
}

test('asGlyph accepts a grid, a glyph or nothing', () => {
  const grid = createGrid(16)
  const automatic = { left: null, right: null }

  assert.equal(asGlyph(null), null)
  assert.deepEqual(asGlyph(grid), { grid, shapes: [], spacing: automatic })
  assert.deepEqual(asGlyph({ grid, shapes: [rect], history: {} }), { grid, shapes: [rect], spacing: automatic })
})

test('glyphIsEmpty needs both no pixels and no shapes', () => {
  assert.equal(glyphIsEmpty({ grid: createGrid(16), shapes: [] }), true)
  assert.equal(glyphIsEmpty({ grid: createGrid(16) }), true)
  assert.equal(glyphIsEmpty({ grid: gridWithPixel(), shapes: [] }), false)
  assert.equal(glyphIsEmpty({ grid: createGrid(16), shapes: [rect] }), false)
})

test('glyphBounds covers pixels with their whole cell', () => {
  assert.deepEqual(glyphBounds({ grid: gridWithPixel(2), shapes: [] }), { left: 2, right: 3 })
  assert.equal(glyphBounds({ grid: createGrid(16), shapes: [] }), null)
})

test('glyphBounds includes shapes', () => {
  assert.deepEqual(glyphBounds({ grid: gridWithPixel(2), shapes: [rect] }), { left: 2, right: 8 })
  assert.deepEqual(glyphBounds({ grid: createGrid(16), shapes: [rect] }), { left: 6, right: 8 })
})

test('inkBounds finds the filled rectangle, or null when empty', () => {
  assert.equal(inkBounds(createGrid(16)), null)
  assert.deepEqual(inkBounds(gridWithPixel(3, 4)), { minX: 3, minY: 4, maxX: 3, maxY: 4 })
})

test('shapes are copied, not shared', () => {
  const copy = cloneShapes([rect])
  copy[0].cx = 99
  assert.equal(rect.cx, 7)
})

test('sanitizeShapes drops invalid shapes and unknown fields', () => {
  const list = [
    rect,
    { type: 'star', cx: 1, cy: 1, w: 2, h: 2, angle: 0 },
    { type: 'rect', cx: 'x', cy: 1, w: 2, h: 2, angle: 0 },
    { type: 'rect', cx: 1, cy: 1, w: 0, h: 2, angle: 0 },
    { ...rect, extra: 'ignored' },
    null
  ]

  assert.deepEqual(sanitizeShapes(list), [rect, rect])
  assert.deepEqual(sanitizeShapes('nope'), [])
})

test('a glyph with shapes survives serialization', () => {
  const grid = gridWithPixel(3, 4)
  const data = JSON.parse(JSON.stringify(serializeGlyph({ grid, shapes: [rect] })))
  const restored = deserializeGlyph(data)

  assert.equal(getPixel(restored.grid, 3, 4), 1)
  assert.deepEqual(restored.shapes, [rect])
})

test('shapes are not written when there are none, and old data loads without shapes', () => {
  const data = serializeGlyph({ grid: gridWithPixel(), shapes: [] })

  assert.ok(!('shapes' in data))
  assert.deepEqual(deserializeGlyph(data).shapes, [])
})

test('sanitizeSpacing keeps whole numbers within limits and drops anything else', () => {
  assert.deepEqual(sanitizeSpacing({ left: 150.4, right: null }), { left: 150, right: null })
  assert.deepEqual(sanitizeSpacing({ left: 'x', right: 99999 }), { left: null, right: 8192 })
  assert.deepEqual(sanitizeSpacing(undefined), { left: null, right: null })
})

test('spacing survives serialization', () => {
  const grid = gridWithPixel()
  const data = JSON.parse(JSON.stringify(serializeGlyph({ grid, shapes: [], spacing: { left: 150, right: null } })))

  assert.deepEqual(deserializeGlyph(data).spacing, { left: 150, right: null })
})

test('automatic spacing is not written, and old data loads as automatic', () => {
  const data = serializeGlyph({ grid: gridWithPixel(), shapes: [], spacing: { left: null, right: null } })

  assert.ok(!('spacing' in data))
  assert.deepEqual(deserializeGlyph(data).spacing, { left: null, right: null })
})
