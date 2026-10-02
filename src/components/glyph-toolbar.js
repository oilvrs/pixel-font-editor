/**
 * Toolbar for the glyph editor.
 * Stateless: the active tool, grid size, guides state and brush size are set
 * through the `tool`, `size`, `guides` and `brush` attributes. User actions
 * are sent as events:
 * - tool-change { tool: 'pen' | 'eraser' | 'select' }
 * - size-change { size: number }
 * - brush-step { delta: 1 | -1 }
 * - guides-toggle
 * - clear
 *
 * @version 0.3.0
 */

class GlyphToolbar extends HTMLElement {
  static get observedAttributes() {
    return ['tool', 'size', 'guides', 'brush']
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

        .panel {
          border-bottom: 1px solid #000000;
          margin-bottom: 0.75rem;
        }

        .row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 0;
          border-top: 1px solid #000000;
        }

        .label {
          font-size: 0.9rem;
          color: #000000;
          min-width: 3rem;
        }

        .value {
          font-size: 0.85rem;
          color: #000000;
          min-width: 3rem;
          text-align: center;
        }

        .hint {
          font-size: 0.85rem;
          color: #000000;
          margin: 0 0 1.5rem 0;
        }

        button {
          background: transparent;
          color: #000000;
          border: 1px solid #000000;
          font-weight: 400;
          padding: 0.5rem 1rem;
          cursor: pointer;
          font-size: 0.85rem;
          transition: background 0.2s, color 0.2s;
        }

        button:hover {
          background: #000000;
          color: #ffffff;
        }

        button.active {
          background: blue;
          color: #ffffff;
          border-color: blue;
        }
      </style>

      <div class="panel">
        <div class="row">
          <span class="label">tool:</span>
          <button data-tool="pen" title="pen (B)">pen</button>
          <button data-tool="eraser" title="eraser (E)">eraser</button>
          <button data-tool="select" title="select (M)">select</button>
          <button id="clearBtn">clear</button>
          <button id="guidesBtn">guides</button>
        </div>
        <div class="row">
          <span class="label">brush:</span>
          <button id="brushDownBtn" title="smaller ( [ or - )">−</button>
          <span class="value" id="brushValue">1 px</span>
          <button id="brushUpBtn" title="larger ( ] or + )">+</button>
        </div>
        <div class="row">
          <span class="label">grid:</span>
          <button data-size="8">8×8</button>
          <button data-size="16">16×16</button>
          <button data-size="32">32×32</button>
          <button data-size="64">64×64</button>
          <button data-size="128">128×128</button>
        </div>
      </div>
      <p class="hint">draw: drag · erase: right click or shift · select: drag a rectangle, then drag inside to move, drag a handle to resize, drag outside a corner to rotate · shift: keep proportions, snap rotation to 45° · copy ⌘C, paste ⌘V · undo: ⌘Z · brush: [ ] or − +</p>    
      `
  }

  /**
   * Sets up event listeners for all buttons.
   */
  setUpEventListeners() {
    this.shadowRoot.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => this.emit('tool-change', { tool: btn.dataset.tool }))
    })

    this.shadowRoot.querySelectorAll('[data-size]').forEach((btn) => {
      btn.addEventListener('click', () =>
        this.emit('size-change', { size: parseInt(btn.dataset.size) })
      )
    })

    this.shadowRoot
      .getElementById('brushDownBtn')
      .addEventListener('click', () => this.emit('brush-step', { delta: -1 }))
    this.shadowRoot
      .getElementById('brushUpBtn')
      .addEventListener('click', () => this.emit('brush-step', { delta: 1 }))
    this.shadowRoot.getElementById('clearBtn').addEventListener('click', () => this.emit('clear'))
    this.shadowRoot
      .getElementById('guidesBtn')
      .addEventListener('click', () => this.emit('guides-toggle'))
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
    const size = this.getAttribute('size')

    this.shadowRoot.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === tool)
    })

    this.shadowRoot.querySelectorAll('[data-size]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.size === size)
    })

    const guidesBtn = this.shadowRoot.getElementById('guidesBtn')
    if (guidesBtn) guidesBtn.classList.toggle('active', this.getAttribute('guides') === 'on')

    const brushValue = this.shadowRoot.getElementById('brushValue')
    if (brushValue) brushValue.textContent = `${this.getAttribute('brush') || 1} px`
  }
}

customElements.define('glyph-toolbar', GlyphToolbar)
