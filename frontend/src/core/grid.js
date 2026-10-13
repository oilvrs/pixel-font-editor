/**
 * Pixel grid data model.
 * Pure logic, no DOM dependencies.
 *
 * A grid is { size, pixels } where pixels is a Uint8Array of length
 * size * size (row-major, 0 = empty, 1 = filled).
 *
 * @version 0.1.0
 */

export const SIZES = Object.freeze([8, 16, 32, 64, 128])

/**
 * Throws if the size is not a supported resolution.
 * @param {number} size
 */
function assertSize(size) {
  if (!SIZES.includes(size)) {
    throw new RangeError(`Unsupported grid size: ${size}. Use one of ${SIZES.join(', ')}.`)
  }
}

/**
 * Checks if a coordinate is inside the grid.
 * @param {Object} grid
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function inBounds(grid, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < grid.size && y < grid.size
}

/**
 * Creates an empty grid.
 * @param {number} size - 16, 32, 64 or 128
 * @returns {Object} { size, pixels }
 */
export function createGrid(size) {
  assertSize(size)
  return { size, pixels: new Uint8Array(size * size) }
}

/**
 * Reads one pixel. Out-of-bounds coordinates return 0.
 * @param {Object} grid
 * @param {number} x
 * @param {number} y
 * @returns {number} 0 or 1
 */
export function getPixel(grid, x, y) {
  if (!inBounds(grid, x, y)) return 0
  return grid.pixels[y * grid.size + x]
}

/**
 * Writes one pixel. Out-of-bounds coordinates are ignored, so a drag that
 * leaves the canvas does not need extra checks in the caller.
 * @param {Object} grid
 * @param {number} x
 * @param {number} y
 * @param {number|boolean} value - truthy fills, falsy erases
 * @returns {boolean} true if the pixel changed
 */
export function setPixel(grid, x, y, value) {
  if (!inBounds(grid, x, y)) return false

  const index = y * grid.size + x
  const next = value ? 1 : 0
  if (grid.pixels[index] === next) return false

  grid.pixels[index] = next
  return true
}

/**
 * Empties the grid in place.
 * @param {Object} grid
 */
export function clearGrid(grid) {
  grid.pixels.fill(0)
}

/**
 * Returns an independent copy of the grid.
 * @param {Object} grid
 * @returns {Object}
 */
export function cloneGrid(grid) {
  return { size: grid.size, pixels: grid.pixels.slice() }
}

/**
 * Checks if no pixel is filled.
 * @param {Object} grid
 * @returns {boolean}
 */
export function isEmpty(grid) {
  return grid.pixels.every((value) => value === 0)
}

/**
 * Returns a new grid at another resolution using nearest-neighbor sampling.
 * Upscaling is lossless (every pixel becomes a block). Downscaling is
 * destructive: thin details can disappear.
 * @param {Object} grid
 * @param {number} newSize - 16, 32, 64 or 128
 * @returns {Object}
 */
export function resizeGrid(grid, newSize) {
  assertSize(newSize)

  const result = createGrid(newSize)
  const ratio = grid.size / newSize // Always a power of two, so the math is exact

  for (let y = 0; y < newSize; y++) {
    const sourceY = Math.floor((y + 0.5) * ratio)
    for (let x = 0; x < newSize; x++) {
      const sourceX = Math.floor((x + 0.5) * ratio)
      result.pixels[y * newSize + x] = grid.pixels[sourceY * grid.size + sourceX]
    }
  }

  return result
}

/**
 * Packs a grid into a JSON-friendly object: 1 bit per pixel, base64 encoded.
 * A 128x128 grid becomes about 2.7 KB, small enough for localStorage.
 * @param {Object} grid
 * @returns {Object} { size, bits }
 */
export function serializeGrid(grid) {
  const bytes = new Uint8Array(Math.ceil(grid.pixels.length / 8))

  grid.pixels.forEach((value, i) => {
    if (value) bytes[i >> 3] |= 1 << (i & 7)
  })

  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return { size: grid.size, bits: btoa(binary) }
}

/**
 * Restores a grid from the object produced by serializeGrid.
 * @param {Object} data - { size, bits }
 * @returns {Object}
 */
