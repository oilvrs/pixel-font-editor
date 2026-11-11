/**
 * Unpacking of raw deflate data, as it is stored in ZIP files, with the
 * browser's DecompressionStream.
 *
 * @version 0.2.0
 */

/**
 * @param {Uint8Array} data - raw deflate data
 * @param {number} [limit] - the largest result accepted, in bytes. Unpacking stops at the limit.
 * @returns {Promise<Uint8Array>} the unpacked data
 * @throws {Error} if the browser cannot unpack it, the data is damaged or the result is too large
 */
export async function inflateRaw(data, limit = Infinity) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('this browser cannot unpack compressed zip files')
  }

  const reader = new Blob([data])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .getReader()
  const chunks = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      total += value.length

      if (total > limit) {
        await reader.cancel()
        throw new Error('too large')
      }

      chunks.push(value)
    }
  } catch (error) {
    if (error.message === 'too large') throw new Error('the zip file is too large when unpacked')
    throw new Error('the zip file is damaged')
  }

  const result = new Uint8Array(total)
  let position = 0

  for (const chunk of chunks) {
    result.set(chunk, position)
    position += chunk.length
  }

  return result
}
