/**
 * Glyph names and file names for export.
 * Pure logic, no DOM dependencies.
 *
 * Names follow AGLFN (Adobe Glyph List For New Fonts), which is what Glyphs
 * uses. Characters outside the table get a uniXXXX name.
 *
 * @version 0.1.0
 */

const ASCII_NAMES = {
  ' ': 'space',
  '!': 'exclam',
  '"': 'quotedbl',
  '#': 'numbersign',
  $: 'dollar',
  '%': 'percent',
  '&': 'ampersand',
  "'": 'quotesingle',
  '(': 'parenleft',
  ')': 'parenright',
  '*': 'asterisk',
  '+': 'plus',
  ',': 'comma',
  '-': 'hyphen',
  '.': 'period',
  '/': 'slash',
  ':': 'colon',
  ';': 'semicolon',
  '<': 'less',
  '=': 'equal',
  '>': 'greater',
  '?': 'question',
  '@': 'at',
  '[': 'bracketleft',
  '\\': 'backslash',
  ']': 'bracketright',
  '^': 'asciicircum',
  _: 'underscore',
  '`': 'grave',
  '{': 'braceleft',
  '|': 'bar',
  '}': 'braceright',
  '~': 'asciitilde'
}

const DIGIT_NAMES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

const LATIN_NAMES = {
  å: 'aring',
  ä: 'adieresis',
  ö: 'odieresis',
  Å: 'Aring',
  Ä: 'Adieresis',
  Ö: 'Odieresis',
  é: 'eacute',
  É: 'Eacute',
  è: 'egrave',
  È: 'Egrave',
  ü: 'udieresis',
  Ü: 'Udieresis',
  ß: 'germandbls',
  æ: 'ae',
  Æ: 'AE',
  ø: 'oslash',
  Ø: 'Oslash',
  ñ: 'ntilde',
  Ñ: 'Ntilde',
  ç: 'ccedilla',
  Ç: 'Ccedilla',
  '€': 'Euro',
  '£': 'sterling',
  '¥': 'yen',
  '©': 'copyright',
  '®': 'registered',
  '°': 'degree',
  '§': 'section',
  '«': 'guillemotleft',
  '»': 'guillemotright',
  '–': 'endash',
  '—': 'emdash',
  '‘': 'quoteleft',
  '’': 'quoteright',
  '“': 'quotedblleft',
  '”': 'quotedblright',
  '…': 'ellipsis',
  '•': 'bullet'
}

/**
 * The glyph name for a character. Only the first character is used.
 * @param {string} char
 * @returns {string} the name, or an empty string if there is no character
 */
export function glyphName(char) {
  const first = [...String(char)][0]
  if (!first) return ''

  if (/^[A-Za-z]$/.test(first)) return first
  if (/^[0-9]$/.test(first)) return DIGIT_NAMES[Number(first)]
  if (ASCII_NAMES[first]) return ASCII_NAMES[first]
  if (LATIN_NAMES[first]) return LATIN_NAMES[first]

  const hex = first.codePointAt(0).toString(16).toUpperCase()
  return hex.length <= 4 ? `uni${hex.padStart(4, '0')}` : `u${hex}`
}

/**
 * A file name that is safe on case-insensitive file systems: every uppercase
 * letter gets an underscore after it (the UFO convention), so A and a never
 * collide.
 * @param {string} name - glyph name
 * @param {string} extension - without the dot
 * @returns {string}
 */
export function exportFileName(name, extension) {
  return `${name.replace(/[A-Z]/g, (letter) => `${letter}_`)}.${extension}`
}
