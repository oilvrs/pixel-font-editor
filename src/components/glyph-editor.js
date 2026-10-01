/**
 * Pixel glyph editor component.
 * Draws pixelated glyphs on a 16, 32, 64 or 128 grid.
 *
 * @version 0.1.0
 */

class GlyphEditor extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  /**
   * Called whenever the element is added to the DOM.
   */
  connectedCallback() {
    this.render()
    this.setUpEventListeners()
  }

  /**
   * Renders the HTML template and styles into the shadow DOM.
   */
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
      </style>
      <p>glyph-editor ready</p>
    `
  }

  /**
   * Sets up event listeners.
   */
  setUpEventListeners() {}
}

customElements.define('glyph-editor', GlyphEditor)
