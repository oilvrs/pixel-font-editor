/**
 * Cubic to quadratic Bézier conversion. TrueType outlines only have quadratic
 * curves, while the shapes of the editor are cubic.
 * Pure logic, no DOM dependencies.
 *
 * @version 0.1.0
 */

const MAX_DEPTH = 6

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * Splits a cubic curve in two at its middle (de Casteljau).
 * @param {Object} p0
 * @param {Object} c1
 * @param {Object} c2
 * @param {Object} p3
 * @returns {Object[][]} two cubics, each [p0, c1, c2, p3]
 */
function splitCubic(p0, c1, c2, p3) {
  const a = mid(p0, c1)
  const b = mid(c1, c2)
  const c = mid(c2, p3)
  const d = mid(a, b)
  const e = mid(b, c)
  const m = mid(d, e)

  return [
    [p0, a, d, m],
    [m, e, c, p3]
  ]
}

/**
 * A point on a cubic curve.
 */
function cubicAt(p0, c1, c2, p3, t) {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y
  }
}

/**
 * A point on a quadratic curve.
 */
function quadAt(p0, q, p2, t) {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * q.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * q.y + t * t * p2.y
  }
}

/**
 * Converts a cubic curve to a chain of quadratic curves. The cubic is split
 * in halves until the quadratic that stands in for each piece is within the
 * tolerance of it.
 * @param {Object} p0 - start { x, y }
 * @param {Object} c1 - first control point
 * @param {Object} c2 - second control point
 * @param {Object} p3 - end
 * @param {number} tolerance - largest allowed distance, in the units of the points
 * @param {number} depth - used by the recursion
 * @returns {Object[]} [{ control: { x, y }, to: { x, y } }], one per quadratic. The first one starts at p0 and the last one ends at p3.
 */
export function cubicToQuads(p0, c1, c2, p3, tolerance = 0.25, depth = 0) {
  const control = {
    x: (3 * (c1.x + c2.x) - p0.x - p3.x) / 4,
    y: (3 * (c1.y + c2.y) - p0.y - p3.y) / 4
  }

  let error = 0
  for (const t of [0.125, 0.25, 0.5, 0.75, 0.875]) {
    const a = cubicAt(p0, c1, c2, p3, t)
    const b = quadAt(p0, control, p3, t)
    error = Math.max(error, Math.hypot(a.x - b.x, a.y - b.y))
  }

  if (error <= tolerance || depth >= MAX_DEPTH) return [{ control, to: p3 }]

  const [first, second] = splitCubic(p0, c1, c2, p3)
  return [...cubicToQuads(...first, tolerance, depth + 1), ...cubicToQuads(...second, tolerance, depth + 1)]
}
