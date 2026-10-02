/**
 * Shared download helpers.
 *
 * @version 0.1.0
 */

/**
 * Downloads a Blob as a file.
 * @param {Blob} blob
 * @param {string} fileName
 */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  link.click()

  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Downloads text as a file.
 * @param {string} text
 * @param {string} fileName
 * @param {string} mimeType
 */
export function downloadText(text, fileName, mimeType = 'text/plain') {
  downloadBlob(new Blob([text], { type: `${mimeType};charset=utf-8` }), fileName)
}
