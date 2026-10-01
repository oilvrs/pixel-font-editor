/**
 * Pixel glyph editor component.
 * Draws pixelated glyphs on an 8, 16, 32, 64 or 128 grid.
 * Click and drag draws, right click or shift erases, cmd/ctrl+z undoes.
 *
 * Every grid size has its own drawing and its own undo history. The grids
 * are drawing surfaces only, nothing is converted between sizes.
 *
 * @version 0.3.0
 */

import { createGrid, clearGrid, isEmpty, drawLine } from '../core/grid.js'
import { createHistory, pushState, undoState, redoState } from '../core/history.js'
import { getMetrics } from '../metrics.js'

// Cell size in CSS px per grid size. Always whole numbers, so the grid stays even.
const CELL_PX = { 8: 64, 16: 32, 32: 20, 64: 12, 128: 7 }

// A darker grid line is drawn every N cells, as a counting aid.
const MAJOR_EVERY = { 8: 4, 16: 4, 32: 8, 64: 8, 128: 8 }

// Guide line colors
const GUIDE_COLORS = {
  ascender: '#7a7a7a',
  capHeight: '#0000ff',
  xHeight: '#06a94d',
  baseline: '#ff0000',
  descender: '#7a7a7a',
}

class GlyphEditor extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.size = 32 // Active grid size
    this.sessions = new Map() // size -> { grid, history }, created on first use
    this.tool = 'pen' // 'pen' or 'eraser'
    this.showGuides = true // Guide lines on or off
    this.drawing = false // True while a stroke is in progress
    this.erasing = false // Locked at pointerdown, so a stroke never switches mode
    this.lastCell = null // Previous cell of the stroke, used to interpolate
    this.strokeStart = null // Pixels before the stroke, pushed to history if it changed anything
    this.strokeChanged = false

    this.onKeyDown = this.onKeyDown.bind(this)
    this.onResize = this.onResize.bind(this)
  }

  /**
   * The drawing and history of the active grid size.
   * @returns {Object} { grid, history }
   */
  get session() {
    if (!this.sessions.has(this.size)) {
      this.sessions.set(this.size, { grid: createGrid(this.size), history: createHistory() })
    }
    return this.sessions.get(this.size)
  }

  /**
   * The grid of the active size.
   * @returns {Object}
   */
  get grid() {
    return this.session.grid
  }

  /**
   * Called whenever the element is added to the DOM.
   */
  connectedCallback() {
    this.render()
    this.setUpEventListeners()
    this.updateNotice()
    this.draw()
  }

  /**
   * Called whenever the element is removed from the DOM.
   */
  disconnectedCallback() {
    document.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('resize', this.onResize)
  }

  /**
   * Renders the HTML template and styles into the shadow DOM.
   * The canvas size is set in draw(), since it depends on the grid size
   * and the screen's pixel density.
   */
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: "vt323", sans-serif;
          padding: 2rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .stage {
          overflow: auto;
          padding: 1px; /* Room for the outline, which overflow would clip */
        }

        .canvas {
          display: block;
          outline: 1px solid #000000;
          background: #ffffff;
          cursor: crosshair;
          touch-action: none;
        }

                .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem 1.25rem;
          font-size: 1.2rem;
          color: #000000;
          margin: 0.75rem 0 0 0;
        }

        .legend.hidden {
          display: none;
        }

        .key::before {
          content: '';
          display: inline-block;
          width: 1.5rem;
          border-top: 2px solid var(--c);
          margin-right: 0.5rem;
          vertical-align: middle;
        }

        .notice {
          font-size: 0.85rem;
          color: #000000;
          min-height: 1.4em;
          margin: 0.75rem 0 0 0;
        }
      </style>

            <glyph-toolbar tool="${this.tool}" size="${this.size}" guides="${this.showGuides ? 'on' : 'off'}"></glyph-toolbar>
      <div class="stage">
        <canvas id="canvas" class="canvas"></canvas>
      </div>
      <p class="legend" id="legend">
        <span class="key" style="--c: #ff0000">baseline</span>
        <span class="key" style="--c: #0000ff">cap-height</span>
        <span class="key" style="--c: #06a94d">x-height</span>
        <span class="key" style="--c: #7a7a7a">ascender / descender</span>
      </p>
      <p class="notice" id="notice"></p>
    `
  }

  /**
   * Sets up pointer events on the canvas, keyboard shortcuts and the toolbar.
   */
  setUpEventListeners() {
    const canvas = this.shadowRoot.getElementById('canvas')
    const toolbar = this.shadowRoot.querySelector('glyph-toolbar')

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e))
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e))
    canvas.addEventListener('pointerup', () => this.endStroke())
    canvas.addEventListener('pointercancel', () => this.endStroke())
    canvas.addEventListener('contextmenu', (e) => e.preventDefault()) // Right click is the eraser

    toolbar.addEventListener('tool-change', (e) => this.setTool(e.detail.tool))
    toolbar.addEventListener('size-change', (e) => this.setSize(e.detail.size))
    toolbar.addEventListener('clear', () => this.clear())
    toolbar.addEventListener('guides-toggle', () => this.toggleGuides())

    document.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('resize', this.onResize) // Browser zoom changes the pixel density
  }

  /**
   * Handles cmd/ctrl+z (undo), cmd/ctrl+shift+z and ctrl+y (redo).
   * @param {KeyboardEvent} e
   */
  onKeyDown(e) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || this.drawing) return

    const key = e.key.toLowerCase()

    if (key === 'z') {
      e.preventDefault()
      if (e.shiftKey) this.redo()
      else this.undo()
    } else if (key === 'y' && e.ctrlKey) {
      e.preventDefault()
      this.redo()
    }
  }

  /**
   * Redraws when the window or browser zoom changes.
   */
  onResize() {
    this.draw()
  }

  /**
   * Converts a pointer position to grid coordinates. Positions outside the
   * canvas give coordinates outside the grid, which the grid ignores.
   * @param {PointerEvent} e
   * @returns {Object} { x, y }
   */
  cellFromEvent(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.floor(((e.clientX - rect.left) / rect.width) * this.size),
      y: Math.floor(((e.clientY - rect.top) / rect.height) * this.size),
    }
  }

  /**
   * Starts a stroke. Right click, shift or the eraser tool erases.
   * @param {PointerEvent} e
   */
  onPointerDown(e) {
    if (e.button === 1) return // Ignore middle click

    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId) // Keeps the stroke going outside the canvas

    this.drawing = true
    this.erasing = this.tool === 'eraser' || e.shiftKey || e.button === 2
    this.strokeStart = this.grid.pixels.slice()
    this.strokeChanged = false
    this.lastCell = this.cellFromEvent(e)

    const { x, y } = this.lastCell
    if (drawLine(this.grid, x, y, x, y, !this.erasing)) {
      this.strokeChanged = true
      this.draw()
    }
  }

  /**
   * Continues a stroke, drawing a line from the previous cell so fast
   * movement leaves no gaps.
   * @param {PointerEvent} e
   */
  onPointerMove(e) {
    if (!this.drawing) return

    const cell = this.cellFromEvent(e)
    if (cell.x === this.lastCell.x && cell.y === this.lastCell.y) return

    const changed = drawLine(
      this.grid,
      this.lastCell.x,
      this.lastCell.y,
      cell.x,
      cell.y,
      !this.erasing
    )
    this.lastCell = cell

    if (changed) {
      this.strokeChanged = true
      this.draw()
    }
  }

  /**
   * Ends the current stroke. A stroke that changed something becomes one
   * undo step.
   */
  endStroke() {
    if (!this.drawing) return

    if (this.strokeChanged) pushState(this.session.history, this.strokeStart)

    this.drawing = false
    this.lastCell = null
    this.strokeStart = null
    this.strokeChanged = false
  }

  /**
   * Steps back one stroke in the active grid.
   */
  undo() {
    const { grid, history } = this.session
    const previous = undoState(history, grid.pixels)
    if (!previous) return

    grid.pixels.set(previous)
    this.draw()
  }

  /**
   * Steps forward one stroke in the active grid.
   */
  redo() {
    const { grid, history } = this.session
    const next = redoState(history, grid.pixels)
    if (!next) return

    grid.pixels.set(next)
    this.draw()
  }

  /**
   * Switches between pen and eraser.
   * @param {string} tool - 'pen' or 'eraser'
   */
  setTool(tool) {
    this.tool = tool
    this.shadowRoot.querySelector('glyph-toolbar').setAttribute('tool', tool)
  }

  /**
   * Switches to another grid size. Every size keeps its own drawing and
   * history, so nothing is lost or converted.
   * @param {number} size - 8, 16, 32, 64 or 128
   */
  setSize(size) {
    if (size === this.size) return

    this.size = size
    this.shadowRoot.querySelector('glyph-toolbar').setAttribute('size', size)
    this.updateNotice()
    this.draw()
  }

  /**
   * Empties the active grid. This is an undo step.
   */
  clear() {
    const { grid, history } = this.session
    if (isEmpty(grid)) return

    pushState(history, grid.pixels)
    clearGrid(grid)
    this.draw()
  }

  /**
   * Turns the guide lines on or off.
   */
  toggleGuides() {
    this.showGuides = !this.showGuides
    this.shadowRoot
      .querySelector('glyph-toolbar')
      .setAttribute('guides', this.showGuides ? 'on' : 'off')
    this.shadowRoot.getElementById('legend').classList.toggle('hidden', !this.showGuides)
    this.draw()
  }

  /**
   * Draws the guide lines on top of the pixels, centered on their row
   * boundary. Lines at the grid edge are kept inside the canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} size - grid size
   * @param {number} cell - cell size in device pixels
   * @param {number} line - grid line width in device pixels
   * @param {number} total - canvas size in device pixels
   */
  drawGuides(ctx, size, cell, line, total) {
    const thickness = line * 2

    for (const [name, row] of Object.entries(getMetrics(size))) {
      ctx.fillStyle = GUIDE_COLORS[name]
      const pos = Math.min(Math.max(row * cell - line, 0), total - thickness)
      ctx.fillRect(0, pos, total, thickness)
    }
  }

  /**
   * Shows a passive text line under the canvas. At 16×16 and below, fine
   * details can disappear.
   */
  updateNotice() {
    const text = this.size <= 16 ? 'low resolution: fine details can disappear' : ''
    this.shadowRoot.getElementById('notice').textContent = text
  }

  /**
   * Redraws the whole canvas. Everything is calculated in device pixels
   * with whole-number cell sizes, and the canvas is never scaled by CSS,
   * so every grid line is exactly one device pixel wide and evenly spaced.
   * Grid lines are drawn first, so filled pixels cover them and neighbouring
   * pixels read as one solid shape.
   */
  draw() {
    const canvas = this.shadowRoot.getElementById('canvas')
    const ctx = canvas.getContext('2d')
    const { size, pixels } = this.grid

    const dpr = window.devicePixelRatio || 1
    const cell = Math.round(CELL_PX[size] * dpr)
    const line = Math.max(1, Math.round(dpr))
    const total = cell * size

    if (canvas.width !== total) {
      canvas.width = total
      canvas.height = total
    }
    canvas.style.width = `${total / dpr}px`
    canvas.style.height = `${total / dpr}px`

    ctx.clearRect(0, 0, total, total)

    // Minor lines first, then major lines on top, so the major ones are never overdrawn at crossings
    const majorEvery = MAJOR_EVERY[size]
    for (const isMajor of [false, true]) {
      ctx.fillStyle = isMajor ? '#8c8c8c' : '#d9d9d9'
      for (let i = 0; i <= size; i++) {
        if ((i % majorEvery === 0) !== isMajor) continue
        const pos = Math.min(i * cell, total - line)
        ctx.fillRect(pos, 0, line, total)
        ctx.fillRect(0, pos, total, line)
      }
    }

    ctx.fillStyle = '#000000'
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (pixels[y * size + x]) ctx.fillRect(x * cell, y * cell, cell, cell)
      }
      if (this.showGuides) this.drawGuides(ctx, size, cell, line, total)
    }
  }
}

customElements.define('glyph-editor', GlyphEditor)
