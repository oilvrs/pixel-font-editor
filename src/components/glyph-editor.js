/**
 * Pixel glyph editor component.
 * Draws pixelated glyphs on an 8, 16, 32, 64 or 128 grid.
 *
 * - pen / eraser: drag to draw. Right click or shift erases. The brush is a
 *   square of 1 to 32 cells.
 * - select: drag a rectangle. Drag inside it to move the pixels, drag a
 *   handle to resize, drag just outside a corner to rotate. Shift keeps the
 *   proportions and snaps rotation to 45°. Without shift both are free.
 *   Enter or a click outside places the pixels, esc cancels.
 * - cmd/ctrl+c copies the selection, cmd/ctrl+v pastes it as floating pixels.
 * - cmd/ctrl+z undoes, cmd/ctrl+shift+z redoes.
 *
 * Every grid size has its own drawing and its own undo history. The grids
 * are drawing surfaces only, nothing is converted between sizes.
 *
 * @version 0.5.0
 */

import {
  createGrid,
  clearGrid,
  isEmpty,
  drawLine,
  extractRegion,
  pasteRegion,
  clearRegion,
  pixelsEqual
} from '../core/grid.js'
import { createHistory, pushState, undoState, redoState } from '../core/history.js'
import { getMetrics } from '../metrics.js'
import {
  renderTransformed,
  toLocal,
  fromLocal,
  transformCorners,
  resizeTransform,
  rotatedAngle
} from '../core/transform.js'

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
  descender: '#7a7a7a'
}

const MAX_BRUSH = 32

// Resize handles as [hx, hy] along the local axes of the frame. Corners first, so they win over edges.
const HANDLES = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
]

const HANDLE_DRAW_CSS = 8 // Drawn handle size, CSS px
const ROTATE_ZONE_CSS = 18 // How far outside a corner a drag rotates, CSS px
const MIN_EDGE_HANDLE_CSS = 16 // Edge handles are left out on sides shorter than this, CSS px

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

/**
 * Converts radians to degrees in the range -180 to 180, rounded to one decimal.
 * @param {number} angle
 * @returns {number}
 */
function degrees(angle) {
  let deg = ((angle * 180) / Math.PI) % 360
  if (deg > 180) deg -= 360
  if (deg <= -180) deg += 360
  return Math.round(deg * 10) / 10
}

/**
 * The resize handles that fit on a frame. Edge handles are left out on
 * sides that are too short on screen.
 * @param {Object} t - transform
 * @param {number} cssPerCell - CSS px per grid cell
 * @returns {number[][]} [[hx, hy], ...]
 */
function visibleHandles(t, cssPerCell) {
  const width = Math.abs(t.w) * cssPerCell
  const height = Math.abs(t.h) * cssPerCell

  return HANDLES.filter(([hx, hy]) => {
    if (hx !== 0 && hy !== 0) return true
    return hy === 0 ? height >= MIN_EDGE_HANDLE_CSS : width >= MIN_EDGE_HANDLE_CSS
  })
}

/**
 * The resize cursor that matches a handle, taking the rotation into account.
 * @param {number} hx
 * @param {number} hy
 * @param {number} angle - radians
 * @returns {string}
 */
