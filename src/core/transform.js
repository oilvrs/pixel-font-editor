/**
 * Affine transforms of pixel regions: resize, flip and rotation.
 * Pure logic, no DOM dependencies.
 *
 * A transform is { cx, cy, w, h, angle }:
 * - cx, cy: center, in grid coordinates (pixel corners, y downwards)
 * - w, h: size in cells after scaling. A negative value flips that axis.
 * - angle: clockwise rotation in radians, around the center
 *
 * The frame is first scaled in its own (local) axes and then rotated.
 * Rendering samples the source with nearest-neighbor, always from the
 * original source, so repeated changes to a transform never add up to
 * extra quality loss.
 *
 * @version 0.1.0
 */

const EPSILON = 1e-9

/**
 * Removes floating point noise around zero, so cos(90°) is exactly 0.
 * @param {number} value
 * @returns {number}
 */
function clean(value) {
  return Math.abs(value) < 1e-12 ? 0 : value
}

/**
 * Checks if a number is a whole number, within rounding noise.
 * @param {number} value
 * @returns {boolean}
 */
function isWhole(value) {
  return Math.abs(value - Math.round(value)) < EPSILON
}

/**
 * Limits a number to a range.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Sine, cosine and half the bounding box size of the rotated frame.
 * @param {Object} t
 * @returns {Object} { cos, sin, x, y }
 */
function extents(t) {
  const cos = clean(Math.cos(t.angle))
  const sin = clean(Math.sin(t.angle))
  const halfW = Math.abs(t.w) / 2
  const halfH = Math.abs(t.h) / 2

  return {
    cos,
    sin,
    x: Math.abs(cos) * halfW + Math.abs(sin) * halfH,
    y: Math.abs(sin) * halfW + Math.abs(cos) * halfH
  }
}

/**
 * Rounds an angle to the nearest step.
 * @param {number} angle - radians
 * @param {number} step - radians, 45° by default
 * @returns {number}
 */
export function snapAngle(angle, step = Math.PI / 4) {
  return Math.round(angle / step) * step
}

/**
 * The center used for rendering and drawing. When the rotated frame has a
 * whole-number size (angles 0, 90, 180 and 270), the center is moved by up
 * to half a cell so the frame lands exactly on the pixel grid. That keeps
 * those rotations lossless.
 * @param {Object} t
 * @returns {Object} { cx, cy }
 */
export function alignedCenter(t) {
  const { x, y } = extents(t)

  return {
    cx: isWhole(x * 2) ? Math.round(t.cx - x) + x : t.cx,
    cy: isWhole(y * 2) ? Math.round(t.cy - y) + y : t.cy
  }
}

/**
 * Converts a grid position to the local frame: relative to the center, and
 * with the rotation undone.
 * @param {Object} t
 * @param {number} gx
 * @param {number} gy
 * @returns {Object} { x, y }
 */
export function toLocal(t, gx, gy) {
  const { cos, sin } = extents(t)
  const { cx, cy } = alignedCenter(t)
  const dx = gx - cx
  const dy = gy - cy

  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos }
}

/**
 * Converts a position in the local frame to grid coordinates.
 * @param {Object} t
 * @param {number} lx
 * @param {number} ly
 * @returns {Object} { x, y }
 */
export function fromLocal(t, lx, ly) {
  const { cos, sin } = extents(t)
  const { cx, cy } = alignedCenter(t)

  return { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos }
}

/**
 * The four corners of the frame in grid coordinates: top left, top right,
 * bottom right, bottom left (before rotation).
 * @param {Object} t
 * @returns {Object[]} [{ x, y }]
 */
export function transformCorners(t) {
  const halfW = Math.abs(t.w) / 2
  const halfH = Math.abs(t.h) / 2

  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ].map(([sx, sy]) => fromLocal(t, sx * halfW, sy * halfH))
}

/**
 * Renders a source region through a transform. Every destination pixel
 * samples the source at its center.
 * @param {Object} source - { width, height, pixels }
 * @param {Object} t - transform
 * @returns {Object} { region: { width, height, pixels }, x, y } where x, y is the top left in grid coordinates
 */