export function deserializeGrid(data) {
  const grid = createGrid(data.size)
  const binary = atob(data.bits)

  for (let i = 0; i < grid.pixels.length; i++) {
    grid.pixels[i] = (binary.charCodeAt(i >> 3) >> (i & 7)) & 1
  }

  return grid
}

/**
 * Draws or erases a straight line between two cells (Bresenham), endpoints
 * included. Cells outside the grid are skipped, so a line may start or end
 * outside it.
 * @param {Object} grid
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number|boolean} value - truthy fills, falsy erases
 * @returns {boolean} true if any pixel changed
 */
/**
 * Fills or erases a square brush centered on a cell. For even sizes the
 * extra row and column go to the right and below. Cells outside the grid
 * are skipped.
 * @param {Object} grid
 * @param {number} x
 * @param {number} y
 * @param {number|boolean} value - truthy fills, falsy erases
 * @param {number} brushSize - side of the square, in cells
 * @returns {boolean} true if any pixel changed
 */
export function stampBrush(grid, x, y, value, brushSize = 1) {
  const offset = Math.floor(brushSize / 2)
  let changed = false

  for (let dy = 0; dy < brushSize; dy++) {
    for (let dx = 0; dx < brushSize; dx++) {
      if (setPixel(grid, x - offset + dx, y - offset + dy, value)) changed = true
    }
  }

  return changed
}

/**
 * Draws or erases a straight line between two cells (Bresenham), endpoints
 * included. Cells outside the grid are skipped, so a line may start or end
 * outside it.
 * @param {Object} grid
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number|boolean} value - truthy fills, falsy erases
 * @param {number} brushSize - side of the square brush, in cells
 * @returns {boolean} true if any pixel changed
 */
export function drawLine(grid, x0, y0, x1, y1, value, brushSize = 1) {
  let changed = false
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const stepX = x0 < x1 ? 1 : -1
  const stepY = y0 < y1 ? 1 : -1
  let error = dx + dy
  let x = x0
  let y = y0

  while (true) {
    if (stampBrush(grid, x, y, value, brushSize)) changed = true
    if (x === x1 && y === y1) break

    const doubled = 2 * error
    if (doubled >= dy) {
      error += dy
      x += stepX
    }
    if (doubled <= dx) {
      error += dx
      y += stepY
    }
  }

  return changed
}

/**
 * Copies a rectangle out of the grid. Cells outside the grid become 0.
 * @param {Object} grid
 * @param {number} x - left edge
 * @param {number} y - top edge
 * @param {number} width
 * @param {number} height
 * @returns {Object} { width, height, pixels }
 */
export function extractRegion(grid, x, y, width, height) {
  const pixels = new Uint8Array(width * height)

  for (let ry = 0; ry < height; ry++) {
    for (let rx = 0; rx < width; rx++) {
      pixels[ry * width + rx] = getPixel(grid, x + rx, y + ry)
    }
  }

  return { width, height, pixels }
}

/**
 * Adds the filled pixels of a region to the grid. Empty pixels in the region
 * are transparent: they do not erase what is already there. Pixels that land
 * outside the grid are skipped.
 * @param {Object} grid
 * @param {Object} region - { width, height, pixels }
 * @param {number} x - left edge
 * @param {number} y - top edge
 * @returns {boolean} true if any pixel changed
 */
export function pasteRegion(grid, region, x, y) {
  let changed = false

  for (let ry = 0; ry < region.height; ry++) {
    for (let rx = 0; rx < region.width; rx++) {
      if (region.pixels[ry * region.width + rx] && setPixel(grid, x + rx, y + ry, 1)) changed = true
    }
  }

  return changed
}

/**
 * Empties a rectangle of the grid. Cells outside the grid are skipped.
 * @param {Object} grid
 * @param {number} x - left edge
 * @param {number} y - top edge
 * @param {number} width
 * @param {number} height
 * @returns {boolean} true if any pixel changed
 */
export function clearRegion(grid, x, y, width, height) {
  let changed = false

  for (let ry = 0; ry < height; ry++) {
    for (let rx = 0; rx < width; rx++) {
      if (setPixel(grid, x + rx, y + ry, 0)) changed = true
    }
  }

  return changed
}

/**
 * Checks if two pixel arrays have identical contents.
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {boolean}
 */
export function pixelsEqual(a, b) {
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }

  return true
}
