import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGrid, setPixel } from '../src/core/grid.js'
import { buildFont, outlineGlyph, assembleSfnt } from '../src/core/export-ttf.js'
import { readSfnt, readCmap, readHmtx, readGlyph, readPostNames, readNames, area, sumWords } from './font-reader.js'

const DATE = new Date('2026-10-08T12:00:00Z')
const OPTIONS = { familyName: 'Test Font', size: 32, margin: 2, date: DATE }

function pixelAt(x, y, extra = {}) {
  const grid = createGrid(32)
  setPixel(grid, x, y, 1)
  return { grid, shapes: [], spacing: { left: null, right: null }, ...extra }
}

function box(x0, y0, x1, y1, hole) {
  const grid = createGrid(32)

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!hole || x === x0 || x === x1 || y === y0 || y === y1) setPixel(grid, x, y, 1)
    }
  }

  return { grid, shapes: [], spacing: { left: null, right: null } }
}

const build = (glyphs, options = {}) => {
  const font = buildFont(glyphs, { ...OPTIONS, ...options })
  return { ...font, sfnt: readSfnt(font.ttf) }
}

// Baseline is at row 28 on a 32 grid, and a pixel is 64 units.

test('all required tables are there, in tag order', () => {
  const { sfnt } = build([{ char: 'a', ...pixelAt(3, 27) }])

  assert.equal(sfnt.flavor, 0x00010000)
  assert.deepEqual(sfnt.order, ['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post'])
})

test('checksums are right: every table, and the whole file', () => {
  const { ttf, sfnt } = build([{ char: 'a', ...pixelAt(3, 27) }])

  assert.equal(sumWords(ttf), 0xb1b0afba)

  for (const [tag, table] of Object.entries(sfnt.tables)) {
    const data = ttf.slice(table.offset, table.offset + table.length)
    if (tag === 'head') data.fill(0, 8, 12) // The checksum adjustment counts as zero
    assert.equal(sumWords(data), table.checksum, tag)
  }
})

test('tables start on word boundaries', () => {
  const { sfnt } = build([{ char: 'a', ...pixelAt(3, 27) }])
  for (const table of Object.values(sfnt.tables)) assert.equal(table.offset % 4, 0)
})

test('head has the font units, the date and the extents', () => {
  const { sfnt } = build([{ char: 'a', ...pixelAt(3, 27) }])
  const at = sfnt.tables.head.offset

  assert.equal(sfnt.view.getUint32(at + 12), 0x5f0f3cf5)
  assert.equal(sfnt.view.getUint16(at + 18), 2048)
  assert.equal(sfnt.view.getUint32(at + 24), Math.floor(DATE.getTime() / 1000) + 2082844800) // Created, low word of the 64-bit date
  assert.equal(sfnt.view.getInt16(at + 50), 1) // Long loca offsets
})

test('the metrics are the guides of the editor', () => {
  const { sfnt } = build([{ char: 'a', ...pixelAt(3, 27) }])
  const hhea = sfnt.tables.hhea.offset
  const os2 = sfnt.tables['OS/2'].offset

  assert.equal(sfnt.view.getInt16(hhea + 4), 1792)
  assert.equal(sfnt.view.getInt16(hhea + 6), -256)
  assert.equal(sfnt.view.getInt16(hhea + 8), 0)
  assert.equal(sfnt.view.getInt16(os2 + 68), 1792) // Typo ascender
  assert.equal(sfnt.view.getInt16(os2 + 70), -256)
  assert.equal(sfnt.view.getInt16(os2 + 86), 1024) // x height
  assert.equal(sfnt.view.getInt16(os2 + 88), 1536) // Cap height
})

test('the line gap goes to both hhea and OS/2', () => {
  const { sfnt } = build([{ char: 'a', ...pixelAt(3, 27) }], { lineGap: 256 })

  assert.equal(sfnt.view.getInt16(sfnt.tables.hhea.offset + 8), 256)
  assert.equal(sfnt.view.getInt16(sfnt.tables['OS/2'].offset + 72), 256)
})

