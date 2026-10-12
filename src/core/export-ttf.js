/**
 * TrueType font export. Builds a .ttf (an sfnt file with TrueType outlines)
 * from the drawn glyphs of one grid size.
 * Pure logic, no DOM dependencies.
 *
 * - Units: UPM 2048, y upwards, y = 0 on the baseline. The metrics are the
 *   same as the guides in the editor: ascender 1792, descender -256.
 * - Spacing: where a glyph is drawn horizontally does not matter. Its left
 *   edge is moved to the left sidebearing and its advance width is the same
 *   as in the SVG and UFO exports.
 * - Outlines: pixel contours are straight lines. Shapes have cubic curves,
 *   which are converted to quadratic ones (within half a font unit). Outer
 *   contours run clockwise and holes counter-clockwise, as TrueType wants.
 *   Contours of pixels and shapes overlap each other, which the nonzero fill
 *   rule of TrueType merges.
 * - Glyphs: .notdef, space and every drawn glyph. No hinting, kerning or
 *   OpenType features.
 * - Tables: OS/2, cmap, glyf, head, hhea, hmtx, loca, maxp, name, post.
 *
 * @version 0.1.0
 */

import { traceGrid } from './trace.js'
import { shapeContour } from './shapes.js'
import { effectiveSpacing } from './spacing.js'
import { cubicToQuads } from './quad.js'
import { Writer, checksum } from './binary.js'
import { glyphName } from './glyph-names.js'
import { spaceWidth } from './layout.js'
import { getMetrics, unitsPerPixel, UPM } from '../metrics.js'

const CURVE_TOLERANCE = 0.5 // Largest distance, in font units, between a curve and its quadratic version
const SECONDS_1904_TO_1970 = 2082844800
const NOT_DEF_ADVANCE = 1024

// Blocks of Unicode that the glyph set uses, with their bit in the OS/2 table.
const UNICODE_BLOCKS = [
  [0x0000, 0x007f, 0], // Basic Latin
  [0x0080, 0x00ff, 1], // Latin-1 Supplement
  [0x2000, 0x206f, 31], // General Punctuation
  [0x20a0, 0x20cf, 33] // Currency Symbols
]

/**
 * Limits a coordinate to the range of a 16-bit number.
 * @param {number} value
 * @returns {number}
 */
function int16(value) {
  return Math.min(Math.max(Math.round(value), -32768), 32767)
}

/**
 * Turns the outline of a shape into points: on-curve points, and off-curve
 * control points for the curves.
 * @param {Object} contour - from shapeContour, in grid coordinates
 * @param {Function} toX - converts a grid x to font units
 * @param {Function} toY - converts a grid y to font units
 * @returns {Object[]} [{ x, y, on }]
 */
function shapePoints(contour, toX, toY) {
  const map = (p) => ({ x: toX(p.x), y: toY(p.y) })
  const points = []
  let from = map(contour.start)

  points.push({ ...from, on: true })

  for (const segment of contour.segments) {
    const to = map(segment.to)

    if (segment.c1) {
      for (const quad of cubicToQuads(from, map(segment.c1), map(segment.c2), to, CURVE_TOLERANCE)) {
        points.push({ ...quad.control, on: false }, { ...quad.to, on: true })
      }
    } else {
      points.push({ ...to, on: true })
    }

    from = to
  }

  points.pop() // The last point is the start again

  return points.map((p) => ({ x: int16(p.x), y: int16(p.y), on: p.on }))
}

/**
 * The outline and advance width of a glyph.
 * @param {Object} glyph - { grid, shapes, spacing }
 * @param {number} size - grid size
 * @param {number} margin - automatic side margin in pixels
 * @returns {Object} { contours: [[{ x, y, on }]], advance }
 */
