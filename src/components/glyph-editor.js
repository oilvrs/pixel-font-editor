/**
 * Pixel glyph editor component.
 * Draws pixelated glyphs, with vector shapes on top, on an 8, 16, 32, 64
 * or 128 grid.
 *
 * - Every grid size has its own set of glyphs. Every glyph has its own
 *   pixels, shapes and undo history. Everything and the side margin are
 *   saved automatically in localStorage.
 * - pen / eraser: drag to draw. Right click or shift erases. The brush is a
 *   square of 1 to 32 cells. The eraser does not touch shapes.
 * - select: drag a rectangle. Drag inside it to move the pixels, drag a
 *   handle to resize, drag just outside a corner to rotate. Shift keeps the
 *   proportions and snaps rotation to 45°. Without shift both are free.
 *   Enter or a click outside places the pixels, esc cancels. Clicking a
 *   shape selects it.
 * - shapes: click or drag to place a rectangle, ellipse, quarter circle,
 *   concave corner or triangle. Shift makes it square. A selected shape
 *   has the same handles as selected pixels. R rotates it 90°.
 * - delete removes the selected shape, or the selected pixels.
 * - cmd/ctrl+c copies the selected pixels or shape, cmd/ctrl+v pastes.
 * - cmd/ctrl+z undoes, cmd/ctrl+shift+z redoes.
 * - , and . step through the glyphs, g shows or hides the glyph sidebar,
 *   t moves to the text preview.
 *
 * @version 0.7.0
 */

