/**
 * A glyph is its pixels and its shapes: { grid, shapes }.
 * Pure logic, no DOM dependencies.
 *
 * @version 0.1.0
 */

import { isEmpty, serializeGrid, deserializeGrid } from './grid.js'
import { SHAPE_TYPES, shapeBounds } from './shapes.js'

export const MAX_SHAPES = 500

/**
 * The rectangle of cells that contain pixels.
 * @param {Object} grid
 * @returns {Object|null} { minX, minY, maxX, maxY } (inclusive), or null if the grid is empty
 */
export function inkBounds(grid) {
  let minX = grid.size
  let minY = grid.size
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      if (!grid.pixels[y * grid.size + x]) continue

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  return maxX < 0 ? null : { minX, minY, maxX, maxY }
}

/**
 * Accepts either a glyph or a plain grid and returns a glyph.
 * @param {Object|null} value
 * @returns {Object|null} { grid, shapes }
 */
export function asGlyph(value) {
  if (!value) return null
  return value.grid ? { grid: value.grid, shapes: value.shapes || [] } : { grid: value, shapes: [] }
}

/**
 * Checks if a glyph has neither pixels nor shapes.
 * @param {Object} glyph - { grid, shapes }
 * @returns {boolean}
 */
export function glyphIsEmpty(glyph) {
  return isEmpty(glyph.grid) && (!glyph.shapes || glyph.shapes.length === 0)
}

/**
 * The left and right edge of everything in a glyph, in cells. Pixels count
 * with their full cell, shapes with their outline.
 * @param {Object} glyph - { grid, shapes }
 * @returns {Object|null} { left, right }, or null if the glyph is empty
 */
export function glyphBounds(glyph) {
  const pixels = inkBounds(glyph.grid)
  let left = pixels ? pixels.minX : Infinity
  let right = pixels ? pixels.maxX + 1 : -Infinity

  for (const shape of glyph.shapes || []) {
    const bounds = shapeBounds(shape)
    left = Math.min(left, bounds.minX)
    right = Math.max(right, bounds.maxX)
  }

  return left === Infinity ? null : { left, right }
}

/**
 * Copies a list of shapes.
 * @param {Object[]} shapes
 * @returns {Object[]}
 */
export function cloneShapes(shapes) {
  return (shapes || []).map((shape) => ({ ...shape }))
}

/**
 * Checks a list of shapes from saved data. Invalid shapes are dropped.
 * @param {*} list
 * @returns {Object[]}
 */
export function sanitizeShapes(list) {
  if (!Array.isArray(list)) return []

  return list
    .slice(0, MAX_SHAPES)
    .filter(
      (s) =>
        s &&
        SHAPE_TYPES.includes(s.type) &&
        [s.cx, s.cy, s.w, s.h, s.angle].every(Number.isFinite) &&
        Math.abs(s.w) >= 1 &&
        Math.abs(s.h) >= 1
    )
    .map((s) => ({ type: s.type, cx: s.cx, cy: s.cy, w: s.w, h: s.h, angle: s.angle }))
}

/**
 * Makes a JSON-friendly object of a glyph. Shapes are left out when there are none.
 * @param {Object} glyph - { grid, shapes }
 * @returns {Object} { size, bits, shapes? }
 */
export function serializeGlyph(glyph) {
  const data = serializeGrid(glyph.grid)
  if (glyph.shapes && glyph.shapes.length > 0) data.shapes = cloneShapes(glyph.shapes)
  return data
}

/**
 * Restores a glyph from the object made by serializeGlyph. Data without
 * shapes (saved by an older version) gives a glyph without shapes.
 * @param {Object} data
 * @returns {Object} { grid, shapes }
 * @throws {Error} if the pixel data is damaged
 */
export function deserializeGlyph(data) {
  return { grid: deserializeGrid(data), shapes: sanitizeShapes(data.shapes) }
}
