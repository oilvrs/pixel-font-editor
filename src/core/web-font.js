/**
 * Files that go with a web font: a CSS file with the @font-face rule, and a
 * test page. Pure logic, no DOM dependencies.
 *
 * @version 0.1.0
 */

import { safeFileName } from './export-ufo.js'

/**
 * A file name for the font files: the font name, safe on every file system
 * and without spaces, so it needs no quoting in CSS.
 * @param {string} name - the font name
 * @returns {string}
 */
export function fontBaseName(name) {
  return safeFileName(name).replace(/\s+/g, '-')
}

/**
 * Quotes text as a CSS string.
 * @param {string} text
 * @returns {string}
 */
function cssString(text) {
  return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`
}

/**
 * Escapes text for use in HTML.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * The CSS for using the font: an @font-face rule that tries WOFF first and
 * TrueType as a fallback, and a class that sets the font up.
 * @param {Object} options
 * @param {string} options.familyName
 * @param {string} options.baseName - from fontBaseName
 * @param {number} options.size - grid size the font was drawn on
 * @returns {string}
 */
export function buildCss({ familyName, baseName, size }) {
  const comment = String(familyName).replace(/\*\//g, '').replace(/[\r\n]+/g, ' ')

  return [
    `/* ${comment}, made with Pixel Glyph Editor.`,
    `   The glyphs are drawn on a ${size} × ${size} grid. Use a font-size that is a multiple of`,
    `   ${size}px (${size}px, ${size * 2}px, ${size * 3}px ...) so every pixel of the font covers a whole`,
    `   number of screen pixels and the edges stay sharp. */`,
    '',
    '@font-face {',
    `  font-family: ${cssString(familyName)};`,
    `  src: url(${cssString(`${baseName}.woff`)}) format("woff"),`,
    `       url(${cssString(`${baseName}.ttf`)}) format("truetype");`,
    '  font-weight: 400;',
    '  font-style: normal;',
    '  font-display: swap;',
    '}',
    '',
    '.pixel-font {',
    `  font-family: ${cssString(familyName)}, monospace;`,
    `  font-size: ${size}px;`,
    '  line-height: 1.25;',
    '  font-synthesis: none;',
    '}',
    ''
  ].join('\n')
}

/**
 * A page that shows the font, and how to use it.
 * @param {Object} options
 * @param {string} options.familyName
 * @param {string} options.baseName
 * @param {number} options.size
 * @param {string} options.text - sample text shown first
 * @returns {string}
 */
export function buildSpecimen({ familyName, baseName, size, text }) {
  const sizes = [1, 2, 3].map((k) => size * k).filter((px) => px <= 400)
  const lines = [
    text,
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789 ?!.,:;()',
    'ÅÄÖ åäö'
  ].filter((line) => String(line).trim() !== '')

  const samples = sizes
    .map(
      (px) =>
        `    <h2>${px}px</h2>\n` +
        lines.map((line) => `    <p class="pixel-font" style="font-size: ${px}px">${escapeHtml(line)}</p>`).join('\n')
    )
    .join('\n')

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `    <title>${escapeHtml(familyName)}</title>`,
    `    <link rel="stylesheet" href="${escapeHtml(baseName)}.css" />`,
    '    <style>',
    '      body { font-family: sans-serif; margin: 2rem; color: #000; background: #fff; }',
    '      h1, h2 { font-weight: 400; }',
    '      h2 { font-size: 0.9rem; margin: 2rem 0 0.5rem; }',
    '      p { margin: 0 0 0.5rem; }',
    '      pre { background: #f2f2f2; padding: 1rem; overflow: auto; }',
    '    </style>',
    '  </head>',
    '  <body>',
    `    <h1>${escapeHtml(familyName)}</h1>`,
    samples,
    '    <h2>use it</h2>',
    '    <pre>',
    escapeHtml(`<link rel="stylesheet" href="${baseName}.css" />\n<p class="pixel-font">Hello</p>`),
    '    </pre>',
    '  </body>',
    '</html>',
    ''
  ].join('\n')
}
