import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, setPixel } from '../src/core/grid.js'
import { traceGrid } from '../src/core/trace.js'

/**
 * Builds a grid from rows of text: '#' is filled, anything else is empty.
 */
function gridFrom(rows, size = 8) {
  const grid = createGrid(size)
  rows.forEach((row, y) => {
    ;[...row].forEach((char, x) => {
      if (char === '#') setPixel(grid, x, y, 1)
    })
  })
  return grid
}

const pointKeys = (contour) => contour.points.map((p) => `${p.x},${p.y}`).sort()
const totalArea = (contours) => contours.reduce((sum, c) => sum + c.area, 0)
const filledCount = (grid) => grid.pixels.reduce((sum, v) => sum + v, 0)

test('an empty grid has no contours', () => {
  assert.deepEqual(traceGrid(createGrid(8)), [])
})

test('a single pixel is one square contour', () => {
  const contours = traceGrid(gridFrom(['........', '........', '........', '..#.....']))

  assert.equal(contours.length, 1)
  assert.deepEqual(pointKeys(contours[0]), ['2,3', '2,4', '3,3', '3,4'])
  assert.equal(contours[0].area, 1)
  assert.equal(contours[0].isHole, false)
})

test('a rectangle has only its four corners', () => {
  const contours = traceGrid(gridFrom(['.###....', '.###....']))

  assert.equal(contours.length, 1)
  assert.deepEqual(pointKeys(contours[0]), ['1,0', '1,2', '4,0', '4,2'])
  assert.equal(contours[0].area, 6)
})

test('O: an outer contour and one hole with opposite winding', () => {
  const grid = gridFrom(['.####...', '.#..#...', '.#..#...', '.####...'])
  const contours = traceGrid(grid)

  assert.equal(contours.length, 2)

  const outer = contours.find((c) => !c.isHole)
  const hole = contours.find((c) => c.isHole)

  assert.equal(outer.area, 16)
  assert.equal(hole.area, -4)
  assert.deepEqual(pointKeys(hole), ['2,1', '2,3', '4,1', '4,3'])
  assert.equal(totalArea(contours), filledCount(grid))
})

test('i: the dot and the stem are separate contours', () => {
  const grid = gridFrom(['.#......', '........', '.#......', '.#......', '.#......'])
  const contours = traceGrid(grid)

  assert.equal(contours.length, 2)
  assert.ok(contours.every((c) => !c.isHole))
  assert.deepEqual(contours.map((c) => c.area).sort(), [1, 3])
})

test('B: one outer contour and two holes', () => {
  const grid = gridFrom(['#####...', '#...#...', '#####...', '#...#...', '#####...'])
  const contours = traceGrid(grid)

  assert.equal(contours.length, 3)
  assert.equal(contours.filter((c) => c.isHole).length, 2)
  assert.equal(contours.find((c) => !c.isHole).area, 25)
  assert.deepEqual(contours.filter((c) => c.isHole).map((c) => c.area), [-3, -3])
  assert.equal(totalArea(contours), filledCount(grid))
})

test('pixels that touch only at a corner are separate shapes', () => {
  for (const rows of [['#.......', '.#......'], ['.#......', '#.......']]) {
    const contours = traceGrid(gridFrom(rows))

    assert.equal(contours.length, 2)
    assert.ok(contours.every((c) => c.points.length === 4 && c.area === 1))
  }
})

test('a diamond of diagonal pixels has no hole', () => {
  const grid = gridFrom(['.#......', '#.#.....', '.#......'])
  const contours = traceGrid(grid)

  assert.equal(contours.length, 4)
  assert.ok(contours.every((c) => !c.isHole))
})

test('a ring that is only closed diagonally has no hole', () => {
  const grid = gridFrom(['.##.....', '#..#....', '#..#....', '.##.....'])
  const contours = traceGrid(grid)

  assert.equal(contours.length, 4)
  assert.ok(contours.every((c) => !c.isHole))
  assert.equal(totalArea(contours), filledCount(grid))
})

test('random grids: closed corner-only loops whose areas add up to the pixel count', () => {
  let seed = 12345
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  for (const size of [16, 32]) {
    for (let round = 0; round < 20; round++) {
      const grid = createGrid(size)
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) setPixel(grid, x, y, random() < 0.45 ? 1 : 0)
      }

      const contours = traceGrid(grid)
      assert.equal(totalArea(contours), filledCount(grid))

      for (const { points } of contours) {
        assert.ok(points.length >= 4)

        points.forEach((p, i) => {
          const prev = points[(i + points.length - 1) % points.length]
          const next = points[(i + 1) % points.length]

          assert.ok((p.x === next.x) !== (p.y === next.y)) // Moves along exactly one axis
          assert.ok(!(prev.x === p.x && p.x === next.x)) // No collinear points
          assert.ok(!(prev.y === p.y && p.y === next.y))
        })
      }
    }
  }
})