import {
  SIZES,
  createGrid,
  clearGrid,
  drawLine,
  extractRegion,
  pasteRegion,
  clearRegion,
  pixelsEqual
} from '../core/grid.js'
import { createHistory, pushState, undoState, redoState } from '../core/history.js'
import { getMetrics, defaultMargin } from '../metrics.js'
import { buildSvg } from '../core/export-svg.js'
import { buildUfo, safeFileName } from '../core/export-ufo.js'
import { createZip } from '../core/zip.js'
import { createBackup, parseBackup } from '../core/backup.js'
import { glyphName, exportFileName } from '../core/glyph-names.js'
import { ALL_GLYPHS } from '../core/glyph-set.js'
import { glyphIsEmpty, glyphBounds, cloneShapes, serializeGlyph, deserializeGlyph } from '../core/glyph.js'
import { SHAPE_TYPES, shapeContains } from '../core/shapes.js'
import {
  renderTransformed,
  toLocal,
  fromLocal,
  transformCorners,
  resizeTransform,
  rotatedAngle
} from '../core/transform.js'
import { paintShapes } from '../utils/paint-shapes.js'
import { gridToPngBlob } from '../utils/export-png.js'
import { downloadText, downloadBlob } from '../utils/download.js'
import {
  loadGlyph,
  saveGlyph,
  loadMargin,
  saveMargin,
  loadName,
  saveName,
  loadPanelOpen,
  savePanelOpen,
  clearAll as clearAllSaved
} from '../utils/storage.js'

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
const SAVE_DELAY = 300 // ms between a change and the save to localStorage

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
    this.sets = new Map() // size -> { margin, name, glyphs: Map(char -> { grid, shapes, history }) }, loaded on first use
    this.currentChar = 'A' // The glyph being drawn
    this.panelOpen = loadPanelOpen() // The glyph sidebar is open by default and remembers its state
    this.copyMode = false // The next glyph picked in the panel receives a copy of the current drawing
    this.tool = 'pen' // 'pen', 'eraser', 'select' or 'shapes'
    this.shapeType = 'rect' // The shape the shapes tool places
    this.showGuides = true // Guide lines on or off
    this.brushSize = 1 // Side of the square brush, in cells
    this.pngTransparent = true // PNG background: transparent or white
    this.message = '' // Short message about the last action, shown under the canvas
    this.messageTimer = null

    this.dirty = new Map() // 'size:char' -> { size, char }: glyphs that have changed since the last save
    this.saveTimer = null
    this.previewFrame = null

    this.dragMode = null // null, 'stroke', 'marquee', 'create', 'liftpending', 'move', 'resize' or 'rotate'
    this.dragTarget = null // 'shape' or 'floating' while moving, resizing or rotating
    this.erasing = false // Locked at pointerdown, so a stroke never switches mode
    this.lastCell = null // Previous cell of the stroke, used to interpolate
    this.strokeStart = null // Snapshot before the drag, pushed to history if it changed anything
    this.strokeChanged = false
    this.marquee = null // { start, moved } while a selection is dragged
    this.createStart = null // Cell where a new shape was started
    this.liftStart = null // Cell where a drag inside the selection began, before anything is lifted
    this.liftPoint = null // The same position as a precise point
    this.dragStart = null // { type, point, cell, transform, hx, hy } while moving, resizing or rotating

    this.selection = null // { x, y, width, height } or null
    this.selectedShape = null // Index of the selected shape in the current glyph, or null
    this.clipboardKind = null // 'pixels' or 'shape': what was copied last
    this.clipboard = null // { width, height, pixels }, shared between grid sizes and glyphs
    this.shapeClipboard = null // A copied shape
    this.floating = null // { source, cx, cy, w, h, angle, before, origin, cache }: pixels not yet placed
    this.hoverCell = null // Cell under the pointer, for the brush preview
    this.hoverPoint = null // Precise pointer position in grid coordinates, for handles and cursors

    this.onKeyDown = this.onKeyDown.bind(this)
    this.onResize = this.onResize.bind(this)
    this.onPageHide = this.onPageHide.bind(this)
  }

  /**
   * The glyph sidebar on the left.
   * @returns {HTMLElement}
   */
  get panel() {
    return this.shadowRoot.querySelector('glyph-panel')
  }

  /**
   * The text preview.
   * @returns {HTMLElement}
   */
  get preview() {
    return this.shadowRoot.querySelector('glyph-preview')
  }

  /**
   * The bar with tools and brush size.
   * @returns {HTMLElement}
   */
  get toolbar() {
    return this.shadowRoot.querySelector('glyph-toolbar')
  }

  /**
   * The settings panel on the right.
   * @returns {HTMLElement}
   */
  get settings() {
    return this.shadowRoot.querySelector('glyph-settings')
  }

  /**
   * The glyph set of a grid size: its side margin, font name and glyphs.
   * Loaded from localStorage the first time a size is used.
   * @param {number} size
   * @returns {Object} { margin, name, glyphs }
   */
  setFor(size) {
    if (!this.sets.has(size)) this.sets.set(size, this.loadSet(size))
    return this.sets.get(size)
  }

  /**
   * The glyph set of the active grid size.
   * @returns {Object} { margin, name, glyphs }
   */
  get set() {
    return this.setFor(this.size)
  }

  /**
   * The pixels, shapes and history of the current glyph.
   * @returns {Object} { grid, shapes, history }
   */
  get session() {
    return this.recordFor(this.currentChar)
  }

  /**
   * The grid of the current glyph.
   * @returns {Object}
   */
  get grid() {
    return this.session.grid
  }

  /**
   * Loads the saved glyphs and margin of a grid size.
   * @param {number} size
   * @returns {Object} { margin, name, glyphs }
   */
  loadSet(size) {
    const savedMargin = loadMargin(size)
    const set = {
      margin: savedMargin === null ? defaultMargin(size) : clamp(savedMargin, 0, Math.floor(size / 4)),
      name: loadName(size) || 'Pixel Font',
      glyphs: new Map()
    }

    for (const char of ALL_GLYPHS) {
      const data = loadGlyph(size, char)
      if (!data || data.size !== size) continue

      try {
        set.glyphs.set(char, { ...deserializeGlyph(data), history: createHistory() })
      } catch (error) {
        continue // A damaged entry is skipped
      }
    }

    return set
  }

  /**
   * The record of a glyph in the active size. Created empty if the glyph
   * has not been used.
   * @param {string} char
   * @returns {Object} { grid, shapes, history }
   */
  recordFor(char) {
    const { glyphs } = this.set

    if (!glyphs.has(char)) {
      glyphs.set(char, { grid: createGrid(this.size), shapes: [], history: createHistory() })
    }

    return glyphs.get(char)
  }

  /**
   * The record of a glyph if it has a drawing, otherwise null. Used by the
   * panel and the text preview.
   * @param {string} char
   * @returns {Object|null}
   */
  peekGlyph(char) {
    const record = this.set.glyphs.get(char)
    return record && !glyphIsEmpty(record) ? record : null
  }

  /**
   * A copy of the pixels and shapes of a glyph, for the undo history.
   * @param {Object} record - the current glyph by default
   * @returns {Object} { pixels, shapes }
   */
  snapshot(record = this.session) {
    return { pixels: record.grid.pixels.slice(), shapes: cloneShapes(record.shapes) }
  }

  /**
   * Puts a snapshot back into a glyph.
   * @param {Object} record
   * @param {Object} snapshot - { pixels, shapes }
   */
  restoreSnapshot(record, snapshot) {
    record.grid.pixels.set(snapshot.pixels)
    record.shapes = cloneShapes(snapshot.shapes)
  }

  /**
   * The selected shape, if there is one.
   * @returns {Object|null}
   */
  selectedShapeObject() {
    return this.selectedShape === null ? null : this.session.shapes[this.selectedShape] || null
  }

  /**
   * Called whenever the element is added to the DOM.
   */
  connectedCallback() {
    this.render()
    this.setUpEventListeners()

    this.panel.source = () => ({
      current: this.currentChar,
      copyMode: this.copyMode,
      size: this.size,
      getGlyph: (char) => this.peekGlyph(char)
    })
    this.preview.source = () => ({
      size: this.size,
      margin: this.set.margin,
      getGlyph: (char) => this.peekGlyph(char)
    })

    this.syncToolbar()
    this.panel.rebuild()
    this.preview.refresh()
    this.updateNotice()
    this.draw()
  }

  /**
   * Called whenever the element is removed from the DOM.
   */
  disconnectedCallback() {
    this.flushSaves()
    clearTimeout(this.messageTimer)
    cancelAnimationFrame(this.previewFrame)
    document.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('pagehide', this.onPageHide)
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
        }

        .layout {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto; /* Side panels have fixed widths and take no space when hidden */
          align-items: start;
        }

        .main {
          box-sizing: border-box;
          width: 100%;
          max-width: 1000px;
          margin: 0 auto;
          padding: 1.5rem 2rem;
          min-width: 0;
        }

        .stage {
          overflow: auto;
          padding: 1px; /* Room for the outline, which overflow would clip */
        }

        .canvas {
          display: block;
          margin: 0 auto;
          outline: 1px solid #000000;
          background: #ffffff;
          cursor: crosshair;
          touch-action: none;
        }

        .legend {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
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
          text-align: center;
          min-height: 1.4em;
          margin: 0.75rem 0 0 0;
        }

        glyph-preview {
          margin-top: 1.5rem;
        }
      </style>

      <div class="layout">
        <glyph-panel ${this.panelOpen ? '' : 'hidden'}></glyph-panel>
        <div class="main">
          <glyph-toolbar
            tool="${this.tool}"
            shape="${this.shapeType}"
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
          <glyph-preview></glyph-preview>
        </div>
        <glyph-settings
          size="${this.size}"
          margin="${this.set.margin}"
          png-bg="${this.pngTransparent ? 'transparent' : 'white'}"
        ></glyph-settings>
      </div>
    `
  }

  /**
   * Sets up pointer events on the canvas, keyboard shortcuts, the toolbar,
   * the settings panel and the glyph sidebar.
   */
  setUpEventListeners() {
    const canvas = this.shadowRoot.getElementById('canvas')
    const { toolbar, settings } = this

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e))
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e))
    canvas.addEventListener('pointerup', () => this.endDrag())
    canvas.addEventListener('pointercancel', () => this.endDrag())
    canvas.addEventListener('pointerleave', () => this.onPointerLeave())
    canvas.addEventListener('contextmenu', (e) => e.preventDefault()) // Right click is the eraser

    toolbar.addEventListener('tool-change', (e) => this.setTool(e.detail.tool))
    toolbar.addEventListener('shape-change', (e) => this.setShapeType(e.detail.shape))
    toolbar.addEventListener('brush-step', (e) => this.changeBrush(e.detail.delta))
    toolbar.addEventListener('clear', () => this.clear())
    toolbar.addEventListener('guides-toggle', () => this.toggleGuides())

    settings.addEventListener('size-change', (e) => this.setSize(e.detail.size))
    settings.addEventListener('glyph-step', (e) => this.stepGlyph(e.detail.delta))
    settings.addEventListener('panel-toggle', () => this.togglePanel())
    settings.addEventListener('copy-start', () => this.startCopy())
    settings.addEventListener('margin-step', (e) => this.changeMargin(e.detail.delta))
    settings.addEventListener('png-bg-toggle', () => this.togglePngBackground())
    settings.addEventListener('export', (e) => this.exportGlyph(e.detail.format))
    settings.addEventListener('name-change', (e) => this.setFontName(e.detail.name))
    settings.addEventListener('export-all', (e) => this.exportAll(e.detail.format))
    settings.addEventListener('backup', () => this.backup())
    settings.addEventListener('restore', () => this.pickBackupFile())

    this.panel.addEventListener('glyph-pick', (e) => this.onGlyphPick(e.detail.char))
    this.panel.addEventListener('panel-close', () => this.togglePanel(false))

    document.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('resize', this.onResize) // Browser zoom changes the pixel density
    window.addEventListener('pagehide', this.onPageHide) // Save before the page goes away
  }

  /**
   * Handles keyboard shortcuts:
   * cmd/ctrl+z undo, cmd/ctrl+shift+z or ctrl+y redo, cmd/ctrl+c copy,
   * cmd/ctrl+v paste, enter place, esc cancel, delete remove, arrows nudge
   * selected or floating pixels or a shape, r rotates a shape 90°,
   * [ ] or - + change brush size, b / e / m / s pick a tool,
   * , and . step through glyphs, g glyph sidebar, t text preview.
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
      else if (this.selectedShape !== null) this.deselectShape()
      else if (this.selection) this.clearSelection()
      else if (this.copyMode) this.cancelCopy()
    } else if (key === 'delete' || key === 'backspace') {
      if (this.deleteSelected()) e.preventDefault()
    } else if (
      arrows[key] &&
      (this.floating || this.selectedShape !== null || (this.tool === 'select' && this.selection))
    ) {
      e.preventDefault()
      const [dx, dy] = arrows[key]

      if (this.selectedShape !== null) {
        this.nudgeShape(dx, dy)
      } else {
        if (!this.floating) this.liftSelection()
        this.updateFloating({ cx: this.floating.cx + dx, cy: this.floating.cy + dy })
        this.draw()
      }
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
    } else if (key === 's') {
      this.setTool('shapes')
    } else if (key === 'r') {
      this.rotateSelectedShape(e.shiftKey ? -1 : 1)
    } else if (key === ',') {
      this.stepGlyph(-1)
    } else if (key === '.') {
      this.stepGlyph(1)
    } else if (key === 'g') {
      this.togglePanel()
    } else if (key === 't') {
      e.preventDefault() // So the letter is not typed into the text field
      this.preview.focusText()
    }
  }

  /**
   * Redraws when the window or browser zoom changes.
   */
  onResize() {
    this.draw()
  }

  /**
   * Saves everything that has changed when the page is hidden or closed.
   */
  onPageHide() {
    this.flushSaves()
  }

  /**
   * Notes that a glyph has changed: it is saved shortly after, and the
   * text preview is redrawn on the next frame.
   * @param {string} char - the glyph that changed, the current one by default
   */
  markChanged(char = this.currentChar) {
    this.dirty.set(`${this.size}:${char}`, { size: this.size, char })

    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flushSaves(), SAVE_DELAY)

    this.requestPreview()
  }

  /**
   * Redraws the text preview on the next animation frame. Several changes
   * in one frame give one redraw.
   */
  requestPreview() {
    if (this.previewFrame) return

    this.previewFrame = requestAnimationFrame(() => {
      this.previewFrame = null
      this.preview.refresh()
    })
  }

  /**
   * Writes every changed glyph to localStorage and updates its box in the
   * panel. Empty glyphs are removed from storage.
   */
  flushSaves() {
    clearTimeout(this.saveTimer)
    let failed = false

    for (const { size, char } of this.dirty.values()) {
      const record = this.sets.get(size)?.glyphs.get(char)
      const data = record && !glyphIsEmpty(record) ? serializeGlyph(record) : null

      if (!saveGlyph(size, char, data)) failed = true
      if (size === this.size) this.panel.refreshGlyph(char)
    }

    this.dirty.clear()
    if (failed) this.flash('could not save: browser storage is full or blocked')
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
   * Builds a shape from the cell where a drag started to the cell it has
   * reached. The right angle of quarter, concave and triangle ends up at the
   * start cell, since a drag to the left or upwards mirrors the shape.
   * @param {Object} start - { x, y } cell
   * @param {Object} current - { x, y } cell
   * @param {boolean} square - make width and height equal
   * @returns {Object} shape
   */
  makeShape(start, current, square) {
    const max = this.size - 1
    const end = { x: clamp(current.x, 0, max), y: clamp(current.y, 0, max) }

    let width = Math.abs(end.x - start.x) + 1
    let height = Math.abs(end.y - start.y) + 1
    if (square) width = height = Math.max(width, height)

    const flipX = end.x < start.x
    const flipY = end.y < start.y
    const left = flipX ? start.x - width + 1 : start.x
    const top = flipY ? start.y - height + 1 : start.y

    return {
      type: this.shapeType,
      cx: left + width / 2,
      cy: top + height / 2,
      w: flipX ? -width : width,
      h: flipY ? -height : height,
      angle: 0
    }
  }

  /**
   * The topmost shape under a position, if any.
   * @param {Object} point - { x, y } in grid coordinates
   * @returns {number|null} index in the shape list
   */
  shapeAt(point) {
    const { shapes } = this.session

    for (let i = shapes.length - 1; i >= 0; i--) {
      if (shapeContains(shapes[i], point.x, point.y)) return i
    }

    return null
  }

  /**
   * Selects a shape. Floating pixels are placed and the pixel selection is dropped.
   * @param {number} index
   */
  selectShape(index) {
    this.commitFloating()
    this.selection = null
    this.selectedShape = index
    this.updateNotice()
    this.draw()
  }

  /**
   * Deselects the shape.
   */
  deselectShape() {
    this.selectedShape = null
    this.updateNotice()
    this.draw()
  }

  /**
   * Adds a copy of a shape to the current glyph and selects it. This is an undo step.
   * @param {Object} shape
   */
  addShape(shape) {
    const record = this.session

    pushState(record.history, this.snapshot())
    record.shapes.push({ ...shape })

    this.selection = null
    this.selectedShape = record.shapes.length - 1
    this.markChanged()
    this.updateNotice()
    this.draw()
  }

  /**
   * The frame that can be grabbed right now, as a transform: the selected
   * shape, the floating pixels, or the selection while the select tool is
   * active.
   * @returns {Object|null} { cx, cy, w, h, angle }
   */
  currentFrame() {
    if (this.selectedShape !== null) return this.selectedShapeObject()
    if (this.floating) return this.floating

    if (this.tool === 'select' && this.selection && this.dragMode !== 'marquee') {
      const { x, y, width, height } = this.selection
      return { cx: x + width / 2, cy: y + height / 2, w: width, h: height, angle: 0 }
    }

    return null
  }

  /**
   * The object a move, resize or rotation changes: the selected shape or
   * the floating pixels.
   * @returns {Object|null}
   */
  transformTarget() {
    return this.selectedShape !== null ? this.selectedShapeObject() : this.floating
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
   * Starts moving, resizing or rotating the selected shape or the floating
   * pixels. For a shape, the state before the drag is kept for undo.
   * @param {Object} hit - { type, hx, hy } from hitTest
   * @param {Object} point - pointer position in grid coordinates
   * @param {Object} cell - the cell under the pointer
   */
  beginTransform(hit, point, cell) {
    const { cx, cy, w, h, angle } = this.transformTarget()

    this.dragMode = hit.type
    this.dragTarget = this.selectedShape !== null ? 'shape' : 'floating'
    this.dragStart = { type: hit.type, point, cell, transform: { cx, cy, w, h, angle }, hx: hit.hx, hy: hit.hy }

    if (this.dragTarget === 'shape') {
      this.strokeStart = this.snapshot()
      this.strokeChanged = false
    }
  }

  /**
   * Applies a change to the selected shape or the floating pixels.
   * @param {Object} changes - any of cx, cy, w, h, angle
   */
  applyTransform(changes) {
    const target = this.transformTarget()

    if (this.dragTarget === 'shape') {
      if (!Object.keys(changes).some((key) => target[key] !== changes[key])) return

      Object.assign(target, changes)
      this.strokeChanged = true
      this.markChanged()
      this.updateNotice()
    } else {
      this.updateFloating(changes)
    }
  }

  /**
   * Starts a drag. Depending on what is under the pointer and the tool, it
   * moves, resizes or rotates the selected shape, selected pixels or
   * floating pixels, selects a shape, places a new shape, drags a new
   * selection or starts a stroke. Right click, shift or the eraser tool
   * erases.
   * @param {PointerEvent} e
   */
  onPointerDown(e) {
    if (e.button === 1) return // Ignore middle click

    e.preventDefault()
    this.preview.blurText() // Shortcuts work again after typing in the text preview
    this.settings.blurInputs()
    e.currentTarget.setPointerCapture(e.pointerId) // Keeps the drag going outside the canvas

    const point = this.pointFromEvent(e)
    const cell = this.cellOf(point)
    const frame = this.currentFrame()
    const shapeFrame = this.selectedShape !== null

    if (frame) {
      const hit = this.hitTest(frame, point)

      if (hit && hit.type === 'move' && !this.floating && !shapeFrame) {
        // The pixels are lifted on the first movement, so a plain click changes nothing
        this.dragMode = 'liftpending'
        this.liftStart = cell
        this.liftPoint = point
        return
      }

      if (hit) {
        if (!this.floating && !shapeFrame) this.liftSelection()
        this.beginTransform(hit, point, cell)
        return
      }

      if (this.floating) this.commitFloating() // A click away from the frame places the pixels
    }

    if (this.tool === 'select' || this.tool === 'shapes') {
      const index = this.shapeAt(point)

      if (index !== null) {
        this.selectShape(index)
        this.beginTransform({ type: 'move' }, point, cell) // A shape can be dragged right away
        return
      }
    }

    this.selectedShape = null // A click away from a shape deselects it

    if (this.tool === 'shapes') {
      const record = this.session

      this.strokeStart = this.snapshot()
      this.strokeChanged = true
      this.createStart = cell
      this.selection = null

      record.shapes.push(this.makeShape(cell, cell, e.shiftKey))
      this.selectedShape = record.shapes.length - 1
      this.dragMode = 'create'

      this.markChanged()
      this.updateNotice()
      this.draw()
      return
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
    this.strokeStart = this.snapshot()
    this.strokeChanged = false
    this.lastCell = cell

    if (drawLine(this.grid, cell.x, cell.y, cell.x, cell.y, !this.erasing, this.brushSize)) {
      this.strokeChanged = true
      this.markChanged()
    }
    this.draw()
  }

  /**
   * Continues the current drag, and tracks the pointer for the brush
   * preview and cursors. Strokes draw a line from the previous cell so fast
   * movement leaves no gaps. Shift is read on every move, so it can be
   * pressed or released during a resize, a rotation or while placing a shape.
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
          this.markChanged()
          redraw = true
        }
      }
    } else if (this.dragMode === 'create') {
      Object.assign(this.selectedShapeObject(), this.makeShape(this.createStart, cell, e.shiftKey))
      this.markChanged()
      this.updateNotice()
      redraw = true
    } else if (this.dragMode === 'marquee') {
      const start = this.marquee.start
      if (cell.x !== start.x || cell.y !== start.y) this.marquee.moved = true

      this.selection = this.rectFromCells(start, cell)
      redraw = true
    } else if (this.dragMode === 'move') {
      const { cell: startCell, transform } = this.dragStart
      this.applyTransform({
        cx: transform.cx + (cell.x - startCell.x),
        cy: transform.cy + (cell.y - startCell.y)
      })
      redraw = true
    } else if (this.dragMode === 'resize') {
      const { transform, hx, hy } = this.dragStart
      const local = toLocal(transform, point.x, point.y)
      this.applyTransform(resizeTransform(transform, hx, hy, local, e.shiftKey, this.size * 2))
      redraw = true
    } else if (this.dragMode === 'rotate') {
      const { transform, point: from } = this.dragStart
      this.applyTransform({ angle: rotatedAngle(transform, from, point, e.shiftKey) })
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
   * Ends the current drag. A stroke, a new shape or a change to a shape
   * that changed something becomes one undo step. A click with the select
   * tool, without dragging, clears the selection.
   */
  endDrag() {
    if (!this.dragMode) return

    const shapeDrag = this.dragMode === 'create' || this.dragTarget === 'shape'
    if ((this.dragMode === 'stroke' || shapeDrag) && this.strokeChanged) {
      pushState(this.session.history, this.strokeStart)
    }

    if (this.dragMode === 'marquee' && !this.marquee.moved) {
      this.selection = null
    }

    this.dragMode = null
    this.dragTarget = null
    this.lastCell = null
    this.strokeStart = null
    this.strokeChanged = false
    this.marquee = null
    this.createStart = null
    this.liftStart = null
    this.liftPoint = null
    this.dragStart = null
    this.draw()
  }

  /**
   * Copies the selected shape or the selected pixels.
   * @returns {boolean} true if something was copied
   */
  copySelection() {
    this.commitFloating()

    const shape = this.selectedShapeObject()
    if (shape) {
      this.shapeClipboard = { ...shape }
      this.clipboardKind = 'shape'
      return true
    }

    if (!this.selection) return false

    const { x, y, width, height } = this.selection
    this.clipboard = extractRegion(this.grid, x, y, width, height)
    this.clipboardKind = 'pixels'
    return true
  }

  /**
   * Pastes what was copied last. A shape is added one cell down and to the
   * right of the copy. Pixels are pasted as floating pixels at the pointer,
   * or at the top left corner if the pointer is not over the canvas.
   * @returns {boolean} true if something was pasted
   */
  paste() {
    this.commitFloating()

    if (this.clipboardKind === 'shape' && this.shapeClipboard) {
      if (this.tool !== 'select' && this.tool !== 'shapes') this.setTool('select')

      const copy = { ...this.shapeClipboard, cx: this.shapeClipboard.cx + 1, cy: this.shapeClipboard.cy + 1 }
      this.shapeClipboard = copy // Repeated pastes step diagonally
      this.addShape(copy)
      return true
    }

    if (this.clipboardKind !== 'pixels' || !this.clipboard) return false

    const { width, height } = this.clipboard
    const anchor = this.hoverCell || { x: 0, y: 0 }
    const x = clamp(anchor.x, 0, Math.max(0, this.size - width))
    const y = clamp(anchor.y, 0, Math.max(0, this.size - height))

    this.selectedShape = null
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
   * Removes the selected shape, the floating pixels or the selected pixels.
   * This is an undo step.
   * @returns {boolean} true if something was removed
   */
  deleteSelected() {
    const record = this.session

    if (this.selectedShape !== null) {
      pushState(record.history, this.snapshot())
      record.shapes.splice(this.selectedShape, 1)
      this.selectedShape = null
      this.markChanged()
      this.updateNotice()
      this.draw()
      return true
    }

    if (this.floating) {
      const { before } = this.floating

      this.floating = null
      this.selection = null
      if (before && !pixelsEqual(record.grid.pixels, before.pixels)) pushState(record.history, before) // The pixels were lifted, so removing them is a change

      this.markChanged()
      this.updateNotice()
      this.draw()
      return true
    }

    if (this.selection) {
      const before = this.snapshot()
      const { x, y, width, height } = this.selection

      if (clearRegion(record.grid, x, y, width, height)) {
        pushState(record.history, before)
        this.markChanged()
      }

      this.draw()
      return true
    }

    return false
  }

  /**
   * Rotates the selected shape a quarter turn. This is an undo step.
   * @param {number} direction - 1 clockwise, -1 counter-clockwise
   * @returns {boolean} true if there was a shape to rotate
   */
  rotateSelectedShape(direction) {
    const shape = this.selectedShapeObject()
    if (!shape) return false

    pushState(this.session.history, this.snapshot())
    shape.angle += (direction * Math.PI) / 2

    this.markChanged()
    this.updateNotice()
    this.draw()
    return true
  }

  /**
   * Moves the selected shape one step. This is an undo step.
   * @param {number} dx - cells
   * @param {number} dy - cells
   */
  nudgeShape(dx, dy) {
    const shape = this.selectedShapeObject()
    if (!shape) return

    pushState(this.session.history, this.snapshot())
    shape.cx += dx
    shape.cy += dy

    this.markChanged()
    this.draw()
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

    this.selectedShape = null
    this.floating = {
      source: extractRegion(grid, x, y, width, height),
      cx: x + width / 2,
      cy: y + height / 2,
      w: width,
      h: height,
      angle: 0,
      before: this.snapshot(), // Restored on cancel, pushed to history on place
      origin: this.selection,
      cache: null
    }

    clearRegion(grid, x, y, width, height)
    this.selection = null
    this.markChanged()
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
    const start = this.floating.before || this.snapshot() // A paste has no lift, so the state is taken now

    this.floating = null
    pasteRegion(grid, image.region, image.x, image.y)
    if (!pixelsEqual(grid.pixels, start.pixels)) pushState(history, start)

    this.selection = this.rectInsideGrid(image.x, image.y, image.region.width, image.region.height)
    this.markChanged()
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
      this.grid.pixels.set(before.pixels)
      this.selection = origin
      this.markChanged()
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
   * Steps back one change in the current glyph. While pixels float, it
   * cancels them instead.
   */
  undo() {
    if (this.floating) {
      this.cancelFloating()
      return
    }

    const record = this.session
    const previous = undoState(record.history, this.snapshot())
    if (!previous) return

    this.restoreSnapshot(record, previous)
    this.selectedShape = null
    this.markChanged()
    this.updateNotice()
    this.draw()
  }

  /**
   * Steps forward one change in the current glyph.
   */
  redo() {
    if (this.floating) return

    const record = this.session
    const next = redoState(record.history, this.snapshot())
    if (!next) return

    this.restoreSnapshot(record, next)
    this.selectedShape = null
    this.markChanged()
    this.updateNotice()
    this.draw()
  }

  /**
   * Switches tool. Floating pixels are placed first, and a selected shape
   * is deselected unless the new tool can work with shapes.
   * @param {string} tool - 'pen', 'eraser', 'select' or 'shapes'
   */
  setTool(tool) {
    this.commitFloating()
    this.tool = tool

    if (tool !== 'select' && tool !== 'shapes') this.selectedShape = null

    this.toolbar.setAttribute('tool', tool)
    this.updateNotice()
    this.draw()
  }

  /**
   * Picks the shape the shapes tool places.
   * @param {string} type - one of SHAPE_TYPES
   */
  setShapeType(type) {
    if (!SHAPE_TYPES.includes(type)) return

    this.shapeType = type
    this.toolbar.setAttribute('shape', type)
  }

  /**
   * Switches to another grid size. Every size has its own set of glyphs, so
   * nothing is lost or converted.
   * @param {number} size - 8, 16, 32, 64 or 128
   */
  setSize(size) {
    if (size === this.size) return

    this.commitFloating()
    this.size = size
    this.selection = null
    this.selectedShape = null
    this.hoverCell = null
    this.hoverPoint = null

    const settings = this.settings
    settings.setAttribute('size', size)
    settings.setAttribute('margin', this.set.margin)
    settings.setAttribute('font-name', this.set.name)

    this.panel.rebuild()
    this.preview.refresh()
    this.updateNotice()
    this.draw()
  }

  /**
   * Makes the brush larger or smaller.
   * @param {number} delta - 1 or -1
   */
  changeBrush(delta) {
    this.brushSize = clamp(this.brushSize + delta, 1, MAX_BRUSH)
    this.toolbar.setAttribute('brush', this.brushSize)
    this.draw()
  }

  /**
   * Empties the current glyph, pixels and shapes. This is an undo step.
   * Floating pixels are cancelled first.
   */
  clear() {
    this.cancelFloating()

    const record = this.session
    if (glyphIsEmpty(record)) return

    pushState(record.history, this.snapshot())
    clearGrid(record.grid)
    record.shapes = []
    this.selectedShape = null

    this.markChanged()
    this.updateNotice()
    this.draw()
  }

  /**
   * Turns the guide lines on or off.
   */
  toggleGuides() {
    this.showGuides = !this.showGuides
    this.toolbar.setAttribute('guides', this.showGuides ? 'on' : 'off')
    this.shadowRoot.getElementById('legend').classList.toggle('hidden', !this.showGuides)
    this.draw()
  }

  /**
   * Makes the side margin of the active grid size larger or smaller. The
   * margin is added on both sides of every letter on export and in the text
   * preview. It is saved.
   * @param {number} delta - 1 or -1, in pixels
   */
  changeMargin(delta) {
    const set = this.set
    set.margin = clamp(set.margin + delta, 0, Math.floor(this.size / 4))
    saveMargin(this.size, set.margin)

    this.settings.setAttribute('margin', set.margin)
    this.requestPreview()
    this.draw()
  }

  /**
   * Switches the PNG background between transparent and white.
   */
  togglePngBackground() {
    this.pngTransparent = !this.pngTransparent
    this.settings.setAttribute('png-bg', this.pngTransparent ? 'transparent' : 'white')
  }

  /**
   * Shows the current glyph, font name and the state of the glyph list and
   * copy mode in the settings panel.
   */
  syncToolbar() {
    const settings = this.settings

    settings.setAttribute('glyph', this.currentChar)
    settings.setAttribute('glyph-name', glyphName(this.currentChar))
    settings.setAttribute('panel', this.panelOpen ? 'open' : 'closed')
    settings.setAttribute('copy', this.copyMode ? 'on' : 'off')
    settings.setAttribute('font-name', this.set.name)
  }

  /**
   * Switches to another glyph. Floating pixels are placed first. Every glyph
   * keeps its own pixels, shapes and undo history.
   * @param {string} char
   */
  setGlyph(char) {
    if (!ALL_GLYPHS.includes(char)) return

    this.commitFloating()
    this.currentChar = char
    this.selection = null
    this.selectedShape = null

    this.syncToolbar()
    this.panel.highlight()
    this.requestPreview()
    this.updateNotice()
    this.draw()
  }

  /**
   * Steps to the previous or next glyph, wrapping around at the ends.
   * @param {number} delta - 1 or -1
   */
  stepGlyph(delta) {
    const index = ALL_GLYPHS.indexOf(this.currentChar)
    this.setGlyph(ALL_GLYPHS[(index + delta + ALL_GLYPHS.length) % ALL_GLYPHS.length])
  }

  /**
   * Shows or hides the glyph sidebar. The state is remembered.
   * @param {boolean} open - the new state, the opposite of the current one by default
   */
  togglePanel(open = !this.panelOpen) {
    this.panelOpen = open
    this.panel.hidden = !open
    savePanelOpen(open)

    if (!open && this.copyMode) this.copyMode = false

    this.syncToolbar()
    this.panel.highlight()
  }

  /**
   * Starts or stops copy mode: the next glyph picked in the panel receives a
   * copy of the current glyph.
   */
  startCopy() {
    if (this.copyMode) {
      this.cancelCopy()
      return
    }

    if (glyphIsEmpty(this.session)) {
      this.flash('nothing to copy: the drawing is empty')
      return
    }

    this.copyMode = true
    this.togglePanel(true)
  }

  /**
   * Leaves copy mode without copying.
   */
  cancelCopy() {
    this.copyMode = false
    this.syncToolbar()
    this.panel.highlight()
  }

  /**
   * Handles a click on a box in the panel: copies to it in copy mode,
   * otherwise switches to it.
   * @param {string} char
   */
  onGlyphPick(char) {
    if (this.copyMode) this.copyGlyphTo(char)
    else this.setGlyph(char)
  }

  /**
   * Copies the current glyph, pixels and shapes, to another glyph, then
   * switches to it. The copy is an undo step on the target. A target that
   * already has a drawing asks first.
   * @param {string} char - the target glyph
   */
  copyGlyphTo(char) {
    this.commitFloating()

    if (char === this.currentChar) {
      this.flash('pick another glyph to copy to')
      return
    }

    const source = this.session
    const target = this.recordFor(char)

    if (!glyphIsEmpty(target) && !window.confirm(`Replace the drawing of "${char}" with a copy of "${this.currentChar}"?`)) {
      return
    }

    pushState(target.history, this.snapshot(target))
    target.grid.pixels.set(source.grid.pixels)
    target.shapes = cloneShapes(source.shapes)
    this.markChanged(char)

    this.copyMode = false
    this.setGlyph(char)
    this.flash(`copied to ${char}`)
  }

  /**
   * Sets the font name of the active grid size. It becomes the family name
   * in the UFO and the name of the exported files. It is saved.
   * @param {string} name
   */
  setFontName(name) {
    this.set.name = name
    saveName(this.size, name)
    this.settings.setAttribute('font-name', name)
  }

  /**
   * Shows a short message under the canvas for a few seconds.
   * @param {string} text
   */
  flash(text) {
    this.message = text
    this.updateNotice()

    clearTimeout(this.messageTimer)
    this.messageTimer = setTimeout(() => {
      this.message = ''
      this.updateNotice()
    }, 4000)
  }

  /**
   * Saves the current glyph as an SVG or PNG file. Floating pixels are
   * placed first. The file name comes from the glyph.
   * @param {string} format - 'svg' or 'png'
   */
  async exportGlyph(format) {
    this.commitFloating()

    const record = this.session
    const { margin } = this.set

    if (glyphIsEmpty(record)) {
      this.flash('nothing to export: the drawing is empty')
      return
    }

    const fileName = exportFileName(glyphName(this.currentChar), format)

    if (format === 'svg') {
      downloadText(buildSvg(record.grid, { margin, shapes: record.shapes }), fileName, 'image/svg+xml')
    } else {
      const blob = await gridToPngBlob(record.grid, { transparent: this.pngTransparent, shapes: record.shapes })
      if (!blob) {
        this.flash('could not create the PNG')
        return
      }
      downloadBlob(blob, fileName)
    }

    this.flash(`saved ${fileName}`)
  }

  /**
   * Saves every drawn glyph of the active grid size in one ZIP: a UFO font
   * that Glyphs opens, or one SVG per glyph.
   * @param {string} format - 'ufo' or 'svg'
   */
  exportAll(format) {
    this.commitFloating()

    const { margin, name, glyphs } = this.set
    const drawn = ALL_GLYPHS.filter((char) => glyphs.has(char) && !glyphIsEmpty(glyphs.get(char))).map((char) => ({
      char,
      grid: glyphs.get(char).grid,
      shapes: glyphs.get(char).shapes
    }))

    if (drawn.length === 0) {
      this.flash('nothing to export: no glyph has a drawing yet')
      return
    }

    let files
    let fileName

    if (format === 'ufo') {
      const ufo = buildUfo(drawn, { familyName: name, size: this.size, margin })
      files = ufo.files
      fileName = `${ufo.folderName}.zip`
    } else {
      files = drawn.map(({ char, grid, shapes }) => ({
        name: exportFileName(glyphName(char), 'svg'),
        data: buildSvg(grid, { margin, shapes })
      }))
      fileName = `${safeFileName(name)}-svg.zip`
    }

    downloadBlob(new Blob([createZip(files)], { type: 'application/zip' }), fileName)
    this.flash(`saved ${fileName} with ${drawn.length} glyphs${format === 'ufo' ? ' · unzip it, then open the .ufo in Glyphs' : ''}`)
  }

  /**
   * Saves a backup of every grid size, margin, font name and the preview
   * text as a JSON file.
   */
  backup() {
    this.commitFloating()
    for (const size of SIZES) this.setFor(size) // Loads every size, so none is left out

    const backup = createBackup(this.sets, this.preview.getText())
    const count = Object.values(backup.sets).reduce((sum, set) => sum + Object.keys(set.glyphs).length, 0)
    const date = new Date().toISOString().slice(0, 10)
    const fileName = `${safeFileName(this.set.name)}-backup-${date}.json`

    downloadText(JSON.stringify(backup), fileName, 'application/json')
    this.flash(`saved ${fileName} with ${count} glyphs`)
  }

  /**
   * Opens a file picker for a backup file and restores it.
   */
  pickBackupFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'

    input.addEventListener('change', async () => {
      const file = input.files[0]
      if (file) this.restoreBackup(await file.text())
    })

    input.click()
  }

  /**
   * Replaces everything in the editor with the content of a backup file,
   * after a confirmation. Undo history is not part of a backup, so it starts
   * empty.
   * @param {string} json - the file content
   */
  restoreBackup(json) {
    let backup

    try {
      backup = parseBackup(json)
    } catch (error) {
      this.flash(`could not restore: ${error.message}`)
      return
    }

    const count = backup.sets.reduce((sum, set) => sum + set.glyphs.length, 0)
    if (!window.confirm(`Restore ${count} glyphs from this backup? Everything currently in the editor is replaced.`)) return

    this.cancelFloating()
    clearTimeout(this.saveTimer)
    this.dirty.clear()
    clearAllSaved()
    this.sets.clear()
    this.selection = null
    this.selectedShape = null

    for (const saved of backup.sets) {
      const set = {
        margin: saved.margin === null ? defaultMargin(saved.size) : saved.margin,
        name: saved.name || 'Pixel Font',
        glyphs: new Map()
      }

      saveMargin(saved.size, set.margin)
      saveName(saved.size, set.name)

      for (const { char, grid, shapes } of saved.glyphs) {
        set.glyphs.set(char, { grid, shapes, history: createHistory() })
        saveGlyph(saved.size, char, serializeGlyph({ grid, shapes }))
      }

      this.sets.set(saved.size, set)
    }

    savePanelOpen(this.panelOpen)
    this.preview.setText(backup.text)

    this.syncToolbar()
    this.settings.setAttribute('margin', this.set.margin)
    this.panel.rebuild()
    this.flash(`restored ${count} glyphs`)
    this.updateNotice()
    this.draw()
  }

  /**
   * Shows a passive text line under the canvas: the last message, the
   * selected shape, the size and angle of floating pixels, the advance width
   * the export will give, and a note about low resolution.
   */
  updateNotice() {
    const parts = []

    if (this.message) parts.push(this.message)

    const shape = this.selectedShapeObject()
    if (shape) {
      parts.push(`${shape.type} ${Math.abs(shape.w)}×${Math.abs(shape.h)} px, ${degrees(shape.angle)}° · delete removes it · R rotates 90°`)
    }

    if (this.floating) {
      const { w, h, angle } = this.floating
      parts.push(`floating ${Math.abs(w)}×${Math.abs(h)} px, ${degrees(angle)}° · enter to place, esc to cancel`)
    }

    const bounds = glyphBounds(this.session)
    if (bounds) {
      const round = (value) => Math.round(value * 10) / 10
      const width = round(bounds.right - bounds.left)
      const { margin } = this.set
      parts.push(`advance width on export: ${round(width + margin * 2)} px (${margin} + ${width} + ${margin})`)
    }

    if (this.size <= 16) parts.push('low resolution: fine details can disappear')

    this.shadowRoot.getElementById('notice').textContent = parts.join(' · ')
  }

  /**
   * Sets the cursor: a resize cursor over handles, a move cursor over
   * things that can be dragged, a grab cursor in the rotation zone and a
   * pointer over shapes that can be selected.
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
      else if ((this.tool === 'select' || this.tool === 'shapes') && this.shapeAt(this.hoverPoint) !== null) cursor = 'pointer'
    }

    canvas.style.cursor = cursor
  }

  /**
   * Redraws the whole canvas. Everything is calculated in device pixels
   * with whole-number cell sizes, and the canvas is never scaled by CSS,
   * so every grid line is exactly one device pixel wide and evenly spaced.
   * Grid lines are drawn first, so filled pixels cover them and neighbouring
   * pixels read as one solid shape. Shapes come next, then guides, the
   * selection or floating pixels, the frame of a selected shape and the
   * brush preview.
   */
  draw() {
    const canvas = this.shadowRoot.getElementById('canvas')
    const ctx = canvas.getContext('2d')
    const { grid, shapes } = this.session
    const { size, pixels } = grid

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

    ctx.fillStyle = '#000000'
    paintShapes(ctx, shapes, { scale: cell })

    if (this.showGuides) this.drawGuides(view)

    const shape = this.selectedShapeObject()
    if (shape) this.drawFrame(view, shape)
    else if (this.floating) this.drawFloating(view)
    else if (this.selection) this.drawSelection(view)

    this.drawHover(view)
    this.updateCursor()
    this.updateNotice()
  }

  /**
   * Draws the font metrics as horizontal guide lines on top of the pixels.
   * Lines are centered on their row boundary and kept inside the canvas.
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