function cursorForHandle(hx, hy, angle) {
  const direction = Math.atan2(hy, hx) + angle
  const index = ((Math.round(direction / (Math.PI / 4)) % 4) + 4) % 4
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][index]
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

    this.dragMode = null // null, 'stroke', 'marquee', 'liftpending', 'move', 'resize' or 'rotate'
    this.erasing = false // Locked at pointerdown, so a stroke never switches mode
    this.lastCell = null // Previous cell of the stroke, used to interpolate
    this.strokeStart = null // Pixels before the stroke, pushed to history if it changed anything
    this.strokeChanged = false
    this.marquee = null // { start, moved } while a selection is dragged
    this.liftStart = null // Cell where a drag inside the selection began, before anything is lifted
    this.liftPoint = null // The same position as a precise point
    this.dragStart = null // { type, point, cell, transform, hx, hy } while moving, resizing or rotating

    this.selection = null // { x, y, width, height } or null
    this.clipboard = null // { width, height, pixels }, shared between grid sizes
    this.floating = null // { source, cx, cy, w, h, angle, before, origin, cache }: pixels not yet placed
    this.hoverCell = null // Cell under the pointer, for the brush preview
    this.hoverPoint = null // Precise pointer position in grid coordinates, for handles and cursors

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
   * cmd/ctrl+v paste, enter place, esc cancel, arrows nudge selected or
   * floating pixels, [ ] or - + change brush size, b / e / m pick a tool.
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

      this.updateFloating({
        cx: this.floating.cx + arrows[key][0],
        cy: this.floating.cy + arrows[key][1]
      })
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
   * Converts a pointer position to a precise position in grid coordinates
   * (cells, with decimals). Positions outside the canvas give coordinates
   * outside the grid.
   * @param {PointerEvent} e
   * @returns {Object} { x, y }
   */
  pointFromEvent(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * this.size,
      y: ((e.clientY - rect.top) / rect.height) * this.size
    }
  }

  /**
   * The cell a precise position falls in.
   * @param {Object} point - { x, y }
   * @returns {Object} { x, y }
   */
  cellOf(point) {
    return { x: Math.floor(point.x), y: Math.floor(point.y) }
  }

  /**
   * Remembers the cell under the pointer for the brush preview.
   * @param {Object} cell - { x, y }
   * @returns {boolean} true if it changed
   */
  setHover(cell) {
    const inside = cell.x >= 0 && cell.y >= 0 && cell.x < this.size && cell.y < this.size
    const next = inside ? cell : null
    const same = next && this.hoverCell && next.x === this.hoverCell.x && next.y === this.hoverCell.y

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
   * The frame that can be grabbed right now, as a transform: the floating
   * pixels, or the selection while the select tool is active.
   * @returns {Object|null} { cx, cy, w, h, angle }
   */
  currentFrame() {
    if (this.floating) return this.floating

    if (this.tool === 'select' && this.selection && this.dragMode !== 'marquee') {
      const { x, y, width, height } = this.selection
      return { cx: x + width / 2, cy: y + height / 2, w: width, h: height, angle: 0 }
    }

    return null
  }

  /**
   * Finds what a position is over on a frame: a resize handle, the inside
   * (move) or the zone just outside a corner (rotate). Distances are
   * measured in screen px, so handles keep a usable size at every zoom.
   * @param {Object} frame - transform
   * @param {Object} point - { x, y } in grid coordinates
   * @returns {Object|null} { type: 'resize', hx, hy } | { type: 'move' } | { type: 'rotate' } | null
   */
  hitTest(frame, point) {
    const canvas = this.shadowRoot.getElementById('canvas')
    const css = canvas.getBoundingClientRect().width / this.size // CSS px per cell
    const local = toLocal(frame, point.x, point.y)
    const halfW = Math.abs(frame.w) / 2
    const halfH = Math.abs(frame.h) / 2
    const radius = clamp((Math.min(halfW, halfH) * 2 * css) / 3, 2, 7)

    for (const [hx, hy] of visibleHandles(frame, css)) {
      const dx = (local.x - hx * halfW) * css
      const dy = (local.y - hy * halfH) * css
      if (Math.abs(dx) <= radius && Math.abs(dy) <= radius) return { type: 'resize', hx, hy }
    }

    if (Math.abs(local.x) <= halfW && Math.abs(local.y) <= halfH) return { type: 'move' }

    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const dx = (local.x - sx * halfW) * css
      const dy = (local.y - sy * halfH) * css
      if (Math.hypot(dx, dy) <= ROTATE_ZONE_CSS) return { type: 'rotate' }
    }

    return null
  }

  /**
   * Starts moving, resizing or rotating the floating pixels.
   * @param {Object} hit - { type, hx, hy } from hitTest
   * @param {Object} point - pointer position in grid coordinates
   * @param {Object} cell - the cell under the pointer
   */
  beginTransform(hit, point, cell) {
    const { cx, cy, w, h, angle } = this.floating

    this.dragMode = hit.type
    this.dragStart = { type: hit.type, point, cell, transform: { cx, cy, w, h, angle }, hx: hit.hx, hy: hit.hy }
  }

  /**
   * Starts a drag. Depending on what is under the pointer and the tool, it
   * moves, resizes or rotates the selected or floating pixels, drags a new
   * selection or starts a stroke. Right click, shift or the eraser tool
   * erases.
   * @param {PointerEvent} e
   */
  onPointerDown(e) {
    if (e.button === 1) return // Ignore middle click

    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId) // Keeps the drag going outside the canvas

    const point = this.pointFromEvent(e)
    const cell = this.cellOf(point)
    const frame = this.currentFrame()

    if (frame) {
      const hit = this.hitTest(frame, point)

      if (hit && hit.type === 'move' && !this.floating) {
        // The pixels are lifted on the first movement, so a plain click changes nothing
        this.dragMode = 'liftpending'
        this.liftStart = cell
        this.liftPoint = point
        return
      }

      if (hit) {
        if (!this.floating) this.liftSelection()
        this.beginTransform(hit, point, cell)
        return
      }

      if (this.floating) this.commitFloating() // A click away from the frame places the pixels
    }

    if (this.tool === 'select') {
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
   * preview and cursors. Strokes draw a line from the previous cell so fast
   * movement leaves no gaps. Shift is read on every move, so it can be
   * pressed or released during a resize or rotation.
   * @param {PointerEvent} e
   */
  onPointerMove(e) {
    const point = this.pointFromEvent(e)
    const cell = this.cellOf(point)
    this.hoverPoint = point
    let redraw = this.setHover(cell)

    if (this.dragMode === 'liftpending' && (cell.x !== this.liftStart.x || cell.y !== this.liftStart.y)) {
      this.liftSelection()
      this.beginTransform({ type: 'move' }, this.liftPoint, this.liftStart)
      redraw = true
    }

    if (this.dragMode === 'stroke') {
      if (cell.x !== this.lastCell.x || cell.y !== this.lastCell.y) {
        const changed = drawLine(this.grid, this.lastCell.x, this.lastCell.y, cell.x, cell.y, !this.erasing, this.brushSize)
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
    } else if (this.dragMode === 'move') {
      const { cell: startCell, transform } = this.dragStart
      this.updateFloating({
        cx: transform.cx + (cell.x - startCell.x),
        cy: transform.cy + (cell.y - startCell.y)
      })
      redraw = true
    } else if (this.dragMode === 'resize') {
      const { transform, hx, hy } = this.dragStart
      const local = toLocal(transform, point.x, point.y)
      this.updateFloating(resizeTransform(transform, hx, hy, local, e.shiftKey, this.size * 2))
      redraw = true
    } else if (this.dragMode === 'rotate') {
      const { transform, point: from } = this.dragStart
      this.updateFloating({ angle: rotatedAngle(transform, from, point, e.shiftKey) })
      redraw = true
    }

    if (redraw) this.draw()
    else this.updateCursor()
  }

  /**
   * Hides the brush preview when the pointer leaves the canvas.
   */
  onPointerLeave() {
    if (this.dragMode) return

    this.hoverPoint = null
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
    this.liftStart = null
    this.liftPoint = null
    this.dragStart = null
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
    const x = clamp(anchor.x, 0, Math.max(0, this.size - width))
    const y = clamp(anchor.y, 0, Math.max(0, this.size - height))

    this.floating = {
      source: this.clipboard,
      cx: x + width / 2,
      cy: y + height / 2,
      w: width,
      h: height,
      angle: 0,
      before: null, // A paste has no lift, so the undo state is taken when it is placed
      origin: null,
      cache: null
    }

    this.updateNotice()
    this.draw()
    return true
  }

  /**
   * Lifts the selected pixels out of the grid and makes them floating. The
   * state from before the lift is kept, so the whole change is one undo
   * step and can be cancelled.
   * @returns {Object|null} the floating pixels, or null if nothing is selected
   */
  liftSelection() {
    if (!this.selection) return null

    const { grid } = this.session
    const { x, y, width, height } = this.selection

    this.floating = {
      source: extractRegion(grid, x, y, width, height),
      cx: x + width / 2,
      cy: y + height / 2,
      w: width,
      h: height,
      angle: 0,
      before: grid.pixels.slice(), // Restored on cancel, pushed to history on place
      origin: this.selection,
      cache: null
    }

    clearRegion(grid, x, y, width, height)
    this.selection = null
    this.updateNotice()

    return this.floating
  }

  /**
   * Changes the transform of the floating pixels.
   * @param {Object} changes - any of cx, cy, w, h, angle
   */
  updateFloating(changes) {
    Object.assign(this.floating, changes)
    this.floating.cache = null
    this.updateNotice()
  }

  /**
   * The floating pixels as they look with the current transform. The result
   * is kept until the transform changes.
   * @returns {Object} { region, x, y }
   */
  floatingImage() {
    if (!this.floating.cache) {
      this.floating.cache = renderTransformed(this.floating.source, this.floating)
    }
    return this.floating.cache
  }

  /**
   * Places the floating pixels in the grid and selects them. If nothing
   * changed compared to before the lift or paste, no undo step is added.
   */
  commitFloating() {
    if (!this.floating) return

    const { grid, history } = this.session
    const image = this.floatingImage()
    const start = this.floating.before || grid.pixels.slice()

    this.floating = null
    pasteRegion(grid, image.region, image.x, image.y)
    if (!pixelsEqual(grid.pixels, start)) pushState(history, start)

    this.selection = this.rectInsideGrid(image.x, image.y, image.region.width, image.region.height)
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
   * Steps back one change in the active grid. While pixels float, it
   * cancels them instead.
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
    this.hoverPoint = null
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
   * cancelled first.
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
    this.shadowRoot.querySelector('glyph-toolbar').setAttribute('guides', this.showGuides ? 'on' : 'off')
    this.shadowRoot.getElementById('legend').classList.toggle('hidden', !this.showGuides)
    this.draw()
  }

  /**
   * Shows a passive text line under the canvas: the size and angle of
   * floating pixels, and a note about low resolution.
   */
  updateNotice() {
    const parts = []

    if (this.floating) {
      const { w, h, angle } = this.floating
      parts.push(`floating ${Math.abs(w)}×${Math.abs(h)} px, ${degrees(angle)}° · enter to place, esc to cancel`)
    }
    if (this.size <= 16) parts.push('low resolution: fine details can disappear')

    this.shadowRoot.getElementById('notice').textContent = parts.join(' · ')
  }

  /**
   * Sets the cursor: a resize cursor over handles, a move cursor over
   * pixels that can be dragged and a grab cursor in the rotation zone.
   */
  updateCursor() {
    const canvas = this.shadowRoot.getElementById('canvas')
    let cursor = 'crosshair'

    if (this.dragMode === 'move' || this.dragMode === 'liftpending') {
      cursor = 'move'
    } else if (this.dragMode === 'rotate') {
      cursor = 'grabbing'
    } else if (this.dragMode === 'resize') {
      cursor = cursorForHandle(this.dragStart.hx, this.dragStart.hy, this.dragStart.transform.angle)
    } else if (!this.dragMode && this.hoverPoint) {
      const frame = this.currentFrame()
      const hit = frame && this.hitTest(frame, this.hoverPoint)

      if (hit && hit.type === 'move') cursor = 'move'
      else if (hit && hit.type === 'rotate') cursor = 'grab'
      else if (hit && hit.type === 'resize') cursor = cursorForHandle(hit.hx, hit.hy, frame.angle)
    }

    canvas.style.cursor = cursor
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
    const view = { ctx, size, cell, line, total, dpr }

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
    else if (this.selection) this.drawSelection(view)

    this.drawHover(view)
    this.updateCursor()
  }

  /**
   * Draws the guide lines on top of the pixels, centered on their row
   * boundary. Lines at the grid edge are kept inside the canvas.
   * @param {Object} view - { ctx, size, cell, line, total, dpr }
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
   * Draws the floating pixels in blue, so they read as not placed yet, with
   * their frame and handles.
   * @param {Object} view - { ctx, size, cell, line, total, dpr }
   */
  drawFloating(view) {
    const { ctx, size, cell } = view
    const { region, x, y } = this.floatingImage()

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

    this.drawFrame(view, this.floating)
  }

  /**
   * Draws the selection. With the select tool it gets handles. Otherwise,
   * and while it is being dragged out, it is a plain dashed rectangle.
   * @param {Object} view - { ctx, size, cell, line, total, dpr }
   */
  drawSelection(view) {
    const frame = this.currentFrame()

    if (frame) {
      this.drawFrame(view, frame)
    } else {
      const { x, y, width, height } = this.selection
      this.strokeMarquee(view, x, y, width, height)
    }
  }

  /**
   * Draws a dashed black-and-white outline around a transform frame, and
   * its resize handles.
   * @param {Object} view - { ctx, size, cell, line, total, dpr }
   * @param {Object} t - transform
   */
  drawFrame({ ctx, size, cell, line, dpr }, t) {
    const corners = transformCorners(t)

    const tracePath = () => {
      ctx.beginPath()
      corners.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x * cell, p.y * cell)
        else ctx.lineTo(p.x * cell, p.y * cell)
      })
      ctx.closePath()
    }

    ctx.lineWidth = line * 2
    ctx.setLineDash([])
    ctx.strokeStyle = '#ffffff'
    tracePath()
    ctx.stroke()

    ctx.setLineDash([line * 4, line * 4])
    ctx.strokeStyle = '#000000'
    tracePath()
    ctx.stroke()
    ctx.setLineDash([])

    const half = Math.round((HANDLE_DRAW_CSS * dpr) / 2)
    ctx.lineWidth = line
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#000000'

    for (const [hx, hy] of visibleHandles(t, CELL_PX[size])) {
      const p = fromLocal(t, (hx * Math.abs(t.w)) / 2, (hy * Math.abs(t.h)) / 2)
      const px = Math.round(p.x * cell)
      const py = Math.round(p.y * cell)

      ctx.fillRect(px - half, py - half, half * 2, half * 2)
      ctx.strokeRect(px - half + line / 2, py - half + line / 2, half * 2 - line, half * 2 - line)
    }
  }

  /**
   * Draws a dashed black-and-white outline around a rectangle of cells, kept
   * inside the canvas.
   * @param {Object} view - { ctx, size, cell, line, total, dpr }
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
   * @param {Object} view - { ctx, size, cell, line, total, dpr }
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

    ctx.fillStyle = this.erasing || this.tool === 'eraser' ? 'rgba(255, 0, 0, 0.35)' : 'rgba(128, 128, 128, 0.5)'
    ctx.fillRect(left * cell, top * cell, (right - left) * cell, (bottom - top) * cell)
  }
}

customElements.define('glyph-editor', GlyphEditor)
