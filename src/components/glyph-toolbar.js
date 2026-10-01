/**
 * Toolbar for the glyph editor.
 * Stateless: the active tool and grid size are set through the `tool` and
 * `size` attributes. User actions are sent as events:
 * - tool-change { tool: 'pen' | 'eraser' }
 * - size-change { size: number }
 * - clear
 *
 * @version 0.1.0
 */

class GlyphToolbar extends HTMLElement {
  static get observedAttributes() {
    return ['tool', 'size', 'guides']
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
          font-family: "vt323" sans-serif;
        }

        .h1 {
            font-size:3rem;
            font-weight:100;
        }

        .row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 0;
          border-top: 1px solid #000000;
        }

        .row:last-child {
          margin-bottom: 1.5rem;
        }

        .label {
          font-size: 1.5rem;
          color: #000000;
          min-width: 3rem;
        }

        .hint {
          font-size: 0.85rem;
          color: #000000;
          margin-left: auto;
        }

        button {
          background: transparent;
          color: #000000;
          border: 1px solid #000000;
          font-family: "vt323" sans-serif;
          font-weight: 200;
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

      <h1>pixelated glyph editor & exporter version 1.0<h1>

      <div class="row">
        <span class="label">tool:</span>
        <button data-tool="pen">pen</button>
        <button data-tool="eraser">eraser</button>
        <button id="clearBtn">clear</button>
         <button id="guidesBtn">guides</button>
        <span class="hint">draw: click and drag · erase: right click or shift</span>
      </div>
      <div class="row">
        <span class="label">grid:</span>
        <button data-size="8">8×8</button>
        <button data-size="16">16×16</button>
        <button data-size="32">32×32</button>
        <button data-size="64">64×64</button>
        <button data-size="128">128×128</button>
      </div>
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
   * Marks the buttons that match the current tool and size attributes.
   */
  updateActive() {
    const tool = this.getAttribute('tool')
    const size = this.getAttribute('size')
    const guidesBtn = this.shadowRoot.getElementById('guidesBtn')
    if (guidesBtn) guidesBtn.classList.toggle('active', this.getAttribute('guides') === 'on')

    this.shadowRoot.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === tool)
    })

    this.shadowRoot.querySelectorAll('[data-size]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.size === size)
    })
  }
}

customElements.define('glyph-toolbar', GlyphToolbar)
