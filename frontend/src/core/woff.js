/**
 * WOFF 1.0 container: the tables of an sfnt font, each compressed with zlib
 * when that makes it smaller.
 * Pure logic, no DOM dependencies. The compression is passed in, so this works
 * both in a browser (CompressionStream) and in Node (zlib).
 *
 * @version 0.1.0
 */

/**
 * Builds a WOFF file.
 * @param {Object[]} tables - [{ tag, data, checksum }] in tag order, as from buildFont
 * @param {Function} compress - async (bytes) => zlib-compressed bytes, or null to store without compression
 * @param {Object} options
 * @param {number} options.flavor - the sfnt version, 0x00010000 for TrueType outlines
 * @returns {Promise<Uint8Array>}
 */
export async function buildWoff(tables, compress, { flavor = 0x00010000 } = {}) {
  const count = tables.length
  const entries = []

  for (const table of tables) {
    const packed = compress ? await compress(table.data) : null
    entries.push({ ...table, stored: packed && packed.length < table.data.length ? packed : table.data })
  }

  let offset = 44 + 20 * count
  for (const entry of entries) {
    entry.offset = offset
    offset += Math.ceil(entry.stored.length / 4) * 4
  }

  const sfntSize = 12 + 16 * count + tables.reduce((sum, table) => sum + Math.ceil(table.data.length / 4) * 4, 0)

  const bytes = new Uint8Array(offset)
  const view = new DataView(bytes.buffer)

  view.setUint32(0, 0x774f4646) // 'wOFF'
  view.setUint32(4, flavor)
  view.setUint32(8, offset)
  view.setUint16(12, count)
  view.setUint16(14, 0)
  view.setUint32(16, sfntSize)
  view.setUint16(20, 1) // Version of the font, 1.0
  view.setUint16(22, 0)
  // Metadata and private data are not used, so the rest of the header is zero.

  entries.forEach((entry, i) => {
    const at = 44 + 20 * i
    for (let k = 0; k < 4; k++) bytes[at + k] = entry.tag.charCodeAt(k)
    view.setUint32(at + 4, entry.offset)
    view.setUint32(at + 8, entry.stored.length)
    view.setUint32(at + 12, entry.data.length)
    view.setUint32(at + 16, entry.checksum)
    bytes.set(entry.stored, entry.offset)
  })

  return bytes
}
