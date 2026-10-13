/**
 * A minimal ZIP writer. Files are stored without compression, which is fine
 * for small text files and keeps the code short.
 * Pure logic, no DOM dependencies.
 *
 * @version 0.1.0
 */

const encoder = new TextEncoder()

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)

  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }

  return table
})()

/**
 * CRC-32 checksum, as ZIP uses it.
 * @param {Uint8Array} bytes
 * @returns {number} unsigned 32-bit value
 */
export function crc32(bytes) {
  let crc = 0xffffffff

  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Builds a ZIP file. File names may contain folders (a/b/c.txt) and are
 * written as UTF-8.
 * @param {Object[]} files - [{ name: string, data: string | Uint8Array }]
 * @param {Date} date - modification time written for every file
 * @returns {Uint8Array}
 */
export function createZip(files, date = new Date()) {
  const entries = files.map(({ name, data }) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data
    return { nameBytes: encoder.encode(name), bytes, crc: crc32(bytes), offset: 0 }
  })

  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()

  let localSize = 0
  for (const entry of entries) {
    entry.offset = localSize
    localSize += 30 + entry.nameBytes.length + entry.bytes.length
  }

  const centralSize = entries.reduce((sum, entry) => sum + 46 + entry.nameBytes.length, 0)
  const out = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(out.buffer)
  let p = 0

  const u16 = (value) => {
    view.setUint16(p, value, true)
    p += 2
  }
  const u32 = (value) => {
    view.setUint32(p, value, true)
    p += 4
  }
  const bytesOut = (bytes) => {
    out.set(bytes, p)
    p += bytes.length
  }

  for (const entry of entries) {
    u32(0x04034b50) // Local file header
    u16(20) // Version needed
    u16(0x0800) // Flags: UTF-8 names
    u16(0) // Method: stored
    u16(dosTime)
    u16(dosDate)
    u32(entry.crc)
    u32(entry.bytes.length)
    u32(entry.bytes.length)
    u16(entry.nameBytes.length)
    u16(0) // Extra field length
    bytesOut(entry.nameBytes)
    bytesOut(entry.bytes)
  }

  const centralOffset = p

  for (const entry of entries) {
    u32(0x02014b50) // Central directory header
    u16(20) // Version made by
    u16(20) // Version needed
    u16(0x0800)
    u16(0)
    u16(dosTime)
    u16(dosDate)
    u32(entry.crc)
    u32(entry.bytes.length)
    u32(entry.bytes.length)
    u16(entry.nameBytes.length)
    u16(0) // Extra field length
    u16(0) // Comment length
    u16(0) // Disk number
    u16(0) // Internal attributes
    u32(0) // External attributes
    u32(entry.offset)
    bytesOut(entry.nameBytes)
  }

  u32(0x06054b50) // End of central directory
  u16(0)
  u16(0)
  u16(entries.length)
  u16(entries.length)
  u32(centralSize)
  u32(centralOffset)
  u16(0) // Comment length

  return out
}
