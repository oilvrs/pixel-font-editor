class GlyphToolbar extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }
}

customElements.define('glyph-toolbar', GlyphToolbar)