export function outlineGlyph({ grid, shapes = [], spacing = null }, size, margin) {
  const info = effectiveSpacing({ grid, shapes, spacing }, size, margin)
  const unit = unitsPerPixel(size)
  const baseline = getMetrics(size).baseline
  const offsetX = info.left - info.bounds.left * unit // Puts the left edge of the glyph at the left sidebearing

  const toX = (px) => px * unit + offsetX
  const toY = (py) => (baseline - py) * unit

  const contours = traceGrid(grid).map((contour) =>
    contour.points.map((p) => ({ x: int16(toX(p.x)), y: int16(toY(p.y)), on: true }))
  )

  for (const shape of shapes) contours.push(shapePoints(shapeContour(shape), toX, toY))

  return { contours, advance: Math.min(Math.max(info.width, 0), 65535) }
}

/**
 * A simple box for the missing glyph.
 * @returns {Object} { contours, advance }
 */
function notdefOutline() {
  return {
    advance: NOT_DEF_ADVANCE,
    contours: [
      [
        { x: 128, y: 0, on: true },
        { x: 128, y: 1536, on: true },
        { x: 896, y: 1536, on: true },
        { x: 896, y: 0, on: true }
      ],
      [
        { x: 256, y: 128, on: true },
        { x: 768, y: 128, on: true },
        { x: 768, y: 1408, on: true },
        { x: 256, y: 1408, on: true }
      ]
    ]
  }
}

/**
 * Encodes one simple glyph for the glyf table.
 * @param {Object[][]} contours
 * @returns {Object} { data: Uint8Array, xMin, yMin, xMax, yMax, points, contours }
 */
function encodeGlyph(contours) {
  if (contours.length === 0) {
    return { data: new Uint8Array(0), xMin: 0, yMin: 0, xMax: 0, yMax: 0, points: 0, contours: 0 }
  }

  const points = contours.flat()
  const xMin = Math.min(...points.map((p) => p.x))
  const yMin = Math.min(...points.map((p) => p.y))
  const xMax = Math.max(...points.map((p) => p.x))
  const yMax = Math.max(...points.map((p) => p.y))

  const w = new Writer()
  w.i16(contours.length).i16(xMin).i16(yMin).i16(xMax).i16(yMax)

  let end = -1
  for (const contour of contours) {
    end += contour.length
    w.u16(end)
  }

  w.u16(0) // No instructions

  const flags = []
  const xData = []
  const yData = []
  let previousX = 0
  let previousY = 0

  for (const p of points) {
    const dx = p.x - previousX
    const dy = p.y - previousY
    let flag = p.on ? 0x01 : 0

    if (dx === 0) {
      flag |= 0x10 // Same x as before, no data
    } else if (Math.abs(dx) <= 255) {
      flag |= 0x02 | (dx > 0 ? 0x10 : 0)
      xData.push({ short: true, value: Math.abs(dx) })
    } else {
      xData.push({ short: false, value: dx })
    }

    if (dy === 0) {
      flag |= 0x20
    } else if (Math.abs(dy) <= 255) {
      flag |= 0x04 | (dy > 0 ? 0x20 : 0)
      yData.push({ short: true, value: Math.abs(dy) })
    } else {
      yData.push({ short: false, value: dy })
    }

    flags.push(flag)
    previousX = p.x
    previousY = p.y
  }

  flags[0] |= 0x40 // The contours may overlap, so rasterizers use the nonzero rule

  for (let i = 0; i < flags.length; ) {
    let run = 1
    while (i + run < flags.length && flags[i + run] === flags[i] && run < 256) run++

    if (run > 1) w.u8(flags[i] | 0x08).u8(run - 1)
    else w.u8(flags[i])

    i += run
  }

  for (const data of [xData, yData]) {
    for (const { short, value } of data) {
      if (short) w.u8(value)
      else w.i16(value)
    }
  }

  w.pad(4)

  return { data: w.toBytes(), xMin, yMin, xMax, yMax, points: points.length, contours: contours.length }
}

/**
 * The bits of the OS/2 table that tell which Unicode blocks a font covers.
 * @param {number[]} codes - code points
 * @returns {number[]} four 32-bit values
 */
