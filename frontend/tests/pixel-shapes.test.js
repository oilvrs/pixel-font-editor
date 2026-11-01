import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, setPixel } from '../src/core/grid.js'
import { MAX_SHAPES, sanitizeShapes } from '../src/core/glyph.js'
import { SHAPE_TYPES, shapeBounds } from '../src/core/shapes.js'
import { countPixels, pixelsToShapes } from '../src/core/pixel-shapes.js'

/**
 * Makes a grid with some pixels filled.
 * @param {number[][]} cells - the [x, y] cells to fill
 * @param {number} [size]
 * @returns {Object}
 */
function makeGrid(cells, size = 8) {
  const grid = createGrid(size)
  for (const [x, y] of cells) setPixel(grid, x, y, 1)
  return grid
}

test('every filled pixel becomes one shape that is one cell in size, row by row', () => {
  const grid = makeGrid([
    [1, 2],
    [3, 0],
  ])

  assert.deepEqual(pixelsToShapes(grid, 'ellipse'), [
    { type: 'ellipse', cx: 3.5, cy: 0.5, w: 1, h: 1, angle: 0 },
    { type: 'ellipse', cx: 1.5, cy: 2.5, w: 1, h: 1, angle: 0 },
  ])
})

test('an empty grid gives no shapes', () => {
  assert.deepEqual(pixelsToShapes(createGrid(8), 'rect'), [])
  assert.equal(countPixels(createGrid(8)), 0)
})

test('a region only takes the pixels inside it', () => {
  const grid = makeGrid([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
  ])
  const region = { x: 1, y: 1, width: 2, height: 2 }

  assert.deepEqual(
    pixelsToShapes(grid, 'rect', region).map((shape) => [shape.cx, shape.cy]),
    [
      [1.5, 1.5],
      [2.5, 2.5],
    ]
  )
  assert.equal(countPixels(grid, region), 2)
})

test('a region that reaches outside the grid is cut at the edge', () => {
  const grid = makeGrid([
    [0, 0],
    [7, 7],
  ])
  const region = { x: -3, y: -3, width: 20, height: 20 }

  assert.equal(pixelsToShapes(grid, 'rect', region).length, 2)
  assert.equal(countPixels(grid, region), 2)
})

test('countPixels agrees with the number of shapes, for the whole grid and for a region', () => {
  const cells = []
  for (let i = 0; i < 64; i++) if ((i * 37) % 5 < 2) cells.push([i % 8, Math.floor(i / 8)])
  const grid = makeGrid(cells)
  const region = { x: 2, y: 1, width: 4, height: 5 }

  assert.equal(countPixels(grid), pixelsToShapes(grid, 'rect').length)
  assert.equal(countPixels(grid, region), pixelsToShapes(grid, 'rect', region).length)
  assert.equal(countPixels(grid), cells.length)
})

test('each shape of every type covers exactly the cell of its pixel', () => {
  const grid = makeGrid([[3, 5]])

  for (const type of SHAPE_TYPES) {
    const [shape] = pixelsToShapes(grid, type)
    const bounds = shapeBounds(shape)

    assert.ok(Math.abs(bounds.minX - 3) < 1e-6, `${type} minX`)
    assert.ok(Math.abs(bounds.maxX - 4) < 1e-6, `${type} maxX`)
    assert.ok(Math.abs(bounds.minY - 5) < 1e-6, `${type} minY`)
    assert.ok(Math.abs(bounds.maxY - 6) < 1e-6, `${type} maxY`)
  }
})

test('the shapes survive sanitizeShapes unchanged, so they are saved as they are', () => {
  const grid = makeGrid([
    [0, 0],
    [4, 4],
  ])

  for (const type of SHAPE_TYPES) {
    const shapes = pixelsToShapes(grid, type)
    assert.deepEqual(sanitizeShapes(shapes), shapes, type)
  }
})

test('a glyph can have a shape for every pixel of a 32x32 grid', () => {
  assert.ok(MAX_SHAPES >= 32 * 32)
})
