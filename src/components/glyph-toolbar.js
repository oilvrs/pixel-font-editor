/**
 * Bar above the drawing area: tools and brush size.
 * Stateless: everything shown is set through attributes, and user actions
 * are sent as events.
 *
 * Attributes: tool, guides, brush
 *
 * Events:
 * - tool-change { tool: 'pen' | 'eraser' | 'select' }
 * - brush-step { delta: 1 | -1 }
 * - guides-toggle
 * - clear
 *
 * @version 0.6.0
 */

class GlyphToolbar extends HTMLElement {
  static get observedAttributes() {
    return ['tool', 'guides', 'brush']
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
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica', 'Arial', sans-serif;
        }

        .bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.75rem 2rem;
          padding: 0.9rem 0;
          margin-bottom: 1.5rem;
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
          background: #00ea70;
          color: #ffffff;
          border-color: #00ea70;
        }
      </style>

      <div class="bar">
        <div class="group">
          <span class="label">tool:</span>
          <button data-tool="pen" title="pen (B)">pen</button>
          <button data-tool="eraser" title="eraser (E)">eraser</button>
          <button data-tool="select" title="select (M)">select</button>
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
   * Marks the buttons that match the current attributes and shows the
   * brush size.
   */
  updateActive() {
    const tool = this.getAttribute('tool')

    this.shadowRoot.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === tool)
    })

    const byId = (id) => this.shadowRoot.getElementById(id)
    if (!byId('guidesBtn')) return // Not rendered yet

    byId('guidesBtn').classList.toggle('active', this.getAttribute('guides') === 'on')
    byId('brushValue').textContent = `${this.getAttribute('brush') || 1} px`
  }
}

customElements.define('glyph-toolbar', GlyphToolbar)
