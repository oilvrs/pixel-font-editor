import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SIZES,
  createGrid,
  getPixel,
  setPixel,
  clearGrid,
  cloneGrid,
  isEmpty,
  resizeGrid,
  serializeGrid,
  deserializeGrid,
  drawLine,
  stampBrush,
  extractRegion,
  pasteRegion,
  clearRegion,
  pixelsEqual
} from '../src/core/grid.js'

test('createGrid makes an empty grid for every supported size', () => {
  for (const size of SIZES) {
    const grid = createGrid(size)
    assert.equal(grid.pixels.length, size * size)
    assert.ok(isEmpty(grid))
  }
})

test('createGrid rejects unsupported sizes', () => {
  assert.throws(() => createGrid(24), RangeError)
})

test('setPixel and getPixel work, and report changes', () => {
  const grid = createGrid(16)
  assert.equal(setPixel(grid, 3, 4, 1), true)
  assert.equal(setPixel(grid, 3, 4, 1), false) // no change
  assert.equal(getPixel(grid, 3, 4), 1)
  assert.equal(setPixel(grid, 3, 4, 0), true)
  assert.equal(getPixel(grid, 3, 4), 0)
})

test('out-of-bounds access is safe', () => {
  const grid = createGrid(16)
  assert.equal(setPixel(grid, -1, 0, 1), false)
  assert.equal(setPixel(grid, 16, 0, 1), false)
  assert.equal(getPixel(grid, 0, 99), 0)
  assert.ok(isEmpty(grid))
})

test('cloneGrid is independent of the original', () => {
  const grid = createGrid(16)
  setPixel(grid, 1, 1, 1)
  const copy = cloneGrid(grid)
  setPixel(copy, 2, 2, 1)
  assert.equal(getPixel(grid, 2, 2), 0)
  assert.equal(getPixel(copy, 1, 1), 1)
})

test('clearGrid empties the grid', () => {
  const grid = createGrid(16)
  setPixel(grid, 5, 5, 1)
  clearGrid(grid)
  assert.ok(isEmpty(grid))
})

test('upscaling 16 to 32 turns each pixel into a 2x2 block', () => {
  const grid = createGrid(16)
  setPixel(grid, 3, 5, 1)
  const big = resizeGrid(grid, 32)

  for (const [x, y] of [[6, 10], [7, 10], [6, 11], [7, 11]]) {
    assert.equal(getPixel(big, x, y), 1)
  }
  assert.equal(big.pixels.reduce((sum, v) => sum + v, 0), 4)
})

test('upscaling then downscaling restores the original', () => {
  const grid = createGrid(16)
  setPixel(grid, 0, 0, 1)
  setPixel(grid, 15, 15, 1)
  setPixel(grid, 7, 3, 1)

  const roundTrip = resizeGrid(resizeGrid(grid, 64), 16)
  assert.deepEqual(roundTrip.pixels, grid.pixels)
})

test('serialize and deserialize round-trip for every size', () => {
  for (const size of SIZES) {
    const grid = createGrid(size)
    for (let i = 0; i < size; i++) {
      setPixel(grid, i, i, 1)
      setPixel(grid, size - 1 - i, i, 1)
    }

    const restored = deserializeGrid(JSON.parse(JSON.stringify(serializeGrid(grid))))
    assert.equal(restored.size, size)
    assert.deepEqual(restored.pixels, grid.pixels)
  }
})

test('drawLine fills a horizontal line including endpoints', () => {
  const grid = createGrid(16)
  assert.equal(drawLine(grid, 2, 3, 6, 3, 1), true)
  for (let x = 2; x <= 6; x++) assert.equal(getPixel(grid, x, 3), 1)
  assert.equal(grid.pixels.reduce((sum, v) => sum + v, 0), 5)
})

test('drawLine draws a diagonal without gaps', () => {
  const grid = createGrid(16)
  drawLine(grid, 0, 0, 4, 4, 1)
  for (let i = 0; i <= 4; i++) assert.equal(getPixel(grid, i, i), 1)
  assert.equal(grid.pixels.reduce((sum, v) => sum + v, 0), 5)
})

