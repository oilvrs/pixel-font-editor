/**
 * Reads a UFO font, as the editor writes it, into pixel glyphs. Pure logic,
 * no DOM dependencies.
 *
 * Contours are filled: a cell becomes a pixel if its center is inside a contour.
 * That gives back exactly the pixels of a pixel glyph. Curves become pixels
 * as well, since the shapes of the editor are not recognized.
 *
 * Coordinates are in font units with y up and the baseline at y = 0. Rows are
 * counted from the top of the grid, and the baseline is on the row that
 * getMetrics() gives. Horizontally the ink is centered in the grid. The
 * sidebearings are read from the advance width and the ink: one that is the
 * same as the margin becomes automatic.
 *
 * @version 0.1.0
 */

import { UPM, getMetrics } from '../metrics.js'
import { glyphName } from './glyph-names.js'
import { ALL_GLYPHS } from './glyph-set.js'
import { createGrid, isEmpty } from './grid.js'
import { noSpacing } from './glyph.js'

const CURVE_STEPS = 24
const GLIF_FILE = /(^|\/)glyphs\/[^/]+\.glif$/i
const FONT_INFO = /(^|\/)fontinfo\.plist$/i
const CHARS = new Set(ALL_GLYPHS)

let charsByName = null

/**
 * @param {string} name - a glyph name, for example 'aring'
 * @returns {string|undefined} the character of the editor with that name
 */
function charForName(name) {
  if (!charsByName) charsByName = new Map(ALL_GLYPHS.map((char) => [glyphName(char), char]))
  return charsByName.get(name)
}

/**
 * Reads the attributes of an XML tag. Both quote styles work.
 * @param {string} tag - for example '<point x="1" y="2" type="line"/>'
 * @returns {Object} { x: '1', y: '2', type: 'line' }
 */
function readAttributes(tag) {
  const attributes = {}

  for (const match of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attributes[match[1]] = match[2] ?? match[3]
  }

  return attributes
}

/**
 * Reads a .glif file.
 * @param {string} text - the file content
 * @returns {Object} { name, advance, unicodes, contours, components }, where contours is a
 *   list of point lists [{ x, y, type }]. A point without a type is an off-curve point.
 */
export function parseGlif(text) {
  const glyphTag = /<glyph\b[^>]*>/.exec(text)
  const advanceTag = /<advance\b[^>]*>/.exec(text)
  const advance = advanceTag ? Number(readAttributes(advanceTag[0]).width) : NaN

  const unicodes = [...text.matchAll(/<unicode\b[^>]*>/g)]
    .map((match) => parseInt(readAttributes(match[0]).hex, 16))
    .filter(Number.isFinite)

  const outline = /<outline\b[^>]*>([\s\S]*?)<\/outline>/.exec(text)
  const contours = []

  if (outline) {
    for (const contour of outline[1].matchAll(/<contour\b[^>]*>([\s\S]*?)<\/contour>/g)) {
      contours.push(
        [...contour[1].matchAll(/<point\b[^>]*>/g)].map((match) => {
          const attributes = readAttributes(match[0])
          return {
            x: Number(attributes.x),
            y: Number(attributes.y),
            type: attributes.type || 'offcurve',
          }
        })
      )
    }
  }

  return {
    name: glyphTag ? readAttributes(glyphTag[0]).name : undefined,
    advance: Number.isFinite(advance) ? advance : undefined,
    unicodes,
    contours,
    components: (text.match(/<component\b/g) || []).length,
  }
}

/**
 * Adds a quadratic curve to a path, as short straight lines.
 * @param {number[][]} path
 * @param {number[]} from
 * @param {number[]} control
 * @param {number[]} to
 */
function addQuadratic(path, from, control, to) {
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS
    const u = 1 - t

    path.push([
      u * u * from[0] + 2 * u * t * control[0] + t * t * to[0],
      u * u * from[1] + 2 * u * t * control[1] + t * t * to[1],
    ])
  }
}

/**
 * Adds a cubic curve to a path, as short straight lines.
 * @param {number[][]} path
 * @param {number[]} from
 * @param {number[]} control1
 * @param {number[]} control2
 * @param {number[]} to
 */
function addCubic(path, from, control1, control2, to) {
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS
    const u = 1 - t

    path.push([
      u * u * u * from[0] +
        3 * u * u * t * control1[0] +
        3 * u * t * t * control2[0] +
        t * t * t * to[0],
      u * u * u * from[1] +
        3 * u * u * t * control1[1] +
        3 * u * t * t * control2[1] +
        t * t * t * to[1],
    ])
  }
}

/**
 * Turns a contour into a closed polygon: curves become short straight lines.
 * An open contour (one that starts with a move point) is dropped.
 * @param {Object[]} points - [{ x, y, type }] with type 'line', 'curve', 'qcurve', 'move' or 'offcurve'
 * @returns {number[][]} [[x, y], ...], or an empty list if there is nothing to fill
 */
