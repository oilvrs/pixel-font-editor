/**
 * Settings panel on the right side: grid size, glyph, export and project.
 * Stateless: everything shown is set through attributes, and user actions
 * are sent as events.
 *
 * Attributes: size, glyph, glyph-name, panel, copy, margin, png-bg, font-name
 *
 * Events:
 * - size-change { size: number }
 * - glyph-step { delta: 1 | -1 }
 * - panel-toggle
 * - copy-start
 * - margin-step { delta: 1 | -1 }
 * - export { format: 'svg' | 'png' }
 * - png-bg-toggle
 * - name-change { name: string }
 * - export-all { format: 'ufo' | 'svg' }
 * - backup
 * - restore
 *
 * @version 0.1.0
 */

class GlyphSettings extends HTMLElement {
  static get observedAttributes() {
    return ['size', 'glyph', 'glyph-name', 'panel', 'copy', 'margin', 'png-bg', 'font-name']
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
          box-sizing: border-box;
          position: sticky;
          top: 0;
          width: 320px;
          height: 100vh;
          height: 100dvh;
          overflow-y: auto;
          padding: 1.5rem;
          border-left: 1px solid #000000;
          background: #ffffff;
          color: #000000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica', 'Arial', sans-serif;
        }

        section {
          padding: 1.25rem 0;
          border-top: 1px solid #000000;
        }

        section:first-of-type {
          padding-top: 0;
          border-top: none;
        }

        h3 {
          font-size: 0.9rem;
          font-weight: 400;
          margin: 0 0 0.75rem 0;
        }

        .controls {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
        }

        .controls + .controls {
          margin-top: 0.5rem;
        }

        .field {
          font-size: 0.85rem;
        }

        .value {
          font-size: 0.85rem;
          min-width: 3rem;
          text-align: center;
        }

        .current {
          display: inline-flex;
          align-items: baseline;
          gap: 0.5rem;
          min-width: 6rem;
          justify-content: center;
        }

        .char {
          font-size: 1.4rem;
        }

        .name {
          font-size: 0.85rem;
          color: #555555;
        }

        input {
          display: block;
          width: 100%;
          box-sizing: border-box;
          margin-bottom: 0.5rem;
          padding: 0.5rem;
          border: 1px solid #000000;
          border-radius: 0;
          background: transparent;
          color: #000000;
          font-size: 0.85rem;
          font-family: inherit;
        }

        input:focus {
          outline: 2px solid blue;
          outline-offset: 0;
        }

        .hint {
          margin: 0.5rem 0 0 0;
          padding-top: 1.25rem;
          border-top: 1px solid #000000;
          font-size: 0.8rem;
          line-height: 1.5;
        }

        button {
          background: transparent;
          color: #000000;
          border: 1px solid #000000;
          font-weight: 400;
          padding: 0.5rem 0.9rem;
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
          background: blue;
          color: #ffffff;
          border-color: blue;
        }
      </style>

      <section>
        <h3>grid</h3>
        <div class="controls">
          <button data-size="8">8×8</button>
          <button data-size="16">16×16</button>
          <button data-size="32">32×32</button>
          <button data-size="64">64×64</button>
          <button data-size="128">128×128</button>
        </div>
      </section>

      <section>
        <h3>glyph</h3>
        <div class="controls">
          <button id="glyphPrevBtn" title="previous glyph ( , )">‹</button>
          <span class="current"><span class="char" id="glyphChar"></span><span class="name" id="glyphName"></span></span>
          <button id="glyphNextBtn" title="next glyph ( . )">›</button>
        </div>
        <div class="controls">
          <button id="panelBtn" title="show or hide the glyph list (G)">glyphs</button>
          <button id="copyBtn" title="copy this drawing to another glyph">copy to…</button>
        </div>
      </section>

      <section>
        <h3>export</h3>
        <div class="controls">
          <span class="field">margin</span>
          <button id="marginDownBtn" title="smaller side margin">−</button>
          <span class="value" id="marginValue">2 px</span>
          <button id="marginUpBtn" title="larger side margin">+</button>
        </div>
        <div class="controls">
          <button id="exportSvgBtn">save svg</button>
          <button id="exportPngBtn">save png</button>
          <button id="pngBgBtn" title="PNG background">png: transparent</button>
        </div>
      </section>