function unicodeRanges(codes) {
  const ranges = [0, 0, 0, 0]

  for (const [start, end, bit] of UNICODE_BLOCKS) {
    if (codes.some((code) => code >= start && code <= end)) {
      ranges[bit >> 5] = (ranges[bit >> 5] | (1 << (bit & 31))) >>> 0
    }
  }

  return ranges
}

/**
 * Makes a cmap table (format 4) that maps code points to glyph numbers.
 * Runs of consecutive code points with consecutive glyphs share a segment.
 * @param {Object[]} entries - [{ code, gid }], code points up to 0xFFFF
 * @returns {Uint8Array}
 */
function cmapTable(entries) {
  const sorted = [...entries].sort((a, b) => a.code - b.code)
  const segments = []

  for (const { code, gid } of sorted) {
    const last = segments[segments.length - 1]

    if (last && code === last.end + 1 && gid === last.gid + (code - last.start)) last.end = code
    else segments.push({ start: code, end: code, gid })
  }

  segments.push({ start: 0xffff, end: 0xffff, gid: 0, final: true })

  const count = segments.length
  const entrySelector = Math.floor(Math.log2(count))
  const searchRange = 2 * 2 ** entrySelector

  const w = new Writer()
  w.u16(0).u16(2) // Version, two encodings
  w.u16(0).u16(3).u32(20) // Unicode, BMP
  w.u16(3).u16(1).u32(20) // Windows, Unicode BMP

  w.u16(4).u16(16 + 8 * count).u16(0)
  w.u16(count * 2).u16(searchRange).u16(entrySelector).u16(count * 2 - searchRange)

  for (const s of segments) w.u16(s.end)
  w.u16(0)
  for (const s of segments) w.u16(s.start)
  for (const s of segments) w.u16(s.final ? 1 : (s.gid - s.start) & 0xffff)
  for (let i = 0; i < count; i++) w.u16(0)

  return w.toBytes()
}

/**
 * Makes a name table with Windows (Unicode) names.
 * @param {Object[]} names - [{ id, text }]
 * @returns {Uint8Array}
 */
function nameTable(names) {
  const sorted = [...names].sort((a, b) => a.id - b.id)
  const strings = sorted.map(({ text }) => {
    const data = new Writer()
    for (let i = 0; i < text.length; i++) data.u16(text.charCodeAt(i))
    return data.toBytes()
  })

  const w = new Writer()
  w.u16(0).u16(sorted.length).u16(6 + 12 * sorted.length)

  let offset = 0
  sorted.forEach(({ id }, i) => {
    w.u16(3).u16(1).u16(0x0409).u16(id).u16(strings[i].length).u16(offset)
    offset += strings[i].length
  })

  for (const data of strings) w.raw(data)

  return w.toBytes()
}

/**
 * A name that is allowed as a PostScript name: ASCII letters and digits.
 * @param {string} familyName
 * @returns {string}
 */
function postScriptName(familyName) {
  const cleaned = familyName.replace(/[^A-Za-z0-9]/g, '')
  return `${cleaned.slice(0, 40) || 'PixelFont'}-Regular`
}

/**
 * Builds a font from drawn glyphs.
 * @param {Object[]} glyphs - [{ char, grid, shapes, spacing }], only glyphs that have a drawing
 * @param {Object} options
 * @param {string} options.familyName
 * @param {number} options.size - grid size
 * @param {number} options.margin - automatic side margin in pixels
 * @param {number} options.lineGap - extra space between lines, in font units (0 by default)
 * @param {string} options.version - version text, for example '1.000'
 * @param {Date} options.date - creation date
 * @returns {Object} { ttf: Uint8Array, tables: [{ tag, data, checksum }], glyphCount }, where tables
 *   are the tables in file order and can be reused for other containers such as WOFF
 */
