/**
 * Glyph names and file names for export.
 * Pure logic, no DOM dependencies.
 *
 * Names follow AGLFN (Adobe Glyph List For New Fonts), which is what Glyphs
 * uses. Characters outside the tables get a uniXXXX name.
 *
 * @version 0.2.0
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
  À: 'Agrave',
  Á: 'Aacute',
  Â: 'Acircumflex',
  Ã: 'Atilde',
  Ä: 'Adieresis',
  Å: 'Aring',
  Æ: 'AE',
  Ç: 'Ccedilla',
  È: 'Egrave',
  É: 'Eacute',
  Ê: 'Ecircumflex',
  Ë: 'Edieresis',
  Ì: 'Igrave',
  Í: 'Iacute',
  Î: 'Icircumflex',
  Ï: 'Idieresis',
  Ð: 'Eth',
  Ñ: 'Ntilde',
  Ò: 'Ograve',
  Ó: 'Oacute',
  Ô: 'Ocircumflex',
  Õ: 'Otilde',
  Ö: 'Odieresis',
  Ø: 'Oslash',
  Ù: 'Ugrave',
  Ú: 'Uacute',
  Û: 'Ucircumflex',
  Ü: 'Udieresis',
  Ý: 'Yacute',
  Þ: 'Thorn',
  ß: 'germandbls',
  à: 'agrave',
  á: 'aacute',
  â: 'acircumflex',
  ã: 'atilde',
  ä: 'adieresis',
  å: 'aring',
  æ: 'ae',
  ç: 'ccedilla',
  è: 'egrave',
  é: 'eacute',
  ê: 'ecircumflex',
  ë: 'edieresis',
  ì: 'igrave',
  í: 'iacute',
  î: 'icircumflex',
  ï: 'idieresis',
  ð: 'eth',
  ñ: 'ntilde',
  ò: 'ograve',
  ó: 'oacute',
  ô: 'ocircumflex',
  õ: 'otilde',
  ö: 'odieresis',
  ø: 'oslash',
  ù: 'ugrave',
  ú: 'uacute',
  û: 'ucircumflex',
  ü: 'udieresis',
  ý: 'yacute',
  þ: 'thorn',
  ÿ: 'ydieresis'
}

const SYMBOL_NAMES = {
  '¡': 'exclamdown',
  '¢': 'cent',
  '£': 'sterling',
  '¤': 'currency',
  '¥': 'yen',
  '¦': 'brokenbar',
  '§': 'section',
  '¨': 'dieresis',
  '©': 'copyright',
  ª: 'ordfeminine',
  '«': 'guillemotleft',
  '¬': 'logicalnot',
  '®': 'registered',
  '¯': 'macron',
  '°': 'degree',
  '±': 'plusminus',
  '²': 'twosuperior',
  '³': 'threesuperior',
  '´': 'acute',
  µ: 'mu',
  '¶': 'paragraph',
  '·': 'periodcentered',
  '¸': 'cedilla',
  '¹': 'onesuperior',
  º: 'ordmasculine',
  '»': 'guillemotright',
  '¼': 'onequarter',
  '½': 'onehalf',
  '¾': 'threequarters',
  '¿': 'questiondown',
  '×': 'multiply',
  '÷': 'divide',
  '–': 'endash',
  '—': 'emdash',
  '‘': 'quoteleft',
  '’': 'quoteright',
  '‚': 'quotesinglbase',
  '“': 'quotedblleft',
  '”': 'quotedblright',
  '„': 'quotedblbase',
  '†': 'dagger',
  '‡': 'daggerdbl',
  '•': 'bullet',
  '…': 'ellipsis',
  '‰': 'perthousand',
  '‹': 'guilsinglleft',
  '›': 'guilsinglright',
  '€': 'Euro'
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

  const name = ASCII_NAMES[first] || LATIN_NAMES[first] || SYMBOL_NAMES[first]
  if (name) return name

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
