/**
 * UFO export of a whole font (UFO 3, the format Glyphs opens directly).
 * Pure logic, no DOM dependencies.
 *
 * A UFO is a folder of XML files. This module returns the files, and the
 * caller packs them in a ZIP, since a browser cannot write a folder.
 * Shapes are written as curves (cubic Bézier), with smooth points for ellipses.
 * Horizontal position follows the spacing of the glyph: the left sidebearing, 
 * the width of pixels and shapes, and the right sidebearing. Sides without a value
 * of their own use the margin.
 *
 * Glyph rules are the same as the SVG export: where a letter is drawn
 * horizontally does not matter, the ink is moved so its left edge is
 * `margin` pixels from x = 0, and the advance width is the ink width plus
 * `margin` on both sides. Coordinates are in font units with y upwards and
 * y = 0 on the baseline. Contours are counter-clockwise for outer shapes
 * and clockwise for holes.
 *
 * @version 0.1.0
 */

import { traceGrid } from './trace.js'
import { effectiveSpacing } from './spacing.js'
import { shapeContour, reverseContour } from './shapes.js'
import { glyphName, exportFileName } from './glyph-names.js'
import { spaceWidth } from './layout.js'
import { getMetrics, unitsPerPixel, UPM } from '../metrics.js'

const PLIST_HEAD =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
  '<plist version="1.0">\n'

/**
 * Escapes text for use in XML.
 * @param {string} text
 * @returns {string}
 */
function xml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Turns a font name into something safe to use as a file or folder name.
 * @param {string} name
 * @returns {string}
 */
export function safeFileName(name) {
  const cleaned = String(name)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .trim()
    .replace(/^\.+/, '')

  return cleaned || 'Pixel Font'
}

const str = (text) => `<string>${xml(text)}</string>`
const int = (number) => `<integer>${number}</integer>`

const plist = (body) => `${PLIST_HEAD}${body}\n</plist>\n`

const dict = (pairs) =>
  `<dict>\n${pairs.map(([key, value]) => `\t<key>${xml(key)}</key>\n\t${value}`).join('\n')}\n</dict>`

const array = (items) => `<array>\n${items.map((item) => `\t\t${item}`).join('\n')}\n\t</array>`

/**
 * Unicode value of a character, as four or more uppercase hex digits.
 * @param {string} char
 * @returns {string}
 */
function unicodeHex(char) {
  return char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Writes one .glif file.
 * @param {Object} glyph - { name, advance, char, contours } where contours are lists of
 *   { x, y, type, smooth } in font units. type is 'line', 'curve' or null for a control point.
 * @returns {string}
 */
function glif({ name, advance, char, contours = [] }) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<glyph name="${xml(name)}" format="2">`,
    `  <advance width="${advance}"/>`,
    `  <unicode hex="${unicodeHex(char)}"/>`,
  ]

  if (contours.length > 0) {
    lines.push('  <outline>')

    for (const points of contours) {
      lines.push('    <contour>')

      for (const { x, y, type, smooth } of points) {
        const typeAttribute = type ? ` type="${type}"` : ''
        const smoothAttribute = smooth ? ' smooth="yes"' : ''
        lines.push(`      <point x="${x}" y="${y}"${typeAttribute}${smoothAttribute}/>`)
      }

      lines.push('    </contour>')
    }

    lines.push('  </outline>')
  }

  lines.push('</glyph>', '')
  return lines.join('\n')
}

/**
 * Turns a shape into the points of a UFO contour: line points, and for a
 * curve two control points followed by the curve point. The contour starts
 * at an on-curve point.
 * @param {Object} shape
 * @param {Function} toX
 * @param {Function} toY
 * @returns {Object[]} [{ x, y, type, smooth }]
 */
function shapePoints(shape, toX, toY) {
  const contour = reverseContour(shapeContour(shape))
  const points = []

  for (const segment of contour.segments) {
    if (segment.c1) {
      points.push(
        { x: toX(segment.c1.x), y: toY(segment.c1.y), type: null },
        { x: toX(segment.c2.x), y: toY(segment.c2.y), type: null },
        { x: toX(segment.to.x), y: toY(segment.to.y), type: 'curve', smooth: contour.smooth }
      )
    } else {
      points.push({ x: toX(segment.to.x), y: toY(segment.to.y), type: 'line' })
    }
  }

  points.unshift(points.pop()) // The last point is the start of the contour, so it goes first
  return points
}

/**
 * Builds the files of a UFO.
 * @param {Object[]} glyphs - [{ char, grid, shapes, spacing }]
 * @param {Object} options
 * @param {string} options.familyName
 * @param {number} options.size - grid size
 * @param {number} options.margin - side margin in pixels
 * @returns {Object} { folderName, files: [{ name, data }] } where names include the folder
 */
export function buildUfo(glyphs, { familyName, size, margin }) {
  const unit = unitsPerPixel(size)
  const metrics = getMetrics(size)
  const baseline = metrics.baseline
  const units = (row) => (baseline - row) * unit // A row boundary as a height above the baseline
  const folderName = `${safeFileName(familyName)}.ufo`

  const entries = glyphs.map(({ char, grid, shapes = [], spacing = null }) => {
    const info = effectiveSpacing({ grid, shapes, spacing }, size, margin)
    const offsetX = info.left - info.bounds.left * unit // Puts the left edge of the glyph at the left sidebearing

    const toX = (px) => Math.round(px * unit + offsetX)
    const toY = (py) => Math.round(units(py))

    const contours = traceGrid(grid).map((contour) =>
      contour.points
        .slice()
        .reverse()
        .map((p) => ({ x: toX(p.x), y: toY(p.y), type: 'line' }))
    )

    for (const shape of shapes) contours.push(shapePoints(shape, toX, toY))

    const name = glyphName(char)
    return { name, file: exportFileName(name, 'glif'), text: glif({ name, advance: info.width, char, contours }) }
  })

  entries.unshift({
    name: 'space',
    file: 'space.glif',
    text: glif({ name: 'space', advance: spaceWidth(size) * unit, char: ' ' }),
  })

  const files = [
    {
      name: 'metainfo.plist',
      data: plist(
        dict([
          ['creator', str('pixel-glyph-editor')],
          ['formatVersion', int(3)],
        ])
      ),
    },
    {
      name: 'fontinfo.plist',
      data: plist(
        dict([
          ['ascender', int(units(metrics.ascender))],
          ['capHeight', int(units(metrics.capHeight))],
          ['descender', int(units(metrics.descender))],
          ['familyName', str(familyName)],
          ['styleName', str('Regular')],
          ['unitsPerEm', int(UPM)],
          ['versionMajor', int(1)],
          ['versionMinor', int(0)],
          ['xHeight', int(units(metrics.xHeight))],
        ])
      ),
    },
    {
      name: 'layercontents.plist',
      data: plist(
        '<array>\n\t<array>\n\t\t<string>public.default</string>\n\t\t<string>glyphs</string>\n\t</array>\n</array>'
      ),
    },
    {
      name: 'lib.plist',
      data: plist(dict([['public.glyphOrder', array(entries.map((e) => str(e.name)))]])),
    },
    { name: 'glyphs/contents.plist', data: plist(dict(entries.map((e) => [e.name, str(e.file)]))) },
    ...entries.map((e) => ({ name: `glyphs/${e.file}`, data: e.text })),
  ]

  return {
    folderName,
    files: files.map((file) => ({ name: `${folderName}/${file.name}`, data: file.data })),
  }
}