      <section>
        <h3>project</h3>
        <input id="nameInput" type="text" maxlength="40" autocomplete="off" spellcheck="false" placeholder="font name" />
        <div class="controls">
          <button id="exportUfoBtn" title="the whole font as a .ufo that Glyphs opens">save ufo</button>
          <button id="exportAllSvgBtn" title="every drawn glyph as SVG, in one zip">all svg</button>
        </div>
        <div class="controls">
          <button id="backupBtn" title="save all drawings as a backup file">backup</button>
          <button id="restoreBtn" title="replace everything with a backup file">restore</button>
        </div>
      </section>

      <p class="hint">
        draw: drag · erase: right click or shift · select (M): drag a rectangle, then drag inside to move, drag a
        handle to resize, drag outside a corner to rotate · shift: keep proportions, snap rotation to 45° ·
        copy ⌘C, paste ⌘V · undo ⌘Z · brush: [ ] or − + · glyph: , . step · G glyph list · T text preview
      </p>
    `
  }

  /**
   * Sets up event listeners for all buttons and the font name field.
   */
  setUpEventListeners() {
    const byId = (id) => this.shadowRoot.getElementById(id)

    this.shadowRoot.querySelectorAll('[data-size]').forEach((btn) => {
      btn.addEventListener('click', () => this.emit('size-change', { size: parseInt(btn.dataset.size) }))
    })

    byId('glyphPrevBtn').addEventListener('click', () => this.emit('glyph-step', { delta: -1 }))
    byId('glyphNextBtn').addEventListener('click', () => this.emit('glyph-step', { delta: 1 }))
    byId('panelBtn').addEventListener('click', () => this.emit('panel-toggle'))
    byId('copyBtn').addEventListener('click', () => this.emit('copy-start'))

    byId('marginDownBtn').addEventListener('click', () => this.emit('margin-step', { delta: -1 }))
    byId('marginUpBtn').addEventListener('click', () => this.emit('margin-step', { delta: 1 }))
    byId('exportSvgBtn').addEventListener('click', () => this.emit('export', { format: 'svg' }))
    byId('exportPngBtn').addEventListener('click', () => this.emit('export', { format: 'png' }))
    byId('pngBgBtn').addEventListener('click', () => this.emit('png-bg-toggle'))

    byId('exportUfoBtn').addEventListener('click', () => this.emit('export-all', { format: 'ufo' }))
    byId('exportAllSvgBtn').addEventListener('click', () => this.emit('export-all', { format: 'svg' }))
    byId('backupBtn').addEventListener('click', () => this.emit('backup'))
    byId('restoreBtn').addEventListener('click', () => this.emit('restore'))

    const input = byId('nameInput')
    input.addEventListener('focus', () => input.select())
    input.addEventListener('input', () => this.emit('name-change', { name: input.value }))
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') input.blur()
    })
  }

  /**
   * Dispatches a custom event from the panel element.
   * @param {string} name
   * @param {Object} detail
   */
  emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { detail }))
  }

  /**
   * Takes keyboard focus away from the font name field, so shortcuts work
   * again after the canvas is used.
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
    const byId = (id) => this.shadowRoot.getElementById(id)
    if (!byId('panelBtn')) return // Not rendered yet

    const size = this.getAttribute('size')
    this.shadowRoot.querySelectorAll('[data-size]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.size === size)
    })

    byId('panelBtn').classList.toggle('active', this.getAttribute('panel') === 'open')
    byId('copyBtn').classList.toggle('active', this.getAttribute('copy') === 'on')
    byId('marginValue').textContent = `${this.getAttribute('margin') || 0} px`
    byId('pngBgBtn').textContent = `png: ${this.getAttribute('png-bg') || 'transparent'}`
    byId('glyphChar').textContent = this.getAttribute('glyph') || ''
    byId('glyphName').textContent = this.getAttribute('glyph-name') || ''

    const fontName = this.getAttribute('font-name') || ''
    const nameInput = byId('nameInput')
    if (nameInput.value !== fontName) nameInput.value = fontName
  }
}

customElements.define('glyph-settings', GlyphSettings)
