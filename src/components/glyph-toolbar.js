/**
 * Toolbar for the glyph editor.
 * Stateless: everything shown is set through attributes, and user actions
 * are sent as events.
 *
 * Attributes: tool, size, guides, brush, glyph, advance, png-bg
 *
 * Events:
 * - tool-change { tool: 'pen' | 'eraser' | 'select' }
 * - size-change { size: number }
 * - brush-step { delta: 1 | -1 }
 * - guides-toggle
 * - clear
 * - glyph-change { char: string }
 * - advance-step { delta: 1 | -1 }
 * - export { format: 'svg' | 'png' }
 * - png-bg-toggle
 *
 * @version 0.4.0
 */

class GlyphToolbar extends HTMLElement {
  static get observedAttributes() {
    return ['tool', 'size', 'guides', 'brush', 'glyph', 'margin', 'png-bg']
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
          flex-wrap: wrap;
          gap: 0.75rem;
          padding: 1rem 0;
          border-top: 1px solid #000000;
        }

        .label {
          font-size: 0.9rem;
          color: #000000;
          min-width: 3rem;
        }

        .field {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          color: #000000;
        }

        .value {
          font-size: 0.85rem;
          color: #000000;
          min-width: 3rem;
          text-align: center;
        }

        input {
          width: 2.5rem;
          padding: 0.5rem;
          border: 1px solid #000000;
          border-radius: 0;
          background: transparent;
          color: #000000;
          font-size: 0.85rem;
          font-family: inherit;
          text-align: center;
        }

        input:focus {
          outline: 2px solid blue;
          outline-offset: 0;
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
        <div class="row">
          <span class="label">export:</span>
          <label class="field">glyph <input id="glyphInput" type="text" maxlength="2" autocomplete="off" spellcheck="false" /></label>
          <span class="field">
            margin
            <button id="marginDownBtn" title="smaller side margin">−</button>
            <span class="value" id="marginValue">2 px</span>
            <button id="marginUpBtn" title="larger side margin">+</button>
          </span>
          <button id="exportSvgBtn">save svg</button>
          <button id="exportPngBtn">save png</button>
          <button id="pngBgBtn" title="PNG background">png: transparent</button>
        </div>
      </div>
      <p class="hint">draw: drag · erase: right click or shift · select: drag a rectangle, then drag inside to move, drag a handle to resize, drag outside a corner to rotate · shift: keep proportions, snap rotation to 45° · copy ⌘C, paste ⌘V · undo: ⌘Z · brush: [ ] or − + · export: type the glyph character, set the advance width, save</p>
    `
  }

  /**
   * Sets up event listeners for all buttons and the glyph field.
   */
  setUpEventListeners() {
    const byId = (id) => this.shadowRoot.getElementById(id)

    this.shadowRoot.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => this.emit('tool-change', { tool: btn.dataset.tool }))
    })

    this.shadowRoot.querySelectorAll('[data-size]').forEach((btn) => {
      btn.addEventListener('click', () =>
        this.emit('size-change', { size: parseInt(btn.dataset.size) })
      )
    })

    byId('brushDownBtn').addEventListener('click', () => this.emit('brush-step', { delta: -1 }))
    byId('brushUpBtn').addEventListener('click', () => this.emit('brush-step', { delta: 1 }))
    byId('clearBtn').addEventListener('click', () => this.emit('clear'))
    byId('guidesBtn').addEventListener('click', () => this.emit('guides-toggle'))

    byId('marginDownBtn').addEventListener('click', () => this.emit('margin-step', { delta: -1 }))
    byId('marginUpBtn').addEventListener('click', () => this.emit('margin-step', { delta: 1 }))
    byId('exportSvgBtn').addEventListener('click', () => this.emit('export', { format: 'svg' }))
    byId('exportPngBtn').addEventListener('click', () => this.emit('export', { format: 'png' }))
    byId('pngBgBtn').addEventListener('click', () => this.emit('png-bg-toggle'))

    const input = byId('glyphInput')
    input.addEventListener('focus', () => input.select())
    input.addEventListener('input', () =>
      this.emit('glyph-change', { char: [...input.value][0] || '' })
    )
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') input.blur()
    })
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
   * Takes keyboard focus away from the glyph field, so shortcuts work again
   * after the canvas is used.
   */
  blurInputs() {
    const active = this.shadowRoot.activeElement
    if (active) active.blur()
  }

  /**
   * Marks the buttons that match the current attributes and shows the
   * values.
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

    const byId = (id) => this.shadowRoot.getElementById(id)
    if (!byId('guidesBtn')) return // Not rendered yet

    byId('guidesBtn').classList.toggle('active', this.getAttribute('guides') === 'on')
    byId('brushValue').textContent = `${this.getAttribute('brush') || 1} px`
    byId('marginValue').textContent = `${this.getAttribute('margin') || 0} px`
    byId('pngBgBtn').textContent = `png: ${this.getAttribute('png-bg') || 'transparent'}`

    const glyph = this.getAttribute('glyph') || ''
    const input = byId('glyphInput')
    if (input.value !== glyph) input.value = glyph
  }
}

customElements.define('glyph-toolbar', GlyphToolbar)