test('glyph order is .notdef, space, then the drawn glyphs, with AGLFN names', () => {
  const { sfnt, glyphCount } = build([
    { char: 'a', ...pixelAt(3, 27) },
    { char: 'é', ...pixelAt(3, 27) },
    { char: '€', ...pixelAt(3, 27) }
  ])

  assert.equal(glyphCount, 5)
  assert.deepEqual(readPostNames(sfnt, glyphCount), ['.notdef', 'space', 'a', 'eacute', 'Euro'])
})

test('cmap maps code points to glyphs, and no-break space to space', () => {
  const { sfnt } = build([
    { char: 'a', ...pixelAt(3, 27) },
    { char: 'b', ...pixelAt(3, 27) },
    { char: 'é', ...pixelAt(3, 27) },
    { char: '€', ...pixelAt(3, 27) }
  ])
  const cmap = readCmap(sfnt)

  assert.equal(cmap.get(0x20), 1)
  assert.equal(cmap.get(0xa0), 1)
  assert.equal(cmap.get(0x61), 2)
  assert.equal(cmap.get(0x62), 3)
  assert.equal(cmap.get(0xe9), 4)
  assert.equal(cmap.get(0x20ac), 5)
  assert.equal(cmap.get(0x63), undefined)
  assert.equal(cmap.size, 6)
})

test('advance widths follow the spacing, and sidebearings match the outline', () => {
  const { sfnt, glyphCount } = build([
    { char: 'a', ...pixelAt(3, 27) },
    { char: 'b', ...pixelAt(3, 27, { spacing: { left: 300, right: 100 } }) }
  ])
  const hmtx = readHmtx(sfnt, glyphCount)

  assert.equal(hmtx[0].advance, 1024) // .notdef
  assert.equal(hmtx[1].advance, 704) // Space: a third of the grid, 11 px of 64 units
  assert.deepEqual(hmtx[2], { advance: 128 + 64 + 128, lsb: 128 }) // Automatic margin of 2 px
  assert.deepEqual(hmtx[3], { advance: 300 + 64 + 100, lsb: 300 })
})

test('a negative left sidebearing is allowed', () => {
  const { sfnt, glyphCount } = build([{ char: 'a', ...pixelAt(3, 27, { spacing: { left: -50, right: 20 } }) }])
  const hmtx = readHmtx(sfnt, glyphCount)

  assert.deepEqual(hmtx[2], { advance: -50 + 64 + 20, lsb: -50 })
})

test('where the letter is drawn horizontally does not matter', () => {
  const left = outlineGlyph(pixelAt(3, 27), 32, 2)
  const right = outlineGlyph(pixelAt(20, 27), 32, 2)

  assert.deepEqual(left, right)
})

test('a pixel on the baseline is a clockwise square from y = 0 to the pixel height', () => {
  const { sfnt } = build([{ char: 'a', ...pixelAt(3, 27) }])
  const glyph = readGlyph(sfnt, 2)

  assert.deepEqual(glyph.bounds, { xMin: 128, yMin: 0, xMax: 192, yMax: 64 })
  assert.equal(glyph.contours.length, 1)
  assert.equal(glyph.contours[0].length, 4)
  assert.ok(glyph.contours[0].every((p) => p.on))
  assert.ok(area(glyph.contours[0]) < 0) // Clockwise
})

test('a glyph above the baseline and a descender land at the right height', () => {
  const { sfnt } = build([
    { char: 'a', ...pixelAt(3, 20) },
    { char: 'b', ...pixelAt(3, 29) }
  ])

  assert.deepEqual(readGlyph(sfnt, 2).bounds, { xMin: 128, yMin: 448, xMax: 192, yMax: 512 }) // Row 20 ends 7 rows above the baseline
  assert.deepEqual(readGlyph(sfnt, 3).bounds, { xMin: 128, yMin: -128, xMax: 192, yMax: -64 }) // Row 29: below it
})