export function buildFont(glyphs, { familyName, size, margin, lineGap = 0, version = '1.000', date = new Date() }) {
  const unit = unitsPerPixel(size)
  const metrics = getMetrics(size)
  const baseline = metrics.baseline
  const units = (row) => (baseline - row) * unit

  const ascender = units(metrics.ascender)
  const descender = units(metrics.descender)
  const family = (familyName || '').trim() || 'Pixel Font'

  // The glyphs in glyph number order: .notdef, space, then every drawn glyph.
  const list = [
    { name: '.notdef', code: null, ...notdefOutline() },
    { name: 'space', code: 0x20, advance: Math.min(spaceWidth(size) * unit, 65535), contours: [] }
  ]

  for (const glyph of glyphs) {
    const code = glyph.char.codePointAt(0)
    if (code > 0xffff) continue // The cmap table used here covers the BMP only

    list.push({ name: glyphName(glyph.char), code, ...outlineGlyph(glyph, size, margin) })
  }

  const encoded = list.map((g) => encodeGlyph(g.contours))
  const count = list.length

  // glyf and loca
  const glyf = new Writer()
  const loca = new Writer()
  encoded.forEach((e) => {
    loca.u32(glyf.length)
    glyf.raw(e.data)
  })
  loca.u32(glyf.length)

  // hmtx
  const hmtx = new Writer()
  list.forEach((g, i) => hmtx.u16(g.advance).i16(encoded[i].xMin))

  // Extents for head and hhea
  const filled = encoded.filter((e) => e.contours > 0)
  const xMin = Math.min(...filled.map((e) => e.xMin))
  const yMin = Math.min(...filled.map((e) => e.yMin))
  const xMax = Math.max(...filled.map((e) => e.xMax))
  const yMax = Math.max(...filled.map((e) => e.yMax))
  const advanceMax = Math.max(...list.map((g) => g.advance))
  const minRsb = Math.min(...filled.map((e) => list[encoded.indexOf(e)].advance - e.xMax))

  const seconds = Math.floor(date.getTime() / 1000) + SECONDS_1904_TO_1970

  const head = new Writer()
  head.u16(1).u16(0).u32(0x00010000).u32(0).u32(0x5f0f3cf5)
  head.u16(0x0003).u16(UPM).i64(seconds).i64(seconds)
  head.i16(xMin).i16(yMin).i16(xMax).i16(yMax)
  head.u16(0).u16(8).i16(2).i16(1).i16(0)

  const hhea = new Writer()
  hhea.u32(0x00010000).i16(ascender).i16(descender).i16(lineGap)
  hhea.u16(advanceMax).i16(Math.min(...filled.map((e) => e.xMin))).i16(minRsb).i16(xMax)
  hhea.i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(count)

  const maxp = new Writer()
  maxp.u32(0x00010000).u16(count)
  maxp.u16(Math.max(...encoded.map((e) => e.points))).u16(Math.max(...encoded.map((e) => e.contours)))
  maxp.u16(0).u16(0).u16(1).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0)

  // OS/2 (version 4)
  const codes = list.filter((g) => g.code !== null).map((g) => g.code)
  const ranges = unicodeRanges(codes)
  const averageWidth = Math.round(list.reduce((sum, g) => sum + g.advance, 0) / count)

  const os2 = new Writer()
  os2.u16(4).i16(averageWidth).u16(400).u16(5).u16(0)
  os2.i16(1331).i16(1229).i16(0).i16(154) // Subscript size and offset
  os2.i16(1331).i16(1229).i16(0).i16(717) // Superscript size and offset
  os2.i16(128).i16(640) // Strikeout size and position
  os2.i16(0)
  for (let i = 0; i < 10; i++) os2.u8(0) // PANOSE
  for (const range of ranges) os2.u32(range)
  os2.tag('NONE')
  os2.u16(0x00c0) // Regular, and use the typographic metrics
  os2.u16(Math.min(...codes)).u16(Math.max(...codes))
  os2.i16(ascender).i16(descender).i16(lineGap)
  os2.u16(Math.max(ascender, yMax)).u16(Math.max(-descender, -yMin))
  os2.u32(0x00000001).u32(0) // Code pages: Latin 1
  os2.i16(units(metrics.xHeight)).i16(units(metrics.capHeight))
  os2.u16(0).u16(0x20).u16(0)

  // cmap: every code point to its glyph, and a no-break space that looks like space
  const cmapEntries = list.map((g, gid) => ({ code: g.code, gid })).filter((e) => e.code !== null)
  cmapEntries.push({ code: 0xa0, gid: 1 })

  const dateText = date.toISOString().slice(0, 10).replace(/-/g, '')
  const name = nameTable([
    { id: 1, text: family },
    { id: 2, text: 'Regular' },
    { id: 3, text: `${family}:${version}:${dateText}` },
    { id: 4, text: family },
    { id: 5, text: `Version ${version}` },
    { id: 6, text: postScriptName(family) }
  ])

  // post (format 2, with glyph names)
  const post = new Writer()
  post.u32(0x00020000).u32(0).i16(-256).i16(128).u32(0).u32(0).u32(0).u32(0).u32(0)
  post.u16(count)
  list.forEach((g, i) => post.u16(i === 0 ? 0 : 258 + i - 1))
  list.slice(1).forEach((g) => {
    post.u8(g.name.length)
    for (let i = 0; i < g.name.length; i++) post.u8(g.name.charCodeAt(i))
  })

  const tables = [
    { tag: 'OS/2', data: os2.toBytes() },
    { tag: 'cmap', data: cmapTable(cmapEntries) },
    { tag: 'glyf', data: glyf.toBytes() },
    { tag: 'head', data: head.toBytes() },
    { tag: 'hhea', data: hhea.toBytes() },
    { tag: 'hmtx', data: hmtx.toBytes() },
    { tag: 'loca', data: loca.toBytes() },
    { tag: 'maxp', data: maxp.toBytes() },
    { tag: 'name', data: name },
    { tag: 'post', data: post.toBytes() }
  ]

  const assembled = assembleSfnt(tables)
  return { ttf: assembled.bytes, tables: assembled.tables, glyphCount: count }
}

