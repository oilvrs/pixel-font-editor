/**
 * Compression for WOFF files, with the compression built into the browser.
 * Needs the DOM (CompressionStream), so it lives in utils.
 *
 * @version 0.1.0
 */

/**
 * Compresses bytes in the zlib format, which is what the 'deflate' format of
 * CompressionStream produces and what WOFF 1.0 uses for its tables.
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array|null>} the compressed bytes, or null if the browser cannot compress (the font is then stored without compression, which is valid)
 */
export async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null

  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
