import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildUfo } from '../src/core/export-ufo.js'
import { createGrid, getPixel, setPixel } from '../src/core/grid.js'
import { inkBounds, noSpacing } from '../src/core/glyph.js'
import {
  flattenContour,
  importUfo,
  isUfoEntry,
  parseGlif,
  summarizeImport,
} from '../src/core/ufo-import.js'

const encode = (text) => new TextEncoder().encode(text)

/**
 * Makes a glyph in the editor's own model.
 * @param {number} size
 * @param {string} char
 * @param {number[][]} cells - the [x, y] cells to fill
 * @param {Object} [options] - { shapes, spacing }
 * @returns {Object} { char, grid, shapes, spacing }
 */
function makeGlyph(size, char, cells, { shapes = [], spacing = noSpacing() } = {}) {
  const grid = createGrid(size)
  for (const [x, y] of cells) setPixel(grid, x, y, 1)
  return { char, grid, shapes, spacing }
}

/**
 * The files of a UFO, as the editor writes them.
 * @param {Object[]} glyphs
 * @param {number} size
 * @param {number} margin
 * @returns {Object[]} [{ name, data }] with data as bytes
 */
function exportUfo(glyphs, size, margin) {
  const { files } = buildUfo(glyphs, { familyName: 'Test Font', size, margin })

  return files.map(({ name, data }) => ({
    name,
    data: typeof data === 'string' ? encode(data) : data,
  }))
}

/**
 * The ink of a grid as text, so that two grids can be compared wherever the ink sits horizontally.
 * @param {Object} grid
 * @returns {Object} { top, rows }
 */
function ink(grid) {
  const bounds = inkBounds(grid)
  const rows = []

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    let row = ''
    for (let x = bounds.minX; x <= bounds.maxX; x++) row += getPixel(grid, x, y) ? '#' : '.'
    rows.push(row)
  }

  return { top: bounds.minY, rows }
}

const A_CELLS = [
  [3, 2],
  [4, 2],
  [3, 3],
  [4, 3],
  [3, 4],
  [6, 4],
  [3, 13],
  [4, 15],
]

test('parseGlif reads the name, the advance, the unicode and the points', () => {
  const parsed = parseGlif(`<?xml version="1.0" encoding="UTF-8"?>
<glyph name="A" format="2">
  <advance width="700"/>
  <unicode hex="0041"/>
  <outline>
    <contour>
      <point x="0" y="0" type="line"/>
      <point x='100' y='0' type='line'/>
      <point x="100" y="50"/>
      <point x="50" y="100" type="curve" smooth="yes"/>
    </contour>
  </outline>
</glyph>`)

  assert.equal(parsed.name, 'A')
  assert.equal(parsed.advance, 700)
  assert.deepEqual(parsed.unicodes, [0x41])
  assert.equal(parsed.contours.length, 1)
  assert.deepEqual(
    parsed.contours[0].map((point) => point.type),
    ['line', 'line', 'offcurve', 'curve']
  )
  assert.equal(parsed.contours[0][1].x, 100)
})

test('parseGlif gives no contours for a glyph without an outline', () => {
  const parsed = parseGlif('<glyph name="space"><advance width="682"/><outline/></glyph>')

  assert.equal(parsed.contours.length, 0)
  assert.equal(parsed.advance, 682)
})

test('flattenContour keeps the corners of a polygon', () => {
  const square = [
    { x: 0, y: 0, type: 'line' },
    { x: 100, y: 0, type: 'line' },
    { x: 100, y: 100, type: 'line' },
    { x: 0, y: 100, type: 'line' },
  ]

  assert.deepEqual(flattenContour(square), [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ])
})

test('flattenContour follows a circle made of four cubic curves, wherever it starts', () => {
  const k = 55.23
  const circle = [
    { x: 100, y: k, type: 'offcurve' },
    { x: k, y: 100, type: 'offcurve' },
    { x: 0, y: 100, type: 'curve' },
    { x: -k, y: 100, type: 'offcurve' },
    { x: -100, y: k, type: 'offcurve' },
    { x: -100, y: 0, type: 'curve' },
    { x: -100, y: -k, type: 'offcurve' },
    { x: -k, y: -100, type: 'offcurve' },
    { x: 0, y: -100, type: 'curve' },
    { x: k, y: -100, type: 'offcurve' },
    { x: 100, y: -k, type: 'offcurve' },
    { x: 100, y: 0, type: 'curve' },
  ]

  const path = flattenContour(circle)

  assert.ok(path.length > 40)
  for (const [x, y] of path) assert.ok(Math.abs(Math.hypot(x, y) - 100) < 0.5)
})

