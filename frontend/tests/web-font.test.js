import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fontBaseName, buildCss, buildSpecimen } from '../src/core/web-font.js'

test('the file name has no spaces or characters that need quoting', () => {
  assert.equal(fontBaseName('Pixel Font'), 'Pixel-Font')
  assert.equal(fontBaseName('A/B: C'), 'A-B--C')
  assert.equal(fontBaseName(''), 'Pixel-Font')
})

test('the CSS has an @font-face rule that tries WOFF before TrueType', () => {
  const css = buildCss({ familyName: 'Pixel Font', baseName: 'Pixel-Font', size: 32 })

  assert.match(css, /@font-face \{/)
  assert.match(css, /font-family: "Pixel Font";/)
  assert.ok(css.indexOf('Pixel-Font.woff') < css.indexOf('Pixel-Font.ttf'))
  assert.match(css, /format\("woff"\)/)
  assert.match(css, /format\("truetype"\)/)
  assert.match(css, /font-display: swap;/)
  assert.match(css, /\.pixel-font \{/)
})

test('the CSS tells which font sizes keep the pixels sharp', () => {
  const css = buildCss({ familyName: 'Pixel Font', baseName: 'Pixel-Font', size: 16 })

  assert.match(css, /multiple of\s+16px \(16px, 32px, 48px/)
  assert.match(css, /font-size: 16px;/)
})

test('a family name with quotes or a comment end cannot break out of the CSS', () => {
  const css = buildCss({ familyName: 'Evil"; } body { display: none } */ x', baseName: 'x', size: 32 })

  assert.match(css, /font-family: "Evil\\"; \} body/)
  assert.ok(css.indexOf('*/') > css.indexOf('edges stay sharp')) // The first comment end is the real one
})

test('the test page shows the text at sizes that are multiples of the grid, and escapes it', () => {
  const html = buildSpecimen({ familyName: 'A & B', baseName: 'A-B', size: 32, text: '<script>alert(1)</script>' })

  assert.match(html, /<title>A &amp; B<\/title>/)
  assert.match(html, /href="A-B\.css"/)
  assert.match(html, /font-size: 32px/)
  assert.match(html, /font-size: 64px/)
  assert.match(html, /font-size: 96px/)
  assert.ok(!html.includes('<script>'))
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
})

test('a large grid only gets sizes that fit on a page', () => {
  const html = buildSpecimen({ familyName: 'Big', baseName: 'Big', size: 128, text: 'x' })

  assert.match(html, /font-size: 128px/)
  assert.match(html, /font-size: 256px/)
  assert.match(html, /font-size: 384px/)
  assert.ok(!html.includes('font-size: 512px'))
})
