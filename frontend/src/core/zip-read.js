/**
 * Reads a ZIP file. Pure logic, no DOM dependencies.
 *
 * Entries can be stored or deflated. Deflated entries are unpacked by a function
 * that is passed in, since the browser and Node do that differently (see
 * utils/decompress.js). Checksums are not checked.
 *
 * The limits protect against a file that was made to be heavy, for example a few
 * kilobytes that unpack to gigabytes.
 *
 * @version 0.2.0
 */

const END_OF_DIRECTORY = 0x06054b50
const CENTRAL_ENTRY = 0x02014b50
const LOCAL_HEADER = 0x04034b50
const TOO_LARGE = 'the zip file is too large when unpacked'

export const ZIP_LIMITS = Object.freeze({
  entries: 5000,
  entryBytes: 5 * 1024 * 1024,
  totalBytes: 50 * 1024 * 1024,
})

/**
 * Reads the entries of a ZIP file.
 * @param {Uint8Array} bytes - the file
 * @param {Function} inflate - async (Uint8Array, limit) => Uint8Array, unpacks raw deflate data
 *   and fails if the result is larger than limit bytes
 * @param {Function} [wanted] - (name) => boolean. Entries that are not wanted are not unpacked.
 * @param {Object} [limits] - { entries, entryBytes, totalBytes }
 * @returns {Promise<Object[]>} [{ name, data }], without folders
 * @throws {Error} if the file is not a ZIP file, is too large, or uses something that is not supported
 */
export async function readZip(bytes, inflate, wanted = () => true, limits = ZIP_LIMITS) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()

  // The end record is last in the file, followed by at most a comment.
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === END_OF_DIRECTORY) {
      end = i
      break
    }
  }

  if (end < 0) throw new Error('this is not a zip file')

  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)

  if (count === 0xffff || offset === 0xffffffff) throw new Error('zip64 files are not supported')
  if (count > limits.entries) throw new Error('the zip file has too many files')

  const entries = []
  let total = 0

  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_ENTRY) {
      throw new Error('the zip file is damaged')
    }

    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const size = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))

    offset += 46 + nameLength + extraLength + commentLength

    if (name.endsWith('/') || !wanted(name)) continue
    if (flags & 1) throw new Error('encrypted zip files are not supported')

    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL_HEADER) {
      throw new Error('the zip file is damaged')
    }

    // The local header has its own name and extra field, which can differ in length.
    const start =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true)
    const raw = bytes.subarray(start, start + size)
    let data

    if (method === 0) {
      if (size > limits.entryBytes) throw new Error(TOO_LARGE)
      data = raw.slice()
    } else if (method === 8) {
      data = await inflate(raw, limits.entryBytes)
      if (data.length > limits.entryBytes) throw new Error(TOO_LARGE)
    } else {
      throw new Error(`zip compression method ${method} is not supported`)
    }

    total += data.length
    if (total > limits.totalBytes) throw new Error(TOO_LARGE)

    entries.push({ name, data })
  }

  return entries
}
