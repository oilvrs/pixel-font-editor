/**
 * A small reader for the fonts the tests build, so the tests can check what
 * was really written to the file.
 */

export function readSfnt(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint16(4)
  const tables = {}
  const order = []

  for (let i = 0; i < count; i++) {
    const at = 12 + 16 * i
    const tag = String.fromCharCode(...bytes.subarray(at, at + 4))
    tables[tag] = { checksum: view.getUint32(at + 4), offset: view.getUint32(at + 8), length: view.getUint32(at + 12) }
    order.push(tag)
  }

  return { bytes, view, tables, order, flavor: view.getUint32(0) }
}

/**
 * The (3, 1) cmap subtable, format 4, as a map from code point to glyph number.
 */
export function readCmap(font) {
  const { view, tables } = font
  const base = tables.cmap.offset
  const count = view.getUint16(base + 2)
  let sub = null

  for (let i = 0; i < count; i++) {
    const at = base + 4 + 8 * i
    if (view.getUint16(at) === 3 && view.getUint16(at + 2) === 1) sub = base + view.getUint32(at + 4)
  }

  const segments = view.getUint16(sub + 6) / 2
  const endAt = sub + 14
  const startAt = endAt + segments * 2 + 2
  const deltaAt = startAt + segments * 2
  const rangeAt = deltaAt + segments * 2
  const map = new Map()

  for (let s = 0; s < segments; s++) {
    const end = view.getUint16(endAt + 2 * s)
    const start = view.getUint16(startAt + 2 * s)
    const delta = view.getUint16(deltaAt + 2 * s)
    const range = view.getUint16(rangeAt + 2 * s)
    if (start === 0xffff) continue

    for (let code = start; code <= end; code++) {
      if (range !== 0) throw new Error('idRangeOffset is not used by this writer')
      map.set(code, (code + delta) & 0xffff)
    }
  }

  return map
}

export function readHmtx(font, glyphCount) {
  const { view, tables } = font
  const metrics = []

  for (let i = 0; i < glyphCount; i++) {
    metrics.push({ advance: view.getUint16(tables.hmtx.offset + 4 * i), lsb: view.getInt16(tables.hmtx.offset + 4 * i + 2) })
  }

  return metrics
}

/**
 * The contours of a simple glyph: [[{ x, y, on }]], and its bounds.
 */
export function readGlyph(font, gid) {
  const { view, tables } = font
  const loca = (i) => view.getUint32(tables.loca.offset + 4 * i)
  const start = tables.glyf.offset + loca(gid)
  const end = tables.glyf.offset + loca(gid + 1)

  if (start === end) return { contours: [], bounds: null }

  const contourCount = view.getInt16(start)
  const bounds = {
    xMin: view.getInt16(start + 2),
    yMin: view.getInt16(start + 4),
    xMax: view.getInt16(start + 6),
    yMax: view.getInt16(start + 8)
  }

  const ends = []
  for (let i = 0; i < contourCount; i++) ends.push(view.getUint16(start + 10 + 2 * i))

  const pointCount = ends[ends.length - 1] + 1
  const instructionLength = view.getUint16(start + 10 + 2 * contourCount)
  let p = start + 12 + 2 * contourCount + instructionLength

  const flags = []
  while (flags.length < pointCount) {
    const flag = view.getUint8(p++)
    flags.push(flag)

    if (flag & 0x08) {
      const repeat = view.getUint8(p++)
      for (let r = 0; r < repeat; r++) flags.push(flag)
    }
  }

  const read = (shortBit, sameBit) => {
    const values = []
    let value = 0

    for (const flag of flags) {
      if (flag & shortBit) {
        const delta = view.getUint8(p++)
        value += flag & sameBit ? delta : -delta
      } else if (!(flag & sameBit)) {
        value += view.getInt16(p)
        p += 2
      }
      values.push(value)
    }

    return values
  }

  const xs = read(0x02, 0x10)
  const ys = read(0x04, 0x20)

  const contours = []
  let from = 0
  for (const last of ends) {
    const points = []
    for (let i = from; i <= last; i++) points.push({ x: xs[i], y: ys[i], on: Boolean(flags[i] & 1) })
    contours.push(points)
    from = last + 1
  }

  return { contours, bounds, firstFlag: flags[0] }
}

/**
 * The glyph names of a post table, format 2.
 */
export function readPostNames(font, glyphCount) {
  const { view, bytes, tables } = font
  const base = tables.post.offset
  const indices = []

  for (let i = 0; i < glyphCount; i++) indices.push(view.getUint16(base + 34 + 2 * i))

  const strings = []
  let p = base + 34 + 2 * glyphCount
  while (p < base + tables.post.length) {
    const length = bytes[p++]
    strings.push(String.fromCharCode(...bytes.subarray(p, p + length)))
    p += length
  }

  return indices.map((index) => (index === 0 ? '.notdef' : strings[index - 258]))
}

export function readNames(font) {
  const { view, tables } = font
  const base = tables.name.offset
  const count = view.getUint16(base + 2)
  const stringBase = base + view.getUint16(base + 4)
  const names = {}

  for (let i = 0; i < count; i++) {
    const at = base + 6 + 12 * i
    const id = view.getUint16(at + 6)
    const length = view.getUint16(at + 8)
    const offset = view.getUint16(at + 10)
    let text = ''

    for (let k = 0; k < length; k += 2) text += String.fromCharCode(view.getUint16(stringBase + offset + k))
    names[id] = text
  }

  return names
}

/**
 * Twice the signed area of a list of points, with the y axis pointing up.
 * Negative means clockwise.
 */
export function area(points) {
  let sum = 0
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  })
  return sum / 2
}

export function sumWords(bytes) {
  let sum = 0
  for (let i = 0; i < bytes.length; i += 4) {
    sum = (sum + (((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0)) >>> 0
  }
  return sum
}
