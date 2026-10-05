import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, setPixel } from '../src/core/grid.js'
import { buildUfo, safeFileName } from '../src/core/export-ufo.js'

function gridFrom(rows, size = 16) {
  const grid = createGrid(size)
  rows.forEach((row, y) => {
    ;[...row].forEach((char, x) => {
      if (char === '#') setPixel(grid, x, y, 1)
    })
  })
  return grid
}

const files = (ufo) => new Map(ufo.files.map((f) => [f.name, f.data]))

const contoursOf = (glifText) =>
  glifText
    .split('<contour>')
    .slice(1)
    .map((part) => [...part.matchAll(/<point x="(-?\d+)" y="(-?\d+)" type="line"\/>/g)].map((m) => ({ x: +m[1], y: +m[2] })))

function area(points) {
  let sum = 0
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  })
  return sum / 2
}

const pixel = gridFrom(['', '', '', '..#']) // Column 2, row 3

test('the UFO has every required file inside one folder', () => {
  const ufo = buildUfo([{ char: 'a', grid: pixel }], { familyName: 'Test Font', size: 16, margin: 1 })
  const names = ufo.files.map((f) => f.name)

  assert.equal(ufo.folderName, 'Test Font.ufo')
  for (const name of ['metainfo.plist', 'fontinfo.plist', 'layercontents.plist', 'lib.plist', 'glyphs/contents.plist', 'glyphs/a.glif', 'glyphs/space.glif']) {
    assert.ok(names.includes(`Test Font.ufo/${name}`), name)
  }
})

test('a glyph has advance width, unicode and a counter-clockwise outline in font units', () => {
  const ufo = buildUfo([{ char: 'a', grid: pixel }], { familyName: 'Test', size: 16, margin: 1 })
  const glif = files(ufo).get('Test.ufo/glyphs/a.glif')

  assert.ok(glif.includes('<advance width="384"/>')) // Margin 1 + ink 1 + margin 1 = 3 px of 128 units
  assert.ok(glif.includes('<unicode hex="0061"/>'))

  const [points] = contoursOf(glif)
  const keys = points.map((p) => `${p.x},${p.y}`).sort()

  assert.deepEqual(keys, ['128,1280', '128,1408', '256,1280', '256,1408']) // Left edge 1 px from x = 0, y upwards from the baseline
  assert.ok(area(points) > 0)
})

test('O: the outer contour is counter-clockwise and the hole clockwise', () => {
  const grid = gridFrom(['.####...', '.#..#...', '.#..#...', '.####...'])
  const ufo = buildUfo([{ char: 'O', grid }], { familyName: 'Test', size: 16, margin: 1 })
  const areas = contoursOf(files(ufo).get('Test.ufo/glyphs/O_.glif')).map(area)

  assert.equal(areas.length, 2)
  assert.equal(areas.filter((a) => a > 0).length, 1)
  assert.equal(areas.filter((a) => a < 0).length, 1)
})

test('fontinfo has the metrics in font units', () => {
  const ufo = buildUfo([{ char: 'a', grid: pixel }], { familyName: 'Test', size: 32, margin: 2 })
  const info = files(ufo).get('Test.ufo/fontinfo.plist')
  const value = (key) => Number(info.match(new RegExp(`<key>${key}</key>\\s*<integer>(-?\\d+)</integer>`))[1])

  assert.equal(value('unitsPerEm'), 2048)
  assert.equal(value('ascender'), 1792)
  assert.equal(value('capHeight'), 1536)
  assert.equal(value('xHeight'), 1024)
  assert.equal(value('descender'), -256)
})

test('contents.plist maps names to file names, and the glyph order starts with space', () => {
  const ufo = buildUfo([{ char: 'A', grid: pixel }], { familyName: 'Test', size: 16, margin: 1 })
  const contents = files(ufo).get('Test.ufo/glyphs/contents.plist')
  const lib = files(ufo).get('Test.ufo/lib.plist')

  assert.match(contents, /<key>A<\/key>\s*<string>A_\.glif<\/string>/)
  assert.ok(lib.indexOf('<string>space</string>') < lib.indexOf('<string>A</string>'))
})

test('space is an empty glyph a third of the grid wide', () => {
  const ufo = buildUfo([{ char: 'a', grid: pixel }], { familyName: 'Test', size: 16, margin: 1 })
  const space = files(ufo).get('Test.ufo/glyphs/space.glif')

  assert.ok(space.includes('<advance width="640"/>')) // 5 px of 128 units
  assert.ok(space.includes('<unicode hex="0020"/>'))
  assert.ok(!space.includes('<outline>'))
})

test('the family name is escaped in XML and made safe as a file name', () => {
  const ufo = buildUfo([{ char: 'a', grid: pixel }], { familyName: 'A&B/C', size: 16, margin: 1 })

  assert.equal(ufo.folderName, 'A&B-C.ufo')
  assert.ok(files(ufo).get('A&B-C.ufo/fontinfo.plist').includes('<string>A&amp;B/C</string>'))
})

test('safeFileName', () => {
  assert.equal(safeFileName('A/B:C'), 'A-B-C')
  assert.equal(safeFileName(''), 'Pixel Font')
  assert.equal(safeFileName('..hidden'), 'hidden')
})

test('a shape becomes curve points, with smooth junctions for an ellipse', () => {
  const ellipse = { type: 'ellipse', cx: 3, cy: 3, w: 2, h: 2, angle: 0 }
  const ufo = buildUfo([{ char: 'o', grid: createGrid(16), shapes: [ellipse] }], {
    familyName: 'Test',
    size: 16,
    margin: 1
  })
  const glif = files(ufo).get('Test.ufo/glyphs/o.glif')

  assert.equal((glif.match(/<point /g) || []).length, 12) // Four curves with two control points each
  assert.equal((glif.match(/type="curve" smooth="yes"/g) || []).length, 4)
  assert.ok(glif.includes('<advance width="512"/>')) // 2 px of shape plus 2 px of margin
})

test('a triangle shape is a closed contour of lines', () => {
  const triangle = { type: 'triangle', cx: 2, cy: 2, w: 2, h: 2, angle: 0 }
  const ufo = buildUfo([{ char: 'v', grid: createGrid(16), shapes: [triangle] }], {
    familyName: 'Test',
    size: 16,
    margin: 0
  })
  const contours = contoursOf(files(ufo).get('Test.ufo/glyphs/v.glif'))

  assert.equal(contours.length, 1)
  assert.equal(contours[0].length, 3)
  assert.ok(area(contours[0]) > 0) // Counter-clockwise in y-up coordinates
})