export function flattenContour(points) {
  const count = points.length
  const start = points.findIndex((point) => point.type !== 'offcurve')

  if (count < 3 || start < 0 || points.some((point) => point.type === 'move')) return []

  const path = [[points[start].x, points[start].y]]
  let previous = [points[start].x, points[start].y]
  let pending = []

  // The walk ends on the start point again, which closes the contour.
  for (let step = 1; step <= count; step++) {
    const point = points[(start + step) % count]
    const to = [point.x, point.y]

    if (point.type === 'offcurve') {
      pending.push(to)
      continue
    }

    if (pending.length === 0) {
      path.push(to)
    } else if (point.type === 'qcurve') {
      // TrueType style: between two off-curve points there is an implied on-curve point.
      let from = previous

      pending.forEach((control, index) => {
        const next = pending[index + 1]
        const end = next ? [(control[0] + next[0]) / 2, (control[1] + next[1]) / 2] : to

        addQuadratic(path, from, control, end)
        from = end
      })
    } else if (pending.length === 1) {
      addQuadratic(path, previous, pending[0], to)
    } else if (pending.length >= 2) {
      addCubic(path, previous, pending[0], pending[1], to)
    }

    pending = []
    previous = to
  }

  const first = path[0]
  const last = path[path.length - 1]
  if (path.length > 1 && last[0] === first[0] && last[1] === first[1]) path.pop()

  return path
}

/**
 * Fills the cells whose center is inside the polygons, row by row (non-zero winding rule).
 * @param {Object} grid - { size, pixels }
 * @param {number[][][]} polygons
 * @param {Object} options
 * @param {number} options.upp - font units per cell
 * @param {number} options.originX - the x of the left edge of the grid, in font units
 * @param {number} options.baselineRow - the row boundary of the baseline, counted from the top
 */
function fillCells(grid, polygons, { upp, originX, baselineRow }) {
  const { size, pixels } = grid

  for (let row = 0; row < size; row++) {
    const y = (baselineRow - row - 0.5) * upp
    const crossings = []

    for (const polygon of polygons) {
      for (let i = 0; i < polygon.length; i++) {
        const [x0, y0] = polygon[i]
        const [x1, y1] = polygon[(i + 1) % polygon.length]

        if (y0 <= y !== y1 <= y) {
          crossings.push({
            x: x0 + ((y - y0) * (x1 - x0)) / (y1 - y0),
            direction: y1 > y0 ? 1 : -1,
          })
        }
      }
    }

    crossings.sort((a, b) => a.x - b.x)

    let winding = 0

    for (let i = 0; i < crossings.length - 1; i++) {
      winding += crossings[i].direction
      if (winding === 0) continue

      // A cell is inside if its center, x = originX + (col + 0.5) * upp, is between two crossings.
      const from = Math.max(0, Math.ceil((crossings[i].x - originX) / upp - 0.5))
      const to = Math.min(size, Math.ceil((crossings[i + 1].x - originX) / upp - 0.5))

      for (let col = from; col < to; col++) pixels[row * size + col] = 1
    }
  }
}

/**
 * Checks if the straight parts of a glyph sit on the grid: every point is a whole
 * number of cells from the left edge of the ink horizontally, and from the baseline vertically.
 * @param {Object[][]} contours
 * @param {number} minX - the left edge of the ink
 * @param {number} upp - font units per cell
 * @returns {boolean}
 */
function isOnGrid(contours, minX, upp) {
  const near = (value) => Math.abs(value - Math.round(value)) < 0.02

  return contours.every((points) =>
    points.every(
      (point) => point.type === 'offcurve' || (near((point.x - minX) / upp) && near(point.y / upp))
    )
  )
}

/**
 * Makes the pixels and the spacing of one glyph.
 * @param {Object} parsed - from parseGlif
 * @param {Object} options
 * @param {number} options.size - grid size
 * @param {number} options.margin - the automatic side margin, in cells
 * @param {number} [options.upm] - units per em of the font
 * @returns {Object} { grid, spacing, empty, curves, offGrid, clipped }
 */
export function rasterizeGlyph(parsed, { size, margin, upm = UPM }) {
  const upp = upm / size
  const contours = parsed.contours.filter((points) =>
    points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  )
  const polygons = contours.map(flattenContour).filter((polygon) => polygon.length >= 3)
  const grid = createGrid(size)
  const result = {
    grid,
    spacing: noSpacing(),
    empty: true,
    curves: false,
    offGrid: false,
    clipped: false,
  }

  if (polygons.length === 0) return result

  let minX = Infinity
  let maxX = -Infinity

  for (const polygon of polygons) {
    for (const [x] of polygon) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
    }
  }

  const curves = contours.some((points) =>
    points.some((p) => p.type === 'curve' || p.type === 'qcurve')
  )
  const widthCells = Math.max(1, Math.ceil((maxX - minX) / upp - 1e-6))
  const offset = widthCells >= size ? 0 : Math.floor((size - widthCells) / 2)

  fillCells(grid, polygons, {
    upp,
    originX: minX - offset * upp,
    baselineRow: getMetrics(size).baseline,
  })

  result.empty = isEmpty(grid)
  result.curves = curves
  result.clipped = widthCells > size
  result.offGrid = !curves && !isOnGrid(contours, minX, upp)

  if (parsed.advance !== undefined) {
    // A sidebearing that is the margin is automatic. Values are stored in units of 2048 per em.
    const marginUnits = margin * upp
    const scale = UPM / upm
    const side = (value) => (Math.abs(value - marginUnits) < 1 ? null : Math.round(value * scale))

    result.spacing = { left: side(minX), right: side(parsed.advance - maxX) }
  }

  return result
}

