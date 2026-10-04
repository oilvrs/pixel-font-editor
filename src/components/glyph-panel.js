/**
 * Panel with one box per glyph. Boxes with a drawing show it as a small
 * picture, empty boxes show the character.
 *
 * The panel gets its data from a `source` function, set by the editor:
 *   () => ({ current, copyMode, size, getGrid })
 * where getGrid(char) returns a grid with pixels, or null.
 *
 * Methods: rebuild() (everything), refreshGlyph(char), highlight()
 * Events: glyph-pick { char }, panel-close
 *
 * @version 0.1.0
 */

import { GLYPH_GROUPS } from '../core/glyph-set.js'
import { glyphName } from '../core/glyph-names.js'

const CELL_CSS = 44 // Box size in CSS px

class GlyphPanel extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.source = () => ({ current: '', copyMode: false, size: 32, getGrid: () => null })
    this.cells = new Map() // char -> button
    this.headings = [] // [{ group, element }]
  }

  /**
   * Called whenever the element is added to the DOM.
   */
  connectedCallback() {
    this.render()
  }

  /**
   * Renders the frame of the panel. The boxes are made by rebuild().
   */
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica', 'Arial', sans-serif;
          border: 1px solid #000000;
          background: #ffffff;
          padding: 1rem;
          margin-bottom: 1.5rem;
          color: #000000;
        }

        :host([hidden]) {
          display: none;
        }

        .head {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .title {
          font-size: 0.9rem;
        }

        .hint {
          flex: 1;
          font-size: 0.85rem;
        }

        h3 {
          font-size: 0.85rem;
          font-weight: 400;
          margin: 1.25rem 0 0.5rem 0;
        }

        .cells {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }

        button {
          font-family: inherit;
          color: #000000;
        }

        .close {
          background: transparent;
          border: 1px solid #000000;
          padding: 0.5rem 1rem;
          font-size: 0.85rem;
          cursor: pointer;
        }

        .close:hover {
          background: #000000;
          color: #ffffff;
        }

        .cell {
          position: relative;
          width: ${CELL_CSS}px;
          height: ${CELL_CSS}px;
          padding: 0;
          border: 1px solid #000000;
          background: #ffffff;
          cursor: pointer;
        }

        .cell canvas {
          display: none;
          width: 100%;
          height: 100%;
        }

        .cell.filled canvas {
          display: block;
        }

        .label {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          font-size: 1rem;
          color: #999999;
          pointer-events: none;
        }

        .cell.filled .label {
          left: 3px;
          top: 1px;
          transform: none;
          font-size: 0.65rem;
          color: #555555;
        }

        .cell.current {
          outline: 2px solid blue;
          outline-offset: 1px;
        }

        .copying .cell:hover {
          background: #0bf273;
        }
      </style>

      <div class="head">
        <span class="title">glyphs</span>
        <span class="hint" id="hint"></span>
        <button class="close" id="closeBtn">close</button>
      </div>
      <div id="groups"></div>
    `

    this.shadowRoot.getElementById('closeBtn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('panel-close'))
    })
  }

  /**
   * Builds every group and box from scratch. Used on first show and when the
   * grid size changes.
   */
  rebuild() {
    const groups = this.shadowRoot.getElementById('groups')
    groups.innerHTML = ''
    this.cells.clear()
    this.headings = []

    for (const group of GLYPH_GROUPS) {
      const section = document.createElement('section')
      const heading = document.createElement('h3')
      const cells = document.createElement('div')
      cells.className = 'cells'

      for (const char of group.chars) {
        const button = document.createElement('button')
        button.className = 'cell'
        button.title = `${char} · ${glyphName(char)}`

        const canvas = document.createElement('canvas')
        const label = document.createElement('span')
        label.className = 'label'
        label.textContent = char

        button.append(canvas, label)
        button.addEventListener('click', () => {
          this.dispatchEvent(new CustomEvent('glyph-pick', { detail: { char } }))
        })

        cells.appendChild(button)
        this.cells.set(char, button)
      }

      section.append(heading, cells)
      groups.appendChild(section)
      this.headings.push({ group, element: heading })
    }

    for (const char of this.cells.keys()) this.paintCell(char)
    this.updateHeadings()
    this.highlight()
  }

  /**
   * Redraws the picture in one box, after the glyph has changed.
   * @param {string} char
   */
  refreshGlyph(char) {
    if (!this.cells.has(char)) return

    this.paintCell(char)
    this.updateHeadings()
  }

  /**
   * Marks the current glyph and updates the hint text.
   */
  highlight() {
    const { current, copyMode } = this.source()

    this.cells.forEach((button, char) => button.classList.toggle('current', char === current))
    this.shadowRoot.getElementById('groups').classList.toggle('copying', copyMode)
    this.shadowRoot.getElementById('hint').textContent = copyMode
      ? `copy "${current}" to: click the target glyph (esc cancels)`
      : 'click a glyph to draw it · boxes with a picture have a drawing'
  }

  /**
   * Draws one box: the whole grid as a small picture, or nothing if the
   * glyph has no drawing.
   * @param {string} char
   */
  paintCell(char) {
    const { size, getGrid } = this.source()
    const button = this.cells.get(char)
    const canvas = button.querySelector('canvas')
    const grid = getGrid(char)

    button.classList.toggle('filled', Boolean(grid))
    if (!grid) return

    canvas.width = size
    canvas.height = size
    canvas.style.imageRendering = size <= CELL_CSS ? 'pixelated' : 'auto'

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = '#000000'

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (grid.pixels[y * size + x]) ctx.fillRect(x, y, 1, 1)
      }
    }
  }

  /**
   * Shows how many glyphs have a drawing in each group.
   */
  updateHeadings() {
    for (const { group, element } of this.headings) {
      const filled = group.chars.filter((char) => this.cells.get(char).classList.contains('filled')).length
      element.textContent = `${group.label} · ${filled}/${group.chars.length}`
    }
  }
}

customElements.define('glyph-panel', GlyphPanel)
