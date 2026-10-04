/**
 * Text preview: type text and see it set in the glyphs you have drawn,
 * with the same spacing the SVG export gives.
 *
 * The preview gets its data from a `source` function, set by the editor:
 *   () => ({ size, margin, getGrid })
 *
 * Methods: refresh(), focusText(), blurText()
 *
 * @version 0.1.0
 */

import { layoutText } from '../core/layout.js'
import { loadText, saveText } from '../utils/storage.js'

const DEFAULT_TEXT = 'Hamburgefonstiv'
const TARGET_HEIGHT = 96 // Wanted height of one line, in CSS px, when choosing the default zoom
const MAX_CANVAS = 16384 // Larger canvases fail silently in browsers

class GlyphPreview extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.source = () => ({ size: 32, margin: 2, getGrid: () => null })
    this.scale = 1 // Image pixels per grid cell, in CSS px
    this.lastSize = null
  }

  /**
   * Called whenever the element is added to the DOM.
   */
  connectedCallback() {
    this.render()
    this.setUpEventListeners()
    this.refresh()
  }

  /**
   * Renders the HTML template and styles into the shadow DOM.
   */
  render() {
    const saved = loadText()

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica', 'Arial', sans-serif;
          color: #000000;
        }

        .head {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }

        .title {
          font-size: 0.9rem;
        }

        .hint {
          flex: 1;
          font-size: 0.85rem;
        }

        .value {
          font-size: 0.85rem;
          min-width: 2rem;
          text-align: center;
        }

        button {
          background: transparent;
          color: #000000;
          border: 1px solid #000000;
          padding: 0.5rem 1rem;
          cursor: pointer;
          font-size: 0.85rem;
          font-family: inherit;
        }

        button:hover {
          background: #000000;
          color: #ffffff;
        }

        textarea {
          display: block;
          width: 100%;
          box-sizing: border-box;
          padding: 0.5rem;
          border: 1px solid #000000;
          border-radius: 0;
          background: transparent;
          color: #000000;
          font-size: 0.9rem;
          font-family: inherit;
          resize: vertical;
        }

        textarea:focus {
          outline: 2px solid blue;
          outline-offset: 0;
        }

        .view {
          overflow: auto;
          margin-top: 0.75rem;
          padding: 1rem;
          border: 1px solid #000000;
          background: #ffffff;
        }

        canvas {
          display: block;
        }
      </style>

      <div class="head">
        <span class="title">text</span>
        <span class="hint">T to type · esc to leave · gray boxes are glyphs without a drawing</span>
        <button id="zoomOutBtn" title="smaller">−</button>
        <span class="value" id="zoomValue"></span>
        <button id="zoomInBtn" title="larger">+</button>
      </div>
      <textarea id="text" rows="2" spellcheck="false" placeholder="type text to test your glyphs"></textarea>
      <div class="view"><canvas id="canvas"></canvas></div>
    `

    this.textarea = this.shadowRoot.getElementById('text')
    this.textarea.value = saved === null ? DEFAULT_TEXT : saved
  }

  /**
   * Sets up the text field and the zoom buttons.
   */
  setUpEventListeners() {
    this.textarea.addEventListener('input', () => {
      saveText(this.textarea.value)
      this.refresh()
    })

    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.textarea.blur()
    })

    this.shadowRoot.getElementById('zoomOutBtn').addEventListener('click', () => this.zoom(-1))
    this.shadowRoot.getElementById('zoomInBtn').addEventListener('click', () => this.zoom(1))
  }

  /**
   * Makes the preview larger or smaller.
   * @param {number} delta - 1 or -1
   */
  zoom(delta) {
    this.scale = Math.min(Math.max(this.scale + delta, 1), 8)
    this.refresh()
  }

  /**
   * Moves the cursor to the end of the text field.
   */
  focusText() {
    this.textarea.focus()
    const end = this.textarea.value.length
    this.textarea.setSelectionRange(end, end)
  }

  /**
   * Takes keyboard focus away from the text field, so shortcuts work again
   * after the canvas is used.
   */
  blurText() {
    if (this.shadowRoot.activeElement) this.shadowRoot.activeElement.blur()
  }

  /**
   * Lays out the text and draws it. The zoom is reset to a sensible
   * default whenever the grid size changes.
   */
  refresh() {
    if (!this.textarea) return

    const { size, margin, getGrid } = this.source()

    if (size !== this.lastSize) {
      this.scale = Math.max(1, Math.floor(TARGET_HEIGHT / size))
      this.lastSize = size
    }

    this.shadowRoot.getElementById('zoomValue').textContent = `${this.scale}×`

    const layout = layoutText(this.textarea.value, getGrid, { size, margin })
    const dpr = window.devicePixelRatio || 1
    const cell = Math.max(1, Math.round(this.scale * dpr))

    const canvas = this.shadowRoot.getElementById('canvas')
    const width = Math.min(Math.max(1, layout.width * cell), MAX_CANVAS)
    const height = Math.min(Math.max(1, layout.height * cell), MAX_CANVAS)

    canvas.width = width
    canvas.height = height
    canvas.style.width = `${width / dpr}px`
    canvas.style.height = `${height / dpr}px`

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)

    for (const item of layout.items) {
      const top = item.y * cell

      if (item.missing) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
        ctx.fillRect(item.x * cell, top, item.advance * cell, size * cell)
        continue
      }

      const left = (item.x + item.inkOffset) * cell
      const { pixels } = item.grid

      ctx.fillStyle = '#000000'
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (pixels[y * size + x]) ctx.fillRect(left + x * cell, top + y * cell, cell, cell)
        }
      }
    }
  }
}

customElements.define('glyph-preview', GlyphPreview)