test('O: the outer contour is clockwise and the hole counter-clockwise', () => {
  const { sfnt } = build([{ char: 'O', ...box(4, 12, 15, 27, true) }])
  const glyph = readGlyph(sfnt, 2)
  const areas = glyph.contours.map(area)

  assert.equal(glyph.contours.length, 2)
  assert.equal(areas.filter((a) => a < 0).length, 1)
  assert.equal(areas.filter((a) => a > 0).length, 1)
})

test('the first flag of a glyph marks overlapping contours', () => {
  const { sfnt } = build([{ char: 'a', ...pixelAt(3, 27) }])
  assert.equal(readGlyph(sfnt, 2).firstFlag & 0x40, 0x40)
})

test('an ellipse becomes quadratic curves that stay within half a unit of the shape', () => {
  const circle = { type: 'ellipse', cx: 10, cy: 22, w: 12, h: 12, angle: 0 } // Radius 384 units
  const { sfnt } = build([{ char: 'o', grid: createGrid(32), shapes: [circle], spacing: { left: null, right: null } }])
  const glyph = readGlyph(sfnt, 2)
  const points = glyph.contours[0]

  assert.equal(glyph.contours.length, 1)
  assert.equal(points.filter((p) => !p.on).length, 16)
  assert.deepEqual(glyph.bounds, { xMin: 128, yMin: 0, xMax: 896, yMax: 768 })
  assert.ok(area(points) < 0)

  let worst = 0
  for (let i = 0; i < points.length; i++) {
    // Sample each quadratic piece: on-curve, off-curve, on-curve
    if (!points[i].on) continue
    const control = points[(i + 1) % points.length]
    const end = points[(i + 2) % points.length]
    if (control.on) continue

    for (let s = 0; s <= 10; s++) {
      const t = s / 10
      const u = 1 - t
      const x = u * u * points[i].x + 2 * u * t * control.x + t * t * end.x
      const y = u * u * points[i].y + 2 * u * t * control.y + t * t * end.y
      worst = Math.max(worst, Math.abs(Math.hypot(x - 512, y - 384) - 384))
    }
  }

  assert.ok(worst < 1, `worst error ${worst}`)
})

test('shapes with only straight sides have no curve points', () => {
  const triangle = { type: 'triangle', cx: 5, cy: 24, w: 4, h: 4, angle: 0 }
  const { sfnt } = build([{ char: 'v', grid: createGrid(32), shapes: [triangle], spacing: { left: null, right: null } }])
  const glyph = readGlyph(sfnt, 2)

  assert.equal(glyph.contours[0].length, 3)
  assert.ok(glyph.contours[0].every((p) => p.on))
})

test('shapes and pixels in one glyph are separate contours, all clockwise', () => {
  const quarter = { type: 'quarter', cx: 10, cy: 24, w: 4, h: 4, angle: 0 }
  const { sfnt } = build([{ char: 'a', grid: pixelAt(3, 27).grid, shapes: [quarter], spacing: { left: null, right: null } }])
  const glyph = readGlyph(sfnt, 2)

  assert.equal(glyph.contours.length, 2)
  assert.ok(glyph.contours.every((contour) => area(contour) < 0))
})

test('a mirrored shape is still clockwise', () => {
  const quarter = { type: 'quarter', cx: 10, cy: 24, w: -4, h: 4, angle: 0 }
  const { sfnt } = build([{ char: 'a', grid: createGrid(32), shapes: [quarter], spacing: { left: null, right: null } }])

  assert.ok(area(readGlyph(sfnt, 2).contours[0]) < 0)
})

test('where a shape is placed horizontally does not matter either', () => {
  const at = (cx) => ({ type: 'rect', cx, cy: 24, w: 4, h: 4, angle: 0 })
  const make = (cx) => outlineGlyph({ grid: createGrid(32), shapes: [at(cx)], spacing: null }, 32, 2)

  assert.deepEqual(make(5), make(18))
})