test('drawLine erases when value is 0', () => {
  const grid = createGrid(16)
  drawLine(grid, 0, 0, 5, 0, 1)
  drawLine(grid, 2, 0, 3, 0, 0)
  assert.equal(getPixel(grid, 1, 0), 1)
  assert.equal(getPixel(grid, 2, 0), 0)
  assert.equal(getPixel(grid, 3, 0), 0)
  assert.equal(getPixel(grid, 4, 0), 1)
})

test('drawLine clips lines that start outside the grid', () => {
  const grid = createGrid(16)
  drawLine(grid, -5, 0, 3, 0, 1)
  assert.equal(grid.pixels.reduce((sum, v) => sum + v, 0), 4)
})

test('stampBrush fills a square around the cell', () => {
  const grid = createGrid(8)
  stampBrush(grid, 4, 4, 1, 3)
  assert.equal(grid.pixels.reduce((sum, v) => sum + v, 0), 9)
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) assert.equal(getPixel(grid, x, y), 1)
})

test('stampBrush with an even size extends right and down', () => {
  const grid = createGrid(8)
  stampBrush(grid, 4, 4, 1, 2)
  for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]]) assert.equal(getPixel(grid, x, y), 1)
  assert.equal(grid.pixels.reduce((sum, v) => sum + v, 0), 4)
})

test('stampBrush clips at the grid edge', () => {
  const grid = createGrid(8)
  stampBrush(grid, 0, 0, 1, 3)
  assert.equal(grid.pixels.reduce((sum, v) => sum + v, 0), 4)
})

test('drawLine with a brush size draws a thick line', () => {
  const grid = createGrid(8)
  drawLine(grid, 2, 4, 5, 4, 1, 3)
  assert.equal(grid.pixels.reduce((sum, v) => sum + v, 0), 18) // 6 columns by 3 rows
})

test('extractRegion copies a rectangle', () => {
  const grid = createGrid(8)
  setPixel(grid, 2, 1, 1)
  setPixel(grid, 3, 2, 1)
  const region = extractRegion(grid, 2, 1, 3, 2)
  assert.equal(region.width, 3)
  assert.equal(region.height, 2)
  assert.deepEqual(region.pixels, new Uint8Array([1, 0, 0, 0, 1, 0]))
})

test('pasteRegion adds filled pixels without erasing existing ones', () => {
  const grid = createGrid(8)
  setPixel(grid, 0, 0, 1)
  const region = { width: 2, height: 1, pixels: new Uint8Array([0, 1]) }

  assert.equal(pasteRegion(grid, region, 0, 0), true)
  assert.equal(getPixel(grid, 0, 0), 1) // the transparent pixel did not erase it
  assert.equal(getPixel(grid, 1, 0), 1)
  assert.equal(pasteRegion(grid, region, 0, 0), false) // nothing new
})

test('pasteRegion clips at the grid edge', () => {
  const grid = createGrid(8)
  const region = { width: 2, height: 2, pixels: new Uint8Array([1, 1, 1, 1]) }
  pasteRegion(grid, region, 7, 7)
  assert.equal(grid.pixels.reduce((sum, v) => sum + v, 0), 1)
  assert.equal(getPixel(grid, 7, 7), 1)
})

test('clearRegion empties only the rectangle', () => {
  const grid = createGrid(8)
  setPixel(grid, 1, 1, 1)
  setPixel(grid, 2, 2, 1)
  setPixel(grid, 5, 5, 1)

  assert.equal(clearRegion(grid, 1, 1, 2, 2), true)
  assert.equal(grid.pixels.reduce((sum, v) => sum + v, 0), 1)
  assert.equal(getPixel(grid, 5, 5), 1)
  assert.equal(clearRegion(grid, 1, 1, 2, 2), false) // already empty
})

test('pixelsEqual compares contents', () => {
  assert.equal(pixelsEqual(new Uint8Array([1, 0, 1]), new Uint8Array([1, 0, 1])), true)
  assert.equal(pixelsEqual(new Uint8Array([1, 0, 1]), new Uint8Array([1, 1, 1])), false)
  assert.equal(pixelsEqual(new Uint8Array([1]), new Uint8Array([1, 0])), false)
})