test('flattenContour drops open contours and contours without points to stand on', () => {
  assert.deepEqual(
    flattenContour([
      { x: 0, y: 0, type: 'move' },
      { x: 10, y: 0, type: 'line' },
      { x: 10, y: 10, type: 'line' },
    ]),
    []
  )
  assert.deepEqual(flattenContour([{ x: 0, y: 0, type: 'offcurve' }]), [])
})

test('a UFO from the editor gives back the same pixels and spacing', () => {
  const size = 16
  const glyphs = [
    makeGlyph(size, 'A', A_CELLS),
    makeGlyph(size, 'B', [
      [2, 5],
      [3, 5],
      [4, 5],
      [2, 6],
      [4, 6],
      [2, 7],
      [3, 7],
      [4, 7],
    ]),
  ]

  const imported = importUfo(exportUfo(glyphs, size, 1), { size, margin: 1 })

  assert.deepEqual(
    imported.glyphs.map((glyph) => glyph.char),
    ['A', 'B']
  )

  for (const original of glyphs) {
    const result = imported.glyphs.find((glyph) => glyph.char === original.char)

    assert.deepEqual(ink(result.grid), ink(original.grid), original.char)
    assert.deepEqual(result.spacing, { left: null, right: null })
  }

  assert.equal(imported.familyName, 'Test Font')
  assert.deepEqual(imported.stats, { total: 2, curves: 0, offGrid: 0, clipped: 0, unknown: 0 })
  assert.deepEqual(summarizeImport(imported.stats, size), [])
})

test('spacing of its own is kept', () => {
  const size = 16
  const glyph = makeGlyph(size, 'A', A_CELLS, { spacing: { left: 150, right: 300 } })

  const imported = importUfo(exportUfo([glyph], size, 1), { size, margin: 1 })

  assert.deepEqual(imported.glyphs[0].spacing, { left: 150, right: 300 })
})

test('one side can be automatic while the other is set', () => {
  const size = 16
  const glyph = makeGlyph(size, 'A', A_CELLS, { spacing: { left: 150, right: null } })

  const imported = importUfo(exportUfo([glyph], size, 1), { size, margin: 1 })

  assert.deepEqual(imported.glyphs[0].spacing, { left: 150, right: null })
})

test('a font on a 16 grid imported into a 32 grid has blocks of 2x2 cells and the same spacing', () => {
  const glyph = makeGlyph(16, 'A', [
    [3, 3],
    [4, 3],
    [3, 4],
  ])

  const imported = importUfo(exportUfo([glyph], 16, 1), { size: 32, margin: 2 })
  const result = imported.glyphs[0]

  assert.equal(imported.stats.offGrid, 0)
  assert.deepEqual(result.spacing, { left: null, right: null })

  let filled = 0
  for (const value of result.grid.pixels) filled += value
  assert.equal(filled, 3 * 4)

  const bounds = inkBounds(result.grid)
  assert.equal(bounds.minY, 6)
  assert.equal(bounds.maxY, 9)
})

test('a font on a 32 grid imported into a 16 grid is reported as off the grid', () => {
  const glyph = makeGlyph(32, 'A', [[3, 3]])

  const imported = importUfo(exportUfo([glyph], 32, 2), { size: 16, margin: 1 })

  assert.equal(imported.stats.offGrid, 1)
  assert.match(summarizeImport(imported.stats, 16)[0], /not drawn on a 16×16 grid/)
})

