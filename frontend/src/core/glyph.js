/**
 * A glyph is its pixels, its shapes and its spacing: { grid, shapes, spacing }.
 * Pure logic, no DOM dependencies.
 *
 * Spacing is { left, right }: the left and right sidebearing in font units.
 * A side that is null is automatic and follows the side margin setting.
 *
 * @version 0.2.0
 */

import { isEmpty, serializeGrid, deserializeGrid } from './grid.js'
import { SHAPE_TYPES, shapeBounds } from './shapes.js'

export const MAX_SHAPES = 500

const MIN_SPACING = -4096
const MAX_SPACING = 8192

/**
 * Spacing with both sides automatic.
 * @returns {Object} { left: null, right: null }
 */
export function noSpacing() {
  return { left: null, right: null }
}

/**
 * Copies spacing. Missing values become automatic.
 * @param {Object|null} spacing
 * @returns {Object} { left, right }
 */
export function cloneSpacing(spacing) {
  return {
    left: spacing && spacing.left !== undefined ? spacing.left : null,
    right: spacing && spacing.right !== undefined ? spacing.right : null
  }
}

/**
 * Checks spacing from saved data. Values become whole numbers within
 * limits, and anything that is not a number becomes automatic.
 * @param {*} value
 * @returns {Object} { left, right }
 */
export function sanitizeSpacing(value) {
  if (!value || typeof value !== 'object') return noSpacing()

  const clean = (side) => (Number.isFinite(side) ? Math.min(Math.max(Math.round(side), MIN_SPACING), MAX_SPACING) : null)
  return { left: clean(value.left), right: clean(value.right) }
}

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
 * @returns {Object|null} { grid, shapes, spacing }
 */
export function asGlyph(value) {
  if (!value) return null

  return value.grid
    ? { grid: value.grid, shapes: value.shapes || [], spacing: cloneSpacing(value.spacing) }
    : { grid: value, shapes: [], spacing: noSpacing() }
}

/**
 * Checks if a glyph has neither pixels nor shapes. Spacing alone does not
 * make a glyph non-empty, since there is nothing to space.
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
 * Makes a JSON-friendly object of a glyph. Shapes and spacing are left out
 * when there are none.
 * @param {Object} glyph - { grid, shapes, spacing }
 * @returns {Object} { size, bits, shapes?, spacing? }
 */
export function serializeGlyph(glyph) {
  const data = serializeGrid(glyph.grid)
  const spacing = cloneSpacing(glyph.spacing)

  if (glyph.shapes && glyph.shapes.length > 0) data.shapes = cloneShapes(glyph.shapes)
  if (spacing.left !== null || spacing.right !== null) data.spacing = spacing

  return data
}

/**
 * Restores a glyph from the object made by serializeGlyph. Data from an
 * older version, without shapes or spacing, gives a glyph without them.
 * @param {Object} data
 * @returns {Object} { grid, shapes, spacing }
 * @throws {Error} if the pixel data is damaged
 */
export function deserializeGlyph(data) {
  return {
    grid: deserializeGrid(data),
    shapes: sanitizeShapes(data.shapes),
    spacing: sanitizeSpacing(data.spacing)
  }
}
