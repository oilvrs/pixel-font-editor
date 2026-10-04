import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, setPixel } from '../src/core/grid.js'
import { layoutText, spaceWidth, missingWidth } from '../src/core/layout.js'

function glyph(rows, size = 16) {
  const grid = createGrid(size)
  rows.forEach((row, y) => {
    ;[...row].forEach((char, x) => {
      if (char === '#') setPixel(grid, x, y, 1)
    })
  })
  return grid
}

const lookup = (glyphs) => (char) => glyphs[char] || null

test('a glyph advances by its ink width plus a margin on each side', () => {
  const a = glyph(['...###']) // Ink in columns 3 to 5, width 3
  const layout = layoutText('a', lookup({ a }), { size: 16, margin: 2 })

  assert.equal(layout.items.length, 1)
  assert.equal(layout.items[0].advance, 7)
  assert.equal(layout.items[0].inkOffset, -1) // margin 2 minus left edge 3
  assert.equal(layout.items[0].missing, false)
  assert.equal(layout.width, 7)
  assert.equal(layout.height, 16)
})

test('glyphs follow each other', () => {
  const a = glyph(['...###'])
  const b = glyph(['#'])
  const layout = layoutText('ab', lookup({ a, b }), { size: 16, margin: 2 })

  assert.equal(layout.items[1].x, 7)
  assert.equal(layout.width, 12) // 7 + (1 + 2 * 2)
})

test('a space adds a third of the grid', () => {
  const a = glyph(['#'])
  const layout = layoutText('a a', lookup({ a }), { size: 16, margin: 1 })

  assert.equal(spaceWidth(16), 5)
  assert.equal(layout.items[1].x, 3 + 5)
})

test('a glyph without a drawing is a marked gap of half the grid', () => {
  const layout = layoutText('x', lookup({}), { size: 16, margin: 2 })

  assert.equal(layout.items[0].missing, true)
  assert.equal(layout.items[0].grid, null)
  assert.equal(layout.items[0].advance, missingWidth(16))
  assert.equal(missingWidth(16), 8)
})

test('an empty drawing counts as missing', () => {
  const layout = layoutText('a', lookup({ a: createGrid(16) }), { size: 16, margin: 2 })
  assert.equal(layout.items[0].missing, true)
})

test('a new line starts at x = 0, one line height further down', () => {
  const a = glyph(['#'])
  const layout = layoutText('a\na', lookup({ a }), { size: 16, margin: 1 })

  assert.equal(layout.items[1].x, 0)
  assert.equal(layout.items[1].y, 18) // 16 plus a gap of 2
  assert.equal(layout.height, 34)
})

test('empty text has no items and no width', () => {
  const layout = layoutText('', lookup({}), { size: 16, margin: 2 })

  assert.deepEqual(layout.items, [])
  assert.equal(layout.width, 0)
  assert.equal(layout.height, 16)
})

test('characters outside the basic plane count as one character', () => {
  const layout = layoutText('😀', lookup({}), { size: 16, margin: 2 })
  assert.equal(layout.items.length, 1)
})