/**
 * Whether a file in a zip may be a part of the font. Folders that macOS adds
 * (__MACOSX and files that start with ._) are left out.
 * @param {string} name - the path in the zip
 * @returns {boolean}
 */
export function isUfoEntry(name) {
  const path = String(name).replace(/\\/g, '/')
  if (path.split('/').some((part) => part === '__MACOSX' || part.startsWith('._'))) return false

  return GLIF_FILE.test(path) || FONT_INFO.test(path)
}

/**
 * Reads a number from a property list.
 * @param {string} text
 * @param {string} key
 * @returns {number|undefined}
 */
function readPlistNumber(text, key) {
  const match = new RegExp(`<key>${key}</key>\\s*<(?:integer|real)>([^<]+)<`).exec(text)
  const value = match ? Number(match[1]) : NaN
  return Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * Reads a string from a property list.
 * @param {string} text
 * @param {string} key
 * @returns {string|undefined}
 */
function readPlistString(text, key) {
  const match = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(text)

  return match
    ? match[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
    : undefined
}

/**
 * Reads the glyphs of a UFO font.
 * @param {Object[]} entries - [{ name, data }] the files of a zip, data as bytes
 * @param {Object} options
 * @param {number} options.size - the grid size of the project
 * @param {number} options.margin - the automatic side margin of the project, in cells
 * @returns {Object} { glyphs: [{ char, grid, spacing }], familyName, upm, stats }, where stats is
 *   { total, curves, offGrid, clipped, unknown }
 * @throws {Error} if there is no UFO in the files, or no glyph the editor can use
 */
export function importUfo(entries, { size, margin }) {
  const decoder = new TextDecoder()
  const files = entries
    .map((entry) => ({ path: String(entry.name).replace(/\\/g, '/'), data: entry.data }))
    .filter((file) => isUfoEntry(file.path))
  const glifs = files
    .filter((file) => GLIF_FILE.test(file.path))
    .sort((a, b) => a.path.localeCompare(b.path))

  if (glifs.length === 0) {
    throw new Error('no glyphs found. The file should be a zipped .ufo folder')
  }

  // Only the first font is read, if the zip has several.
  const match = GLIF_FILE.exec(glifs[0].path)
  const prefix = glifs[0].path.slice(0, match.index + match[1].length)
  const info = files.find((file) => file.path === `${prefix}fontinfo.plist`)
  const infoText = info ? decoder.decode(info.data) : ''
  const upm = readPlistNumber(infoText, 'unitsPerEm') || UPM

  const found = new Map()
  const stats = { total: 0, curves: 0, offGrid: 0, clipped: 0, unknown: 0 }

  for (const file of glifs.filter((glif) => glif.path.startsWith(prefix))) {
    const parsed = parseGlif(decoder.decode(file.data))
    if (parsed.contours.length === 0) continue // For example space

    const glyph = rasterizeGlyph(parsed, { size, margin, upm })
    if (glyph.empty) continue

    const char =
      parsed.unicodes.map((code) => String.fromCodePoint(code)).find((c) => CHARS.has(c)) ||
      charForName(parsed.name)

    if (!char) {
      stats.unknown++
      continue
    }

    found.set(char, { char, grid: glyph.grid, spacing: glyph.spacing })
    if (glyph.curves) stats.curves++
    if (glyph.offGrid) stats.offGrid++
    if (glyph.clipped) stats.clipped++
  }

  const glyphs = ALL_GLYPHS.filter((char) => found.has(char)).map((char) => found.get(char))
  stats.total = glyphs.length

  if (glyphs.length === 0) {
    throw new Error('no glyphs found that the editor can use')
  }

  return { glyphs, familyName: readPlistString(infoText, 'familyName'), upm, stats }
}

/**
 * Describes what cannot be imported exactly, so that the user can decide.
 * @param {Object} stats - from importUfo
 * @param {number} size - the grid size of the project
 * @returns {string[]} one line for each problem, empty if everything is exact
 */
export function summarizeImport(stats, size) {
  const glyphs = (count) => `${count} glyph${count === 1 ? '' : 's'}`
  const lines = []

  if (stats.curves > 0) lines.push(`${glyphs(stats.curves)} with curves: the curves become pixels.`)
  if (stats.offGrid > 0) {
    lines.push(`${glyphs(stats.offGrid)} not drawn on a ${size}×${size} grid: approximated.`)
  }
  if (stats.clipped > 0) lines.push(`${glyphs(stats.clipped)} wider than the grid: cut off.`)
  if (stats.unknown > 0) lines.push(`${glyphs(stats.unknown)} outside the character set: skipped.`)

  return lines
}