test('a shape is imported as pixels, and the glyph is reported', () => {
  const size = 16
  const shape = { type: 'ellipse', cx: 8, cy: 8, w: 4, h: 4, angle: 0 }
  const glyph = makeGlyph(size, 'O', [], { shapes: [shape] })

  const imported = importUfo(exportUfo([glyph], size, 1), { size, margin: 1 })
  const { grid } = imported.glyphs[0]
  const bounds = inkBounds(grid)

  let filled = 0
  for (const value of grid.pixels) filled += value

  // A circle that is 4 cells wide has centers inside it for 12 of its 16 cells: not the corners.
  assert.equal(filled, 12)
  assert.equal(bounds.maxX - bounds.minX + 1, 4)
  assert.equal(imported.stats.curves, 1)
  assert.match(summarizeImport(imported.stats, size)[0], /curves become pixels/)
  assert.equal(getPixel(grid, bounds.minX, bounds.minY), 0)
})

test('files that macOS adds to a zip are not part of the font', () => {
  assert.equal(isUfoEntry('Font.ufo/glyphs/A_.glif'), true)
  assert.equal(isUfoEntry('Font.ufo/fontinfo.plist'), true)
  assert.equal(isUfoEntry('__MACOSX/Font.ufo/glyphs/._A_.glif'), false)
  assert.equal(isUfoEntry('Font.ufo/glyphs/._A_.glif'), false)
  assert.equal(isUfoEntry('Font.ufo/glyphs.background/A_.glif'), false)
  assert.equal(isUfoEntry('readme.txt'), false)
})

test('a zip without a UFO, or without usable glyphs, is rejected with a clear message', () => {
  assert.throws(
    () => importUfo([{ name: 'readme.txt', data: encode('hello') }], { size: 16, margin: 1 }),
    /no glyphs found/
  )

  const space = '<glyph name="space"><advance width="682"/><unicode hex="0020"/><outline/></glyph>'
  assert.throws(
    () =>
      importUfo([{ name: 'F.ufo/glyphs/space.glif', data: encode(space) }], {
        size: 16,
        margin: 1,
      }),
    /no glyphs found/
  )
})

test('a glyph outside the character set is skipped and counted', () => {
  const size = 16
  const square = (x0, x1) =>
    `<contour><point x="${x0}" y="0" type="line"/><point x="${x1}" y="0" type="line"/>` +
    `<point x="${x1}" y="256" type="line"/><point x="${x0}" y="256" type="line"/></contour>`
  const glif = (name, hex, contour) =>
    `<glyph name="${name}" format="2"><advance width="900"/><unicode hex="${hex}"/><outline>${contour}</outline></glyph>`

  const imported = importUfo(
    [
      { name: 'F.ufo/glyphs/A_.glif', data: encode(glif('A', '0041', square(128, 384))) },
      { name: 'F.ufo/glyphs/zhe-cy.glif', data: encode(glif('zhe-cy', '0416', square(128, 384))) },
    ],
    { size, margin: 1 }
  )

  assert.deepEqual(
    imported.glyphs.map((glyph) => glyph.char),
    ['A']
  )
  assert.equal(imported.stats.unknown, 1)
})

test('a glyph is found by its name when it has no unicode', () => {
  const size = 16
  const glif =
    '<glyph name="aring" format="2"><advance width="900"/><outline><contour>' +
    '<point x="128" y="0" type="line"/><point x="384" y="0" type="line"/>' +
    '<point x="384" y="256" type="line"/><point x="128" y="256" type="line"/></contour></outline></glyph>'

  const imported = importUfo([{ name: 'F.ufo/glyphs/aring.glif', data: encode(glif) }], {
    size,
    margin: 1,
  })

  assert.deepEqual(
    imported.glyphs.map((glyph) => glyph.char),
    ['å']
  )
})

test('a glyph file that is too large, or has too many points, is rejected', () => {
  const wrap = (points) =>
    `<glyph name="A"><advance width="900"/><unicode hex="0041"/><outline><contour>${points}</contour></outline></glyph>`
  const files = (text) => [{ name: 'F.ufo/glyphs/A_.glif', data: encode(text) }]

  const tooLarge = wrap('<point x="1" y="2" type="line"/>'.repeat(40000))
  assert.throws(() => importUfo(files(tooLarge), { size: 16, margin: 1 }), /too large/)

  const tooMany = wrap('<point x="1" y="2"/>'.repeat(30001))
  assert.throws(() => importUfo(files(tooMany), { size: 16, margin: 1 }), /too many points/)
})
