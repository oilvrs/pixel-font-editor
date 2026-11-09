/**
 * Unpacking of raw deflate data, as it is stored in ZIP files, with the
 * browser's DecompressionStream.
 *
 * @version 0.1.0
 */

/**
 * @param {Uint8Array} data - raw deflate data
 * @returns {Promise<Uint8Array>} the unpacked data
 * @throws {Error} if the browser cannot unpack it, or the data is damaged
 */
export async function inflateRaw(data) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('this browser cannot unpack compressed zip files')
  }

  try {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch (error) {
    throw new Error('the zip file is damaged')
  }
}