test('space has no outline, and .notdef is a box with a hole', () => {
  const { sfnt } = build([{ char: 'a', ...pixelAt(3, 27) }])

  assert.deepEqual(readGlyph(sfnt, 1).contours, [])

  const notdef = readGlyph(sfnt, 0)
  const areas = notdef.contours.map(area)
  assert.equal(notdef.contours.length, 2)
  assert.ok(areas[0] < 0 && areas[1] > 0)
})

test('maxp counts the points and contours', () => {
  const { sfnt, glyphCount } = build([{ char: 'O', ...box(4, 12, 15, 27, true) }])
  const at = sfnt.tables.maxp.offset

  assert.equal(sfnt.view.getUint16(at + 4), glyphCount)
  assert.equal(sfnt.view.getUint16(at + 6), 8) // Two squares of four points
  assert.equal(sfnt.view.getUint16(at + 8), 2)
})

test('names: family, style, version and a PostScript name without spaces', () => {
  const { sfnt } = build([{ char: 'a', ...pixelAt(3, 27) }])
  const names = readNames(sfnt)

  assert.equal(names[1], 'Test Font')
  assert.equal(names[2], 'Regular')
  assert.equal(names[4], 'Test Font')
  assert.equal(names[5], 'Version 1.000')
  assert.equal(names[6], 'TestFont-Regular')
})

test('a family name with other characters gets a safe PostScript name', () => {
  const { sfnt } = build([{ char: 'a', ...pixelAt(3, 27) }], { familyName: 'Åäö – Font!' })
  const names = readNames(sfnt)

  assert.equal(names[1], 'Åäö – Font!')
  assert.match(names[6], /^[A-Za-z0-9-]+$/)
})

test('an empty family name falls back to Pixel Font', () => {
  const { sfnt } = build([{ char: 'a', ...pixelAt(3, 27) }], { familyName: '  ' })
  assert.equal(readNames(sfnt)[1], 'Pixel Font')
})

test('OS/2 tells which Unicode blocks are covered', () => {
  const { sfnt } = build([
    { char: 'a', ...pixelAt(3, 27) },
    { char: 'é', ...pixelAt(3, 27) },
    { char: '€', ...pixelAt(3, 27) }
  ])
  const at = sfnt.tables['OS/2'].offset + 42
  const [r1, r2] = [sfnt.view.getUint32(at), sfnt.view.getUint32(at + 4)]

  assert.equal(r1 & 0b11, 0b11) // Basic Latin and Latin-1
  assert.equal((r2 >>> 1) & 1, 1) // Currency symbols
  assert.equal((r1 >>> 31) & 1, 0) // No general punctuation
})

test('OS/2 first and last character index', () => {
  const { sfnt } = build([
    { char: 'a', ...pixelAt(3, 27) },
    { char: '€', ...pixelAt(3, 27) }
  ])
  const at = sfnt.tables['OS/2'].offset

  assert.equal(sfnt.view.getUint16(at + 64), 0x20)
  assert.equal(sfnt.view.getUint16(at + 66), 0x20ac)
})

test('the table list can be put in a file again', () => {
  const font = build([{ char: 'a', ...pixelAt(3, 27) }])
  const tables = font.tables.map((t) => {
    if (t.tag !== 'head') return t
    const data = t.data.slice()
    data.fill(0, 8, 12) // The checksum adjustment is calculated again
    return { ...t, data }
  })

  assert.deepEqual(assembleSfnt(tables).bytes, font.ttf)
})

test('a font with many glyphs keeps a consistent loca table', () => {
  const glyphs = [...'abcdefghij'].map((char, i) => ({ char, ...pixelAt(i, 27) }))
  const { sfnt, glyphCount } = build(glyphs)

  assert.equal(glyphCount, 12)

  let previous = 0
  for (let i = 0; i <= glyphCount; i++) {
    const offset = sfnt.view.getUint32(sfnt.tables.loca.offset + 4 * i)
    assert.ok(offset >= previous && offset % 4 === 0)
    previous = offset
  }

  assert.equal(previous, sfnt.tables.glyf.length)
})