/**
 * Puts tables in an sfnt file: the table directory, the tables padded to
 * whole words, and the checksum adjustment in the head table.
 * @param {Object[]} tables - [{ tag, data }], with the checksum adjustment of the head table set to zero
 * @param {number} flavor - 0x00010000 for TrueType outlines
 * @returns {Object} { bytes, tables: [{ tag, data, checksum }] } with the head table updated
 */
export function assembleSfnt(tables, flavor = 0x00010000) {
  const sorted = [...tables].sort((a, b) => (a.tag < b.tag ? -1 : 1))
  const count = sorted.length
  const entrySelector = Math.floor(Math.log2(count))
  const searchRange = 16 * 2 ** entrySelector
  const rangeShift = 16 * count - searchRange

  let offset = 12 + 16 * count
  const records = sorted.map((table) => {
    const record = { tag: table.tag, data: table.data, offset, checksum: checksum(table.data) }
    offset += Math.ceil(table.data.length / 4) * 4
    return record
  })

  const bytes = new Uint8Array(offset)
  const view = new DataView(bytes.buffer)

  view.setUint32(0, flavor)
  view.setUint16(4, count)
  view.setUint16(6, searchRange)
  view.setUint16(8, entrySelector)
  view.setUint16(10, rangeShift)

  records.forEach((record, i) => {
    const at = 12 + 16 * i
    for (let k = 0; k < 4; k++) bytes[at + k] = record.tag.charCodeAt(k)
    view.setUint32(at + 4, record.checksum)
    view.setUint32(at + 8, record.offset)
    view.setUint32(at + 12, record.data.length)
    bytes.set(record.data, record.offset)
  })

  const head = records.find((record) => record.tag === 'head')
  view.setUint32(head.offset + 8, (0xb1b0afba - checksum(bytes)) >>> 0)

  const fixedHead = bytes.slice(head.offset, head.offset + head.data.length)

  return {
    bytes,
    tables: records.map((record) => ({
      tag: record.tag,
      data: record.tag === 'head' ? fixedHead : record.data,
      checksum: record.checksum
    }))
  }
}
