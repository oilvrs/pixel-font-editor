/**
 * PNG export of a grid.
 * Needs the DOM (canvas), so it lives in utils and not in core.
 *
 * Every cell becomes a whole number of image pixels, chosen so the image is
 * about 512 px wide (512 px for every grid size). Only the pixels are drawn,
 * no grid lines or guides.
 *
 * @version 0.1.0
 */

/**
 * Renders a grid to a PNG.
 * @param {Object} grid - { size, pixels }
 * @param {Object} options
 * @param {boolean} options.transparent - transparent background, otherwise white
 * @param {number} options.targetPx - wanted image width in px
 * @returns {Promise<Blob|null>}
 */
export function gridToPngBlob(grid, { transparent = true, targetPx = 512 } = {}) {
  const scale = Math.max(1, Math.floor(targetPx / grid.size))
  const canvas = document.createElement('canvas')
  canvas.width = grid.size * scale
  canvas.height = grid.size * scale

  const ctx = canvas.getContext('2d')

  if (!transparent) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  ctx.fillStyle = '#000000'
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      if (grid.pixels[y * grid.size + x]) ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
