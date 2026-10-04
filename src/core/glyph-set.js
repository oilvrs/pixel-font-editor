/**
 * The glyphs of a complete typeface, in the order they are shown and
 * stepped through. Space is left out: it has no pixels and cannot be
 * exported, so its width is set in Glyphs.
 *
 * @version 0.1.0
 */

const chars = (text) => [...text]

export const GLYPH_GROUPS = Object.freeze([
  { id: 'uppercase', label: 'uppercase', chars: chars('ABCDEFGHIJKLMNOPQRSTUVWXYZ') },
  { id: 'lowercase', label: 'lowercase', chars: chars('abcdefghijklmnopqrstuvwxyz') },
  { id: 'numbers', label: 'numbers', chars: chars('0123456789') },
  { id: 'punctuation', label: 'punctuation and symbols', chars: chars('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~') },
  { id: 'swedish', label: 'å ä ö', chars: chars('åäöÅÄÖ') },
  {
    id: 'accented',
    label: 'accented letters',
    chars: chars('ÀÁÂÃÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕØÙÚÛÜÝÞßàáâãæçèéêëìíîïðñòóôõøùúûüýþÿ')
  },
  {
    id: 'symbols',
    label: 'more symbols and punctuation',
    chars: chars('¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿×÷–—‘’‚“”„†‡•…‰‹›€')
  }
])

export const ALL_GLYPHS = Object.freeze(GLYPH_GROUPS.flatMap((group) => group.chars))
