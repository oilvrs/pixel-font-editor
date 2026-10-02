/**
 * Pixel glyph editor component.
 * Draws pixelated glyphs on an 8, 16, 32, 64 or 128 grid.
 *
 * - pen / eraser: drag to draw. Right click or shift erases. The brush is a
 *   square of 1 to 32 cells.
 * - select: drag a rectangle, cmd/ctrl+c copies it, cmd/ctrl+v pastes it as
 *   floating pixels that can be dragged, then placed with enter or a click
 *   outside. Esc cancels.
 * - cmd/ctrl+z undoes, cmd/ctrl+shift+z redoes.
 *
 * Every grid size has its own drawing and its own undo history. The grids
 * are drawing surfaces only, nothing is converted between sizes.
 *
 * @version 0.4.0
 */

import {
  createGrid,
  clearGrid,
  isEmpty,
  drawLine,
  extractRegion,
  pasteRegion,
  clearRegion,
  pixelsEqual,
} from '../core/grid.js'
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

const MAX_BRUSH = 32

/**
 * Limits a number to a range.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

class GlyphEditor extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.size = 32 // Active grid size
    this.sessions = new Map() // size -> { grid, history }, created on first use
    this.tool = 'pen' // 'pen', 'eraser' or 'select'
    this.showGuides = true // Guide lines on or off
    this.brushSize = 1 // Side of the square brush, in cells

    this.dragMode = null // null, 'stroke', 'marquee', 'liftpending' or 'float'
    this.erasing = false // Locked at pointerdown, so a stroke never switches mode
    this.lastCell = null // Previous cell of the stroke, used to interpolate
    this.strokeStart = null // Pixels before the stroke, pushed to history if it changed anything
    this.strokeChanged = false
    this.marquee = null // { start, moved } while a selection is dragged
    this.floatOffset = null // Grab point inside the floating
    this.liftStart = null // Cell where a drag inside the selection began, before anything is lifted

    this.selection = null // { x, y, width, height } or null
    this.clipboard = null // { width, height, pixels }, shared between grid sizes
    this.floating = null // { region, x, y }: pasted pixels not yet placed
    this.hoverCell = null // Cell under the pointer, for the brush preview

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
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica', 'Arial', sans-serif;
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
          font-size: 0.85rem;
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

      <glyph-toolbar
        tool="${this.tool}"
        size="${this.size}"
        brush="${this.brushSize}"
        guides="${this.showGuides ? 'on' : 'off'}"
      ></glyph-toolbar>
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
    canvas.addEventListener('pointerup', () => this.endDrag())
    canvas.addEventListener('pointercancel', () => this.endDrag())
    canvas.addEventListener('pointerleave', () => this.onPointerLeave())
    canvas.addEventListener('contextmenu', (e) => e.preventDefault()) // Right click is the eraser

    toolbar.addEventListener('tool-change', (e) => this.setTool(e.detail.tool))
    toolbar.addEventListener('size-change', (e) => this.setSize(e.detail.size))
    toolbar.addEventListener('brush-step', (e) => this.changeBrush(e.detail.delta))
    toolbar.addEventListener('clear', () => this.clear())
    toolbar.addEventListener('guides-toggle', () => this.toggleGuides())

    document.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('resize', this.onResize) // Browser zoom changes the pixel density
  }

  /**
   * Handles keyboard shortcuts:
   * cmd/ctrl+z undo, cmd/ctrl+shift+z or ctrl+y redo, cmd/ctrl+c copy,
   * cmd/ctrl+v paste, enter place, esc cancel, arrows nudge floating pixels,
   * [ ] or - + change brush size, b / e / m pick a tool.
   * @param {KeyboardEvent} e
   */
  onKeyDown(e) {
    if (this.dragMode) return

    const target = e.composedPath()[0]
    const typing =
      target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    if (typing) return

    const key = e.key.toLowerCase()

    if (e.metaKey || e.ctrlKey) {
      if (e.altKey) return

      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) this.redo()
        else this.undo()
      } else if (key === 'y' && e.ctrlKey) {
        e.preventDefault()
        this.redo()
      } else if (key === 'c') {
        if (this.copySelection()) e.preventDefault()
      } else if (key === 'v') {
        if (this.paste()) e.preventDefault()
      }
      return
    }

    // Plain keys. Alt is allowed, since [ and ] need it on a Swedish Mac keyboard.
    const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }

    if (key === 'enter' && this.floating) {
      e.preventDefault()
      this.commitFloating()
    } else if (key === 'escape') {
      if (this.floating) this.cancelFloating()
      else if (this.selection) this.clearSelection()
    } else if (arrows[key] && (this.floating || (this.tool === 'select' && this.selection))) {
      e.preventDefault()
      if (!this.floating) this.liftSelection()

      this.floating.x += arrows[key][0]
      this.floating.y += arrows[key][1]
      this.draw()
    } else if (key === '[' || key === '-') {
      this.changeBrush(-1)
    } else if (key === ']' || key === '+' || key === '=') {
      this.changeBrush(1)
    } else if (key === 'b') {
      this.setTool('pen')
    } else if (key === 'e') {
      this.setTool('eraser')
    } else if (key === 'm') {
      this.setTool('select')
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
   * Remembers the cell under the pointer for the brush preview.
   * @param {Object} cell - { x, y }
   * @returns {boolean} true if it changed
   */
  setHover(cell) {
    const inside = cell.x >= 0 && cell.y >= 0 && cell.x < this.size && cell.y < this.size
    const next = inside ? cell : null
    const same =
      next && this.hoverCell && next.x === this.hoverCell.x && next.y === this.hoverCell.y

    if (same || (!next && !this.hoverCell)) return false

    this.hoverCell = next
    return true
  }

  /**
   * Builds a selection rectangle between two cells, kept inside the grid.
   * @param {Object} a - { x, y }
   * @param {Object} b - { x, y }
   * @returns {Object} { x, y, width, height }
   */
  rectFromCells(a, b) {
    const max = this.size - 1
    const x1 = clamp(Math.min(a.x, b.x), 0, max)
    const y1 = clamp(Math.min(a.y, b.y), 0, max)
    const x2 = clamp(Math.max(a.x, b.x), 0, max)
    const y2 = clamp(Math.max(a.y, b.y), 0, max)
    return { x: x1, y: y1, width: x2 - x1 + 1, height: y2 - y1 + 1 }
  }

  /**
   * Checks if a cell is inside a rectangle of cells.
   * @param {Object} rect - { x, y, width, height }
   * @param {Object} cell - { x, y }
   * @returns {boolean}
   */
  insideRect(rect, cell) {
    return (
      cell.x >= rect.x &&
      cell.y >= rect.y &&
      cell.x < rect.x + rect.width &&
      cell.y < rect.y + rect.height
    )
  }

  /**
   * Cuts a rectangle of cells down to the part that is inside the grid.
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @returns {Object|null} { x, y, width, height }, or null if nothing is inside
   */
  rectInsideGrid(x, y, width, height) {
    const left = Math.max(0, x)
    const top = Math.max(0, y)
    const right = Math.min(this.size, x + width)
    const bottom = Math.min(this.size, y + height)

    if (right <= left || bottom <= top) return null
    return { x: left, y: top, width: right - left, height: bottom - top }
  }

  /**
   * Checks if a cell is inside the bounding box of the floating pixels.
   * @param {Object} cell - { x, y }
   * @returns {boolean}
   */
  insideFloating(cell) {
    const { region, x, y } = this.floating
    return cell.x >= x && cell.y >= y && cell.x < x + region.width && cell.y < y + region.height
  }

  /**
   * Starts a drag. Depending on what is under the pointer and the tool, it
   * moves floating pixels, prepares to move the selected pixels, drags a
   * new selection or starts a stroke. Right click, shift or the eraser tool
   * erases.
   * @param {PointerEvent} e
   */
  onPointerDown(e) {
    if (e.button === 1) return // Ignore middle click

    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId) // Keeps the drag going outside the canvas

    const cell = this.cellFromEvent(e)

    if (this.floating) {
      if (this.insideFloating(cell)) {
        this.dragMode = 'float'
        this.floatOffset = { x: cell.x - this.floating.x, y: cell.y - this.floating.y }
        return
      }
      this.commitFloating() // A click outside places the floating pixels
    }

    if (this.tool === 'select') {
      if (this.selection && this.insideRect(this.selection, cell)) {
        // The pixels are lifted on the first movement, so a plain click changes nothing
        this.dragMode = 'liftpending'
        this.liftStart = cell
        this.floatOffset = { x: cell.x - this.selection.x, y: cell.y - this.selection.y }
        return
      }

      this.dragMode = 'marquee'
      this.marquee = { start: cell, moved: false }
      this.selection = this.rectFromCells(cell, cell)
      this.draw()
      return
    }

    this.dragMode = 'stroke'
    this.erasing = this.tool === 'eraser' || e.shiftKey || e.button === 2
    this.strokeStart = this.grid.pixels.slice()
    this.strokeChanged = false
    this.lastCell = cell

    if (drawLine(this.grid, cell.x, cell.y, cell.x, cell.y, !this.erasing, this.brushSize)) {
      this.strokeChanged = true
    }
    this.draw()
  }

  /**
   * Continues the current drag, and tracks the pointer for the brush
   * preview. Strokes draw a line from the previous cell so fast movement
   * leaves no gaps.
   * @param {PointerEvent} e
   */
  onPointerMove(e) {
    const cell = this.cellFromEvent(e)
    let redraw = this.setHover(cell)

    if (this.dragMode === 'stroke') {
      if (cell.x !== this.lastCell.x || cell.y !== this.lastCell.y) {
        const changed = drawLine(
          this.grid,
          this.lastCell.x,
          this.lastCell.y,
          cell.x,
          cell.y,
          !this.erasing,
          this.brushSize
        )
        this.lastCell = cell

        if (changed) {
          this.strokeChanged = true
          redraw = true
        }
      }
    } else if (this.dragMode === 'marquee') {
      const start = this.marquee.start
      if (cell.x !== start.x || cell.y !== start.y) this.marquee.moved = true

      this.selection = this.rectFromCells(start, cell)
      redraw = true
    } else if (this.dragMode === 'liftpending') {
      if (cell.x !== this.liftStart.x || cell.y !== this.liftStart.y) {
        this.liftSelection()
        this.dragMode = 'float'
        this.floating.x = cell.x - this.floatOffset.x
        this.floating.y = cell.y - this.floatOffset.y
        redraw = true
      }
    } else if (this.dragMode === 'float') {
      this.floating.x = cell.x - this.floatOffset.x
      this.floating.y = cell.y - this.floatOffset.y
      redraw = true
    }

    if (redraw) this.draw()
  }

  /**
   * Hides the brush preview when the pointer leaves the canvas.
   */
  onPointerLeave() {
    if (this.dragMode || !this.hoverCell) return

    this.hoverCell = null
    this.draw()
  }

  /**
   * Ends the current drag. A stroke that changed something becomes one undo
   * step. A click with the select tool, without dragging, clears the selection.
   */
  endDrag() {
    if (!this.dragMode) return

    if (this.dragMode === 'stroke' && this.strokeChanged) {
      pushState(this.session.history, this.strokeStart)
    }

    if (this.dragMode === 'marquee' && !this.marquee.moved) {
      this.selection = null
    }

    this.dragMode = null
    this.lastCell = null
    this.strokeStart = null
    this.strokeChanged = false
    this.marquee = null
    this.floatOffset = null
    this.liftStart = null
    this.draw()
  }

  /**
   * Copies the selected pixels to the clipboard.
   * @returns {boolean} true if something was copied
   */
  copySelection() {
    this.commitFloating()
    if (!this.selection) return false

    const { x, y, width, height } = this.selection
    this.clipboard = extractRegion(this.grid, x, y, width, height)
    return true
  }

  /**
   * Pastes the clipboard as floating pixels at the pointer, or at the
   * top left corner if the pointer is not over the canvas.
   * @returns {boolean} true if something was pasted
   */
  paste() {
    if (!this.clipboard) return false

    this.commitFloating()

    const { width, height } = this.clipboard
    const anchor = this.hoverCell || { x: 0, y: 0 }

    this.floating = {
      region: this.clipboard,
      x: clamp(anchor.x, 0, Math.max(0, this.size - width)),
      y: clamp(anchor.y, 0, Math.max(0, this.size - height)),
    }

    this.updateNotice()
    this.draw()
    return true
  }

  /**
   * Lifts the selected pixels out of the grid and makes them floating. The
   * state from before the lift is kept, so the whole move is one undo step
   * and can be cancelled.
   * @returns {Object|null} the floating pixels, or null if nothing is selected
   */
  liftSelection() {
    if (!this.selection) return null

    const { grid } = this.session
    const { x, y, width, height } = this.selection

    this.floating = {
      region: extractRegion(grid, x, y, width, height),
      x,
      y,
      before: grid.pixels.slice(), // Restored on cancel, pushed to history on place
      origin: this.selection,
    }

    clearRegion(grid, x, y, width, height)
    this.selection = null
    this.updateNotice()

    return this.floating
  }

  /**
   * Places the floating pixels in the grid and selects them. If nothing
   * changed compared to before the lift or paste, no undo step is added.
   */
  commitFloating() {
    if (!this.floating) return

    const { grid, history } = this.session
    const { region, x, y, before } = this.floating
    const start = before || grid.pixels.slice() // A paste has no lift, so the state is taken now

    this.floating = null
    pasteRegion(grid, region, x, y)
    if (!pixelsEqual(grid.pixels, start)) pushState(history, start)

    this.selection = this.rectInsideGrid(x, y, region.width, region.height)
    this.updateNotice()
    this.draw()
  }

  /**
   * Throws away the floating pixels. Lifted pixels go back to where they
   * were, and the old selection returns.
   */
  cancelFloating() {
    if (!this.floating) return

    const { before, origin } = this.floating

    if (before) {
      this.grid.pixels.set(before)
      this.selection = origin
    }

    this.floating = null
    this.updateNotice()
    this.draw()
  }

  /**
   * Removes the selection rectangle.
   */
  clearSelection() {
    this.selection = null
    this.draw()
  }

  /**
   * Steps back one change in the active grid. While pasted pixels float,
   * it cancels them instead.
   */
  undo() {
    if (this.floating) {
      this.cancelFloating()
      return
    }

    const { grid, history } = this.session
    const previous = undoState(history, grid.pixels)
    if (!previous) return

    grid.pixels.set(previous)
    this.draw()
  }

  /**
   * Steps forward one change in the active grid.
   */
  redo() {
    if (this.floating) return

    const { grid, history } = this.session
    const next = redoState(history, grid.pixels)
    if (!next) return

    grid.pixels.set(next)
    this.draw()
  }

  /**
   * Switches tool. Floating pixels are placed first.
   * @param {string} tool - 'pen', 'eraser' or 'select'
   */
  setTool(tool) {
    this.commitFloating()
    this.tool = tool
    this.shadowRoot.querySelector('glyph-toolbar').setAttribute('tool', tool)
    this.draw()
  }

  /**
   * Switches to another grid size. Every size keeps its own drawing and
   * history, so nothing is lost or converted.
   * @param {number} size - 8, 16, 32, 64 or 128
   */
  setSize(size) {
    if (size === this.size) return

    this.commitFloating()
    this.size = size
    this.selection = null
    this.hoverCell = null
    this.shadowRoot.querySelector('glyph-toolbar').setAttribute('size', size)
    this.updateNotice()
    this.draw()
  }

  /**
   * Makes the brush larger or smaller.
   * @param {number} delta - 1 or -1
   */
  changeBrush(delta) {
    this.brushSize = clamp(this.brushSize + delta, 1, MAX_BRUSH)
    this.shadowRoot.querySelector('glyph-toolbar').setAttribute('brush', this.brushSize)
    this.draw()
  }

  /**
   * Empties the active grid. This is an undo step. Floating pixels are
   * thrown away.
   */
  clear() {
    this.cancelFloating()

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
   * Shows a passive text line under the canvas.
   */
  updateNotice() {
    const parts = []

    if (this.floating) parts.push('floating pixels: drag to move, enter to place, esc to cancel')
    if (this.size <= 16) parts.push('low resolution: fine details can disappear')

    this.shadowRoot.getElementById('notice').textContent = parts.join(' · ')
  }

    /**
   * Shows a move cursor over pixels that can be dragged: the floating
   * pixels, or the selection while the select tool is active.
   */
  updateCursor() {
    const canvas = this.shadowRoot.getElementById('canvas')
    const cell = this.hoverCell

    let movable = false
    if (cell) {
      if (this.floating) movable = this.insideFloating(cell)
      else if (this.tool === 'select' && this.selection) movable = this.insideRect(this.selection, cell)
    }

    canvas.style.cursor = movable ? 'move' : 'crosshair'
  }

  /**
   * Redraws the whole canvas. Everything is calculated in device pixels
   * with whole-number cell sizes, and the canvas is never scaled by CSS,
   * so every grid line is exactly one device pixel wide and evenly spaced.
   * Grid lines are drawn first, so filled pixels cover them and neighbouring
   * pixels read as one solid shape. Guides, floating pixels, the selection
   * and the brush preview are drawn on top.
   */
  draw() {
    const canvas = this.shadowRoot.getElementById('canvas')
    const ctx = canvas.getContext('2d')
    const { size, pixels } = this.grid

    const dpr = window.devicePixelRatio || 1
    const cell = Math.round(CELL_PX[size] * dpr)
    const line = Math.max(1, Math.round(dpr))
    const total = cell * size
    const view = { ctx, size, cell, line, total }

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
    }

    if (this.showGuides) this.drawGuides(view)
    if (this.floating) this.drawFloating(view)
    if (this.selection) {
      const { x, y, width, height } = this.selection
      this.strokeMarquee(view, x, y, width, height)
    }
    this.drawHover(view)
    this.updateCursor()
  }

  /**
   * Draws the guide lines on top of the pixels, centered on their row
   * boundary. Lines at the grid edge are kept inside the canvas.
   * @param {Object} view - { ctx, size, cell, line, total }
   */
  drawGuides({ ctx, size, cell, line, total }) {
    const thickness = line * 2

    for (const [name, row] of Object.entries(getMetrics(size))) {
      ctx.fillStyle = GUIDE_COLORS[name]
      const pos = Math.min(Math.max(row * cell - line, 0), total - thickness)
      ctx.fillRect(0, pos, total, thickness)
    }
  }

  /**
   * Draws the pasted pixels in blue, with a dashed outline, so they read as
   * not placed yet.
   * @param {Object} view - { ctx, size, cell, line, total }
   */
  drawFloating(view) {
    const { ctx, size, cell } = view
    const { region, x, y } = this.floating

    ctx.fillStyle = '#0000ff'
    for (let ry = 0; ry < region.height; ry++) {
      for (let rx = 0; rx < region.width; rx++) {
        const gx = x + rx
        const gy = y + ry
        if (!region.pixels[ry * region.width + rx]) continue
        if (gx < 0 || gy < 0 || gx >= size || gy >= size) continue
        ctx.fillRect(gx * cell, gy * cell, cell, cell)
      }
    }

    this.strokeMarquee(view, x, y, region.width, region.height)
  }

  /**
   * Draws a dashed black-and-white outline around a rectangle of cells, kept
   * inside the canvas.
   * @param {Object} view - { ctx, size, cell, line, total }
   * @param {number} x - left cell
   * @param {number} y - top cell
   * @param {number} width - in cells
   * @param {number} height - in cells
   */
  strokeMarquee({ ctx, cell, line, total }, x, y, width, height) {
    const left = Math.max(0, x * cell)
    const top = Math.max(0, y * cell)
    const right = Math.min(total, (x + width) * cell)
    const bottom = Math.min(total, (y + height) * cell)
    if (right <= left || bottom <= top) return

    const rectX = left + line
    const rectY = top + line
    const rectW = right - left - line * 2
    const rectH = bottom - top - line * 2

    ctx.lineWidth = line * 2

    ctx.setLineDash([])
    ctx.strokeStyle = '#ffffff'
    ctx.strokeRect(rectX, rectY, rectW, rectH)

    ctx.setLineDash([line * 4, line * 4])
    ctx.strokeStyle = '#000000'
    ctx.strokeRect(rectX, rectY, rectW, rectH)

    ctx.setLineDash([])
  }

  /**
   * Draws the brush preview under the pointer: gray for the pen, red for the
   * eraser.
   * @param {Object} view - { ctx, size, cell, line, total }
   */
  drawHover({ ctx, size, cell }) {
    const previewTool = this.tool === 'pen' || this.tool === 'eraser'
    const previewMode = this.dragMode === null || this.dragMode === 'stroke'
    if (!this.hoverCell || !previewTool || !previewMode || this.floating) return

    const offset = Math.floor(this.brushSize / 2)
    const left = Math.max(0, this.hoverCell.x - offset)
    const top = Math.max(0, this.hoverCell.y - offset)
    const right = Math.min(size, this.hoverCell.x - offset + this.brushSize)
    const bottom = Math.min(size, this.hoverCell.y - offset + this.brushSize)

    ctx.fillStyle =
      this.erasing || this.tool === 'eraser' ? 'rgba(255, 0, 0, 0.35)' : 'rgba(128, 128, 128, 0.5)'
    ctx.fillRect(left * cell, top * cell, (right - left) * cell, (bottom - top) * cell)
  }
}

customElements.define('glyph-editor', GlyphEditor)
