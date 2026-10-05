/**
 * Bar above the drawing area: tools, the shapes menu and brush size.
 * Stateless: everything shown is set through attributes, and user actions
 * are sent as events.
 *
 * Attributes: tool, shape, guides, brush
 *
 * Events:
 * - tool-change { tool: 'pen' | 'eraser' | 'select' | 'shapes' }
 * - shape-change { shape: 'rect' | 'ellipse' | 'quarter' | 'concave' | 'triangle' }
 * - brush-step { delta: 1 | -1 }
 * - guides-toggle
 * - clear
 *
 * @version 0.7.0
 */

const SHAPES = [
  ['rect', 'rectangle (shift: square)', '<rect x="2" y="2" width="12" height="12"/>'],
  ['ellipse', 'ellipse (shift: circle)', '<ellipse cx="8" cy="8" rx="6.5" ry="4.5"/>'],
  ['quarter', 'quarter circle', '<path d="M2 2 H14 A12 12 0 0 1 2 14 Z"/>'],
  ['concave', 'concave corner', '<path d="M2 2 H14 A12 12 0 0 0 2 14 Z"/>'],
  ['triangle', 'triangle', '<path d="M2 2 H14 L2 14 Z"/>']
]

class GlyphToolbar extends HTMLElement {
  static get observedAttributes() {
    return ['tool', 'shape', 'guides', 'brush']
  }

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
    this.updateActive()
  }

  /**
   * Called whenever an observed attribute changes.
   */
  attributeChangedCallback() {
    this.updateActive()
  }

  /**
   * Renders the HTML template and styles into the shadow DOM.
   */
  render() {
    const shapeButtons = SHAPES.map(
      ([type, title, drawing]) =>
        `<button class="shape" data-shape="${type}" title="${title}"><svg viewBox="0 0 16 16" width="18" height="18">${drawing}</svg></button>`
    ).join('')

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica', 'Arial', sans-serif;
        }

        .frame {
          border-top: 1px solid #000000;
          border-bottom: 1px solid #000000;
          margin-bottom: 1.5rem;
        }

        .bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.75rem 2rem;
          padding: 0.9rem 0;
        }

        .shapes {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 0;
          border-top: 1px solid #000000;
        }

        .shapes.hidden {
          display: none;
        }

        .group {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .label {
          font-size: 0.9rem;
          color: #000000;
        }

        .value {
          font-size: 0.85rem;
          color: #000000;
          min-width: 3rem;
          text-align: center;
        }

        button {
          background: transparent;
          color: #000000;
          border: 1px solid #000000;
          font-weight: 400;
          padding: 0.5rem 1rem;
          cursor: pointer;
          font-size: 0.85rem;
          font-family: inherit;
          transition: background 0.2s, color 0.2s;
        }

        button:hover {
          background: #000000;
          color: #ffffff;
        }

        button.active {
          background: #05cf67;
          color: #ffffff;
          border-color: #05cf67;
        }

        button.shape {
          padding: 0.45rem 0.7rem;
          line-height: 0;
        }

        button.shape svg {
          fill: currentColor;
        }
      </style>

      <div class="frame">
        <div class="bar">
          <div class="group">
            <span class="label">tool:</span>
            <button data-tool="pen" title="pen (B)">pen</button>
            <button data-tool="eraser" title="eraser (E)">eraser</button>
            <button data-tool="select" title="select (M)">select</button>
            <button data-tool="shapes" title="shapes (S)">shapes</button>
            <button id="clearBtn">clear</button>
            <button id="guidesBtn">guides</button>
          </div>
          <div class="group">
            <span class="label">brush:</span>
            <button id="brushDownBtn" title="smaller ( [ or - )">−</button>
            <span class="value" id="brushValue">1 px</span>
            <button id="brushUpBtn" title="larger ( ] or + )">+</button>
          </div>
        </div>
        <div class="shapes hidden" id="shapeRow">${shapeButtons}</div>
      </div>
    `
  }

  /**
   * Sets up event listeners for all buttons.
   */
  setUpEventListeners() {
    const byId = (id) => this.shadowRoot.getElementById(id)

    this.shadowRoot.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => this.emit('tool-change', { tool: btn.dataset.tool }))
    })

    this.shadowRoot.querySelectorAll('[data-shape]').forEach((btn) => {
      btn.addEventListener('click', () => this.emit('shape-change', { shape: btn.dataset.shape }))
    })

    byId('brushDownBtn').addEventListener('click', () => this.emit('brush-step', { delta: -1 }))
    byId('brushUpBtn').addEventListener('click', () => this.emit('brush-step', { delta: 1 }))
    byId('clearBtn').addEventListener('click', () => this.emit('clear'))
    byId('guidesBtn').addEventListener('click', () => this.emit('guides-toggle'))
  }

  /**
   * Dispatches a custom event from the toolbar element.
   * @param {string} name
   * @param {Object} detail
   */
  emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { detail }))
  }

  /**
   * Marks the buttons that match the current attributes, shows the shapes
   * menu while the shapes tool is active and shows the brush size.
   */
  updateActive() {
    const byId = (id) => this.shadowRoot.getElementById(id)
    if (!byId('guidesBtn')) return // Not rendered yet

    const tool = this.getAttribute('tool')
    const shape = this.getAttribute('shape')

    this.shadowRoot.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === tool)
    })

    this.shadowRoot.querySelectorAll('[data-shape]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.shape === shape)
    })

    byId('shapeRow').classList.toggle('hidden', tool !== 'shapes')
    byId('guidesBtn').classList.toggle('active', this.getAttribute('guides') === 'on')
    byId('brushValue').textContent = `${this.getAttribute('brush') || 1} px`
  }
}

customElements.define('glyph-toolbar', GlyphToolbar)
