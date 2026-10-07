import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, setPixel } from '../src/core/grid.js'
import { buildSvg, inkBounds } from '../src/core/export-svg.js'

function gridFrom(rows, size = 16) {
  const grid = createGrid(size)
  rows.forEach((row, y) => {
    ;[...row].forEach((char, x) => {
      if (char === '#') setPixel(grid, x, y, 1)
    })
  })
  return grid
}

const pathOf = (svg) => svg.match(/ d="([^"]*)"/)[1]
const viewBoxOf = (svg) => svg.match(/viewBox="([^"]*)"/)[1]
const numbersOf = (svg) => [...new Set(pathOf(svg).match(/-?\d+/g).map(Number))].sort((a, b) => a - b)

/**
 * Reads one subpath (M, H, V commands) back into points.
 */
function parseSubpath(text) {
  const points = []
  let x = 0
  let y = 0

  for (const [, command, a, b] of text.matchAll(/([MHV])(-?\d+(?:\.\d+)?)(?:\s+(-?\d+(?:\.\d+)?))?/g)) {
    if (command === 'M') {
      x = Number(a)
      y = Number(b)
    } else if (command === 'H') {
      x = Number(a)
    } else {
      y = Number(a)
    }
    points.push({ x, y })
  }

  return points
}

function area(points) {
  let sum = 0
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  })
  return sum / 2
}

const subpaths = (svg) =>
  pathOf(svg)
    .split('Z')
    .map((s) => s.trim())
    .filter(Boolean)

test('a single pixel on 16x16 is written in font units, origin at the baseline', () => {
  const grid = gridFrom(['', '', '', '..#']) // Column 2, row 3
  const svg = buildSvg(grid, { margin: 1 })

  assert.equal(viewBoxOf(svg), '0 -1792 384 2048') // Width: margin 1 + ink 1 + margin 1 = 3 px = 384 units
  assert.ok(svg.includes('fill-rule="nonzero"'))
  assert.deepEqual(numbersOf(svg), [-1408, -1280, 128, 256]) // Moved left so the ink starts 1 px from x = 0
})

test('origin top puts (0, 0) in the top left corner', () => {
  const svg = buildSvg(gridFrom(['', '', '', '..#']), { margin: 1, origin: 'top' })

  assert.equal(viewBoxOf(svg), '0 0 384 2048')
  assert.deepEqual(numbersOf(svg), [128, 256, 384, 512])
})

test('the units per pixel follow the grid size', () => {
  const svg = buildSvg(gridFrom(['#'], 8), { margin: 1 })
  assert.equal(viewBoxOf(svg), '0 -1792 768 2048') // 256 units per pixel, baseline at row 7
})

test('where the letter is drawn horizontally does not matter', () => {
  const left = buildSvg(gridFrom(['...#', '...#']), { margin: 2 })
  const right = buildSvg(gridFrom(['.........#', '.........#']), { margin: 2 })

  assert.equal(left, right)
})

test('margin 0 gives a tight glyph: the ink starts at x = 0 and fills the width', () => {
  const svg = buildSvg(gridFrom(['.###']), { margin: 0 })

  assert.equal(viewBoxOf(svg), '0 -1792 384 2048')
  assert.equal(Math.min(...numbersOf(svg).filter((n) => n >= 0 && n <= 384)), 0)
})

test('an empty grid gives an empty path and a width of two margins', () => {
  const svg = buildSvg(createGrid(16), { margin: 2 })

  assert.equal(pathOf(svg), '')
  assert.equal(viewBoxOf(svg), '0 -1792 512 2048')
})

test('O: one counter-clockwise outer contour and one clockwise hole', () => {
  const grid = gridFrom(['.####...', '.#..#...', '.#..#...', '.####...'])
  const parts = subpaths(buildSvg(grid, { margin: 1 })).map(parseSubpath)

  assert.equal(parts.length, 2)

  const areas = parts.map(area)
  assert.equal(areas.filter((a) => a < 0).length, 1) // Outer, counter-clockwise on screen
  assert.equal(areas.filter((a) => a > 0).length, 1) // Hole, clockwise on screen
})

test('every subpath is closed and uses only horizontal and vertical moves', () => {
  const grid = gridFrom(['#####...', '#...#...', '#####...', '#...#...', '#####...'])
  const svg = buildSvg(grid, { margin: 1 })

  assert.equal(subpaths(svg).length, 3)
  assert.equal((pathOf(svg).match(/Z/g) || []).length, 3)
  assert.ok(!/[LCQ]/.test(pathOf(svg)))
})

test('inkBounds finds the filled rectangle, or null when empty', () => {
  assert.equal(inkBounds(createGrid(16)), null)

  const grid = gridFrom(['', '..#', '.#', '', '...#'])
  assert.deepEqual(inkBounds(grid), { minX: 1, minY: 1, maxX: 3, maxY: 4 })
})

test('shapes are written as curves and count in the advance width', () => {
  const grid = gridFrom(['..#']) // Column 2
  const circle = { type: 'ellipse', cx: 7, cy: 2, w: 2, h: 2, angle: 0 } // Cells 6 and 7
  const svg = buildSvg(grid, { margin: 1, shapes: [circle] })

  assert.match(pathOf(svg), /C/)
  assert.equal(subpaths(svg).length, 2) // The pixel and the shape
  assert.equal(viewBoxOf(svg), '0 -1792 1024 2048') // Ink from column 2 to 8 is 6 px, plus 2 margin = 8 px of 128 units
})

test('a glyph with only shapes can be exported', () => {
  const triangle = { type: 'triangle', cx: 2, cy: 2, w: 2, h: 2, angle: 0 }
  const svg = buildSvg(createGrid(16), { margin: 0, shapes: [triangle] })

  assert.equal(viewBoxOf(svg), '0 -1792 256 2048')
  assert.equal(subpaths(svg).length, 1)
})

test('where a shape sits horizontally does not matter', () => {
  const at = (cx) => ({ type: 'quarter', cx, cy: 3, w: 2, h: 2, angle: 0 })

  assert.equal(buildSvg(createGrid(16), { margin: 1, shapes: [at(3)] }), buildSvg(createGrid(16), { margin: 1, shapes: [at(9)] }))
})

test('spacing of its own sets the left edge and the advance width', () => {
  const svg = buildSvg(gridFrom(['', '', '', '..#']), { margin: 1, spacing: { left: 300, right: 100 } })

  assert.equal(viewBoxOf(svg), '0 -1792 528 2048') // 300 + 128 + 100
  assert.deepEqual(numbersOf(svg), [-1408, -1280, 300, 428])
})

test('one side can be automatic while the other is set', () => {
  const svg = buildSvg(gridFrom(['..#']), { margin: 1, spacing: { left: null, right: 0 } })
  assert.equal(viewBoxOf(svg), '0 -1792 256 2048') // 128 automatic + 128 ink + 0
})