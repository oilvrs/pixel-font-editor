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
  const grid = gridFrom(['', '', '', '..#'])
  const svg = buildSvg(grid, { advance: 10 })

  assert.equal(viewBoxOf(svg), '0 -1792 1280 2048')
  assert.ok(svg.includes('fill-rule="evenodd"'))

  const numbers = [...new Set(pathOf(svg).match(/-?\d+/g).map(Number))].sort((a, b) => a - b)
  assert.deepEqual(numbers, [-1408, -1280, 256, 384])
})

test('origin top puts (0, 0) in the top left corner', () => {
  const grid = gridFrom(['', '', '', '..#'])
  const svg = buildSvg(grid, { advance: 10, origin: 'top' })

  assert.equal(viewBoxOf(svg), '0 0 1280 2048')

  const numbers = [...new Set(pathOf(svg).match(/-?\d+/g).map(Number))].sort((a, b) => a - b)
  assert.deepEqual(numbers, [256, 384, 512])
})

test('the units per pixel follow the grid size', () => {
  const svg = buildSvg(gridFrom(['#'], 8), { advance: 5 })
  assert.equal(viewBoxOf(svg), '0 -1792 1280 2048') // 256 units per pixel, baseline at row 7
})

test('O: one counter-clockwise outer contour and one clockwise hole', () => {
  const grid = gridFrom(['.####...', '.#..#...', '.#..#...', '.####...'])
  const parts = subpaths(buildSvg(grid, { advance: 10 })).map(parseSubpath)

  assert.equal(parts.length, 2)

  const areas = parts.map(area)
  assert.equal(areas.filter((a) => a < 0).length, 1) // Outer, counter-clockwise on screen
  assert.equal(areas.filter((a) => a > 0).length, 1) // Hole, clockwise on screen
})

test('every subpath is closed and uses only horizontal and vertical moves', () => {
  const grid = gridFrom(['#####...', '#...#...', '#####...', '#...#...', '#####...'])
  const svg = buildSvg(grid, { advance: 10 })

  assert.equal(subpaths(svg).length, 3)
  assert.equal((pathOf(svg).match(/Z/g) || []).length, 3)
  assert.ok(!/[LCQ]/.test(pathOf(svg)))
})

test('inkBounds finds the filled rectangle, or null when empty', () => {
  assert.equal(inkBounds(createGrid(16)), null)

  const grid = gridFrom(['', '..#', '.#', '', '...#'])
  assert.deepEqual(inkBounds(grid), { minX: 1, minY: 1, maxX: 3, maxY: 4 })
})
