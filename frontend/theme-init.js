// Sets the theme before the first paint, so that the page does not flash white in dark mode.
// The same rule as resolveTheme in src/core/theme.js. It is a separate file, loaded without
// defer, so that the content security policy does not have to allow inline scripts.
;(function () {
  var stored = null
  try {
    stored = localStorage.getItem('glyph-editor:theme')
  } catch (error) {}
  var dark =
    stored === 'dark' ||
    (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()