export function renderTransformed(source, t) {
  const { cos, sin, x: extentX, y: extentY } = extents(t)
  const { cx, cy } = alignedCenter(t)

  const left = Math.floor(cx - extentX + EPSILON)
  const top = Math.floor(cy - extentY + EPSILON)
  const right = Math.ceil(cx + extentX - EPSILON)
  const bottom = Math.ceil(cy + extentY - EPSILON)

  const width = right - left
  const height = bottom - top
  const pixels = new Uint8Array(width * height)

  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const dx = left + i + 0.5 - cx
      const dy = top + j + 0.5 - cy
      const lx = dx * cos + dy * sin
      const ly = -dx * sin + dy * cos

      const u = (lx / t.w) * source.width + source.width / 2
      const v = (ly / t.h) * source.height + source.height / 2
      if (u < 0 || v < 0 || u >= source.width || v >= source.height) continue

      pixels[j * width + i] = source.pixels[Math.floor(v) * source.width + Math.floor(u)]
    }
  }

  return { region: { width, height, pixels }, x: left, y: top }
}

/**
 * Computes the transform after a resize handle has been dragged. The edge
 * opposite the handle stays where it is. Dragging past it flips the content.
 * Sizes are whole cells.
 * @param {Object} start - the transform when the drag began
 * @param {number} hx - handle side along the local x axis: -1, 0 or 1
 * @param {number} hy - handle side along the local y axis: -1, 0 or 1
 * @param {Object} pointer - pointer position in the local frame of `start` ({ x, y }, see toLocal)
 * @param {boolean} keepRatio - keep the proportions
 * @param {number} maxSize - largest allowed size in cells
 * @returns {Object} the new transform
 */
export function resizeTransform(start, hx, hy, pointer, keepRatio = false, maxSize = 256) {
  const w0 = Math.abs(start.w)
  const h0 = Math.abs(start.h)

  let lenX = w0
  let lenY = h0
  let dirX = 1
  let dirY = 1
  let anchorX = 0
  let anchorY = 0

  if (hx !== 0) {
    anchorX = (-hx * w0) / 2
    dirX = pointer.x < anchorX ? -1 : 1
    lenX = Math.abs(pointer.x - anchorX)
  }

  if (hy !== 0) {
    anchorY = (-hy * h0) / 2
    dirY = pointer.y < anchorY ? -1 : 1
    lenY = Math.abs(pointer.y - anchorY)
  }

  if (keepRatio) {
    let factor = lenY / h0
    if (hx !== 0 && hy !== 0) factor = Math.max(lenX / w0, lenY / h0)
    else if (hx !== 0) factor = lenX / w0

    lenX = w0 * factor
    lenY = h0 * factor
  }

  lenX = clamp(Math.round(lenX), 1, maxSize)
  lenY = clamp(Math.round(lenY), 1, maxSize)

  const centerX = hx !== 0 ? anchorX + (dirX * lenX) / 2 : 0
  const centerY = hy !== 0 ? anchorY + (dirY * lenY) / 2 : 0

  const flipX = hx !== 0 && dirX !== hx
  const flipY = hy !== 0 && dirY !== hy

  const center = fromLocal(start, centerX, centerY)

  return {
    cx: center.x,
    cy: center.y,
    w: start.w < 0 !== flipX ? -lenX : lenX,
    h: start.h < 0 !== flipY ? -lenY : lenY,
    angle: start.angle
  }
}

/**
 * The angle after dragging a rotation from one pointer position to another,
 * around the center of the frame.
 * @param {Object} start - the transform when the drag began
 * @param {Object} from - pointer position when the drag began, in grid coordinates
 * @param {Object} to - current pointer position, in grid coordinates
 * @param {boolean} snap - round the result to 45° steps
 * @returns {number} radians
 */
export function rotatedAngle(start, from, to, snap = false) {
  const { cx, cy } = alignedCenter(start)
  const before = Math.atan2(from.y - cy, from.x - cx)
  const after = Math.atan2(to.y - cy, to.x - cx)
  const angle = start.angle + (after - before)

  return snap ? snapAngle(angle) : angle
}
