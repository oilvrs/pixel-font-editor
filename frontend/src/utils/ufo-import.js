/**
 * Reads a zipped UFO font from a file the user has chosen.
 *
 * @version 0.1.0
 */

import { importUfo, isUfoEntry } from '../core/ufo-import.js'
import { readZip } from '../core/zip-read.js'
import { inflateRaw } from './decompress.js'

const MAX_FILE_BYTES = 25 * 1024 * 1024

/**
 * @param {File} file - a .zip or .ufoz file
 * @param {Object} options
 * @param {number} options.size - the grid size of the project
 * @param {number} options.margin - the automatic side margin of the project, in cells
 * @returns {Promise<Object>} as importUfo gives it
 * @throws {Error} with a message for the user
 */
export async function readUfoFile(file, { size, margin }) {
  if (file.size > MAX_FILE_BYTES) throw new Error('The file is too large.')

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const entries = await readZip(bytes, inflateRaw, isUfoEntry)

    return importUfo(entries, { size, margin })
  } catch (error) {
    throw new Error(`Could not read the font: ${error.message}`)
  }
}
