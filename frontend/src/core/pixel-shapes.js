/**
 * Turns drawn pixels into shapes. Every filled cell becomes one shape that is
 * one cell in size and centered on the cell.
 * Pure logic, no DOM dependencies.
 *
 * @version 0.1.0
 */

/**
 * The range of cells to visit: a region, cut to the grid, or the whole grid.
 * @param {Object} grid - { size, pixels }
 * @param {Object|null} region - { x, y, width, height } in cells
 * @returns {Object} { x0, y0, x1, y1 }, where x1 and y1 are exclusive
 */
function cellRange(grid, region) {
  if (!region) return { x0: 0, y0: 0, x1: grid.size, y1: grid.size }

  return {
    x0: Math.max(0, region.x),
    y0: Math.max(0, region.y),
    x1: Math.min(grid.size, region.x + region.width),
    y1: Math.min(grid.size, region.y + region.height),
  }
}

/**
 * Counts the filled pixels, in the whole grid or in a region.
 * @param {Object} grid - { size, pixels }
 * @param {Object|null} [region] - { x, y, width, height } in cells
 * @returns {number}
 */
export function countPixels(grid, region = null) {
  const { x0, y0, x1, y1 } = cellRange(grid, region)
  let count = 0

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (grid.pixels[y * grid.size + x]) count++
    }
  }

  return count
}

/**
 * Makes one shape for every filled pixel, row by row from the top left.
 * @param {Object} grid - { size, pixels }
 * @param {string} type - one of SHAPE_TYPES
 * @param {Object|null} [region] - { x, y, width, height } in cells. Only pixels inside it are used.
 * @returns {Object[]} shapes { type, cx, cy, w, h, angle }
 */
export function pixelsToShapes(grid, type, region = null) {
  const { x0, y0, x1, y1 } = cellRange(grid, region)
  const shapes = []

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (grid.pixels[y * grid.size + x]) {
        shapes.push({ type, cx: x + 0.5, cy: y + 0.5, w: 1, h: 1, angle: 0 })
      }
    }
  }

  return shapes
}
