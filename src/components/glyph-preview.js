/**
 * Text preview: type text and see it set in the glyphs you have drawn,
 * with the spacing the exports give. Click a letter to select its glyph.
 *
 * The preview gets its data from a `source` function, set by the editor:
 *   () => ({ size, margin, current, getGlyph })
 *
 * Methods: refresh(), getText(), setText(text), focusText(), blurText()
 * Events: glyph-pick { char }
 *
 * @version 0.3.0
 */

import { layoutText } from '../core/layout.js'
import { paintShapes } from '../utils/paint-shapes.js'
import { loadText, saveText } from '../utils/storage.js'

const DEFAULT_TEXT = 'Hamburgefonstiv'
const TARGET_HEIGHT = 96 // Wanted height of one line, in CSS px, when choosing the default zoom
const MAX_CANVAS = 16384 // Larger canvases fail silently in browsers

class GlyphPreview extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.source = () => ({ size: 32, margin: 2, current: '', getGlyph: () => null })
    this.scale = 1 // Image pixels per grid cell, in CSS px
    this.lastSize = null
    this.layout = null // The last layout, used to find the letter under a click
    this.cell = 1 // Device px per grid cell in the last drawing
    this.gridSize = 32 // Grid size in the last drawing
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
          cursor: pointer;
        }
      </style>

      <div class="head">
        <span class="title">text</span>
        <span class="hint">T to type · esc to leave · click a letter to select it · gray boxes are glyphs without a drawing</span>
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
   * Sets up the text field, the zoom buttons and clicks on the letters.
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
    this.shadowRoot.getElementById('canvas').addEventListener('pointerdown', (e) => this.onPointerDown(e))
  }

  /**
   * Finds the letter under a click and tells the editor to select its glyph.
   * @param {PointerEvent} e
   */
  onPointerDown(e) {
    if (!this.layout) return

    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    const deviceScale = canvas.width / rect.width

    const x = ((e.clientX - rect.left) * deviceScale) / this.cell
    const y = ((e.clientY - rect.top) * deviceScale) / this.cell

    const hit = this.layout.items.find(
      (item) => x >= item.x && x < item.x + item.advance && y >= item.y && y < item.y + this.gridSize
    )

    if (hit) this.dispatchEvent(new CustomEvent('glyph-pick', { detail: { char: hit.char } }))
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
   * @returns {string} the text in the text field
   */
  getText() {
    return this.textarea.value
  }

  /**
   * Replaces the text, saves it and redraws.
   * @param {string} text - the default text is used if this is empty
   */
  setText(text) {
    this.textarea.value = text || DEFAULT_TEXT
    saveText(this.textarea.value)
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
   * Draws the sidebearings of a letter: its advance box lightly, and the
   * sidebearings darker, with a line at each end of the advance.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} item - a layout item
   * @param {Object} m - { cell, line, top, height, boxLeft, boxRight }
   */
  paintMetrics(ctx, item, { cell, line, top, height, boxLeft, boxRight }) {
    const inkLeft = Math.round((item.x + item.lsb) * cell)
    const inkRight = Math.round((item.x + item.advance - item.rsb) * cell)

    ctx.fillStyle = 'rgba(0, 0, 255, 0.06)'
    ctx.fillRect(boxLeft, top, boxRight - boxLeft, height)

    ctx.fillStyle = 'rgba(0, 0, 255, 0.14)'
    ctx.fillRect(boxLeft, top, Math.max(0, inkLeft - boxLeft), height)
    ctx.fillRect(inkRight, top, Math.max(0, boxRight - inkRight), height)

    ctx.fillStyle = 'rgba(0, 0, 255, 0.6)'
    ctx.fillRect(boxLeft, top, line, height)
    ctx.fillRect(boxRight - line, top, line, height)
  }

  /**
   * Lays out the text and draws it. The zoom is reset to a sensible
   * default whenever the grid size changes. Positions are rounded to whole
   * device pixels, so edges stay sharp even when a spacing is not a whole
   * number of pixels.
   */
  refresh() {
    if (!this.textarea) return

    const { size, margin, current, getGlyph } = this.source()

    if (size !== this.lastSize) {
      this.scale = Math.max(1, Math.floor(TARGET_HEIGHT / size))
      this.lastSize = size
    }

    this.shadowRoot.getElementById('zoomValue').textContent = `${this.scale}×`

    const layout = layoutText(this.textarea.value, getGlyph, { size, margin })
    const dpr = window.devicePixelRatio || 1
    const cell = Math.max(1, Math.round(this.scale * dpr))
    const line = Math.max(1, Math.round(dpr))

    this.layout = layout
    this.cell = cell
    this.gridSize = size

    const canvas = this.shadowRoot.getElementById('canvas')
    const width = Math.min(Math.max(1, Math.ceil(layout.width * cell)), MAX_CANVAS)
    const height = Math.min(Math.max(1, Math.ceil(layout.height * cell)), MAX_CANVAS)

    canvas.width = width
    canvas.height = height
    canvas.style.width = `${width / dpr}px`
    canvas.style.height = `${height / dpr}px`

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)

    for (const item of layout.items) {
      const top = Math.round(item.y * cell)
      const boxLeft = Math.round(item.x * cell)
      const boxRight = Math.round((item.x + item.advance) * cell)

      if (item.missing) {
        ctx.fillStyle = item.char === current ? 'rgba(0, 0, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)'
        ctx.fillRect(boxLeft, top, boxRight - boxLeft, size * cell)
        continue
      }

      if (item.char === current) {
        this.paintMetrics(ctx, item, { cell, line, top, height: size * cell, boxLeft, boxRight })
      }

      const left = Math.round((item.x + item.inkOffset) * cell)
      const { pixels } = item.grid

      ctx.fillStyle = '#000000'
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (pixels[y * size + x]) ctx.fillRect(left + x * cell, top + y * cell, cell, cell)
        }
      }

      paintShapes(ctx, item.shapes, { scale: cell, x: left, y: top })
    }
  }
}

customElements.define('glyph-preview', GlyphPreview)
