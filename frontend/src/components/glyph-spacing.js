/**
 * Spacing panel, laid out like the one in Glyphs: the glyph and its Unicode
 * value on top, the left and right sidebearing on either side, and the
 * advance width below.
 *
 * The panel gets its data from a `source` function, set by the editor:
 *   () => ({ char, name, effective })
 * where effective is the result of effectiveSpacing(), or null if the glyph
 * has no drawing.
 *
 * Values are font units. A side without a value of its own is automatic and
 * shown in gray. Typing a number sets it, an empty field or `auto` (or the
 * reset button) makes it automatic again. Up and down arrows step one pixel,
 * with shift one unit. Editing the width changes the right side.
 *
 * Methods: refresh(), blurInputs()
 * Events: spacing-change { side: 'left' | 'right' | 'width', value: number | null }
 *
 * @version 0.1.0
 */

const SIDES = ['left', 'right', 'width']

/**
 * Reads a number from text.
 * @param {string} text
 * @returns {number|undefined} a whole number, or undefined if the text is not a number
 */
function parseUnits(text) {
  const trimmed = String(text).trim()
  return /^-?\d+(\.\d+)?$/.test(trimmed) ? Math.round(Number(trimmed)) : undefined
}

class GlyphSpacing extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.source = () => ({ char: '', name: '', effective: null })
    this.current = null // The spacing shown, as given by the editor
    this.values = { left: '', right: '', width: '' } // The text each field shows when it is not being edited
  }

  /**
   * Called whenever the element is added to the DOM.
   */
  connectedCallback() {
    this.render()
    this.setUpEventListeners()
    this.refresh()
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
          color: #000000;
        }

        .title {
          font-size: 0.9rem;
          margin: 0 0 0.75rem 0;
        }

        .card {
          box-sizing: border-box;
          max-width: 440px;
          margin: 0 auto;
          padding: 1.25rem 1.5rem 1rem 1.5rem;
          border: 1px solid #000000;
          background: #ffffff;
        }

        .top {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 0.75rem;
        }

        .char {
          font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
          font-size: 1.7rem;
          font-weight: 700;
        }

        .hex {
          font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
          font-size: 1.1rem;
          color: #777777;
        }

        .name {
          font-size: 0.8rem;
          color: #777777;
        }

        .middle {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: end;
          gap: 1rem;
          margin-top: 0.9rem;
        }

        .side {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
        }

        .bottom {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
          margin-top: 0.6rem;
        }

        label {
          font-size: 0.75rem;
          color: #777777;
        }

        input {
          box-sizing: border-box;
          width: 100%;
          max-width: 8rem;
          padding: 0.3rem 0.4rem;
          border: 1px solid transparent;
          border-bottom: 1px solid #cccccc;
          border-radius: 0;
          background: transparent;
          color: #000000;
          font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
          font-size: 1.4rem;
          text-align: center;
        }

        input.auto {
          color: #999999;
        }

        input:focus {
          outline: none;
          border-color: blue;
        }

        input:disabled {
          opacity: 0.4;
        }

        .reset {
          min-height: 1.4rem;
          padding: 0;
          border: none;
          background: transparent;
          color: blue;
          font-family: inherit;
          font-size: 0.75rem;
          cursor: pointer;
        }

        .reset[hidden] {
          display: block;
          visibility: hidden;
        }

        .note {
          margin: 0.9rem 0 0 0;
          font-size: 0.8rem;
          color: #555555;
          text-align: center;
        }
      </style>

      <p class="title">spacing</p>
      <div class="card">
        <div class="top">
          <span class="char" id="char"></span>
          <span class="hex" id="hex"></span>
          <span class="name" id="name"></span>
        </div>

        <div class="middle">
          <div class="side">
            <label for="leftInput">left</label>
            <input id="leftInput" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" />
            <button class="reset" id="leftReset" title="back to automatic">reset</button>
          </div>

          <svg viewBox="0 0 48 30" width="48" height="30" aria-hidden="true">
            <rect x="17" y="3" width="14" height="18" fill="#bbbbbb" />
            <path d="M2 12 H15 M2 8 V16 M6 9 L2 12 L6 15" stroke="#555555" fill="none" />
            <path d="M46 12 H33 M46 8 V16 M42 9 L46 12 L42 15" stroke="#555555" fill="none" />
            <path d="M17 27 H31 M17 24 V30 M31 24 V30" stroke="#555555" fill="none" />
          </svg>

          <div class="side">
            <label for="rightInput">right</label>
            <input id="rightInput" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" />
            <button class="reset" id="rightReset" title="back to automatic">reset</button>
          </div>
        </div>

        <div class="bottom">
          <input id="widthInput" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" />
          <label for="widthInput">width</label>
        </div>

        <p class="note" id="note"></p>
      </div>
    `
  }

  /**
   * Sets up the fields and the reset buttons.
   */
  setUpEventListeners() {
    const byId = (id) => this.shadowRoot.getElementById(id)

    for (const side of SIDES) {
      const input = byId(`${side}Input`)

      input.addEventListener('focus', () => input.select())
      input.addEventListener('change', () => this.commit(side, input))
      input.addEventListener('keydown', (e) => this.onKeyDown(e, side, input))
    }

    byId('leftReset').addEventListener('click', () => this.emit('left', null))
    byId('rightReset').addEventListener('click', () => this.emit('right', null))
  }

  /**
   * Handles keys in a field: enter confirms, escape cancels, and the up and
   * down arrows step the value by one pixel, or one unit with shift.
   * @param {KeyboardEvent} e
   * @param {string} side
   * @param {HTMLInputElement} input
   */
  onKeyDown(e, side, input) {
    if (e.key === 'Enter') {
      e.preventDefault()
      this.commit(side, input)
      input.blur()
    } else if (e.key === 'Escape') {
      input.value = this.values[side]
      input.blur()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      if (!this.current) return

      const typed = parseUnits(input.value)
      const base = typed === undefined ? this.current[side] : typed
      const step = e.shiftKey ? 1 : this.current.unit
      const value = base + (e.key === 'ArrowUp' ? step : -step)

      input.value = String(value)
      this.values[side] = String(value)
      this.emit(side, value)
    }
  }

  /**
   * Sends the value of a field to the editor, if it is a valid change. An
   * invalid value is replaced by the one that was shown before.
   * @param {string} side
   * @param {HTMLInputElement} input
   */
  commit(side, input) {
    if (!this.current) return

    const text = input.value.trim().toLowerCase()

    if (side !== 'width' && (text === '' || text === 'auto')) {
      if (this.current[`${side}IsAuto`]) input.value = this.values[side]
      else this.emit(side, null)
      return
    }

    const value = parseUnits(text)
    const alreadySet = side === 'width' || !this.current[`${side}IsAuto`]

    if (value === undefined) {
      input.value = this.values[side] // Not a number
    } else if (value !== this.current[side] || !alreadySet) {
      this.values[side] = String(value)
      this.emit(side, value)
    }
  }

  /**
   * @param {string} side - 'left', 'right' or 'width'
   * @param {number|null} value - font units, or null for automatic
   */
  emit(side, value) {
    this.dispatchEvent(new CustomEvent('spacing-change', { detail: { side, value } }))
  }

  /**
   * Takes keyboard focus away from the fields, so shortcuts work again
   * after the canvas is used.
   */
  blurInputs() {
    const active = this.shadowRoot.activeElement
    if (active) active.blur()
  }

  /**
   * Shows the spacing of the current glyph. A field that is being edited is
   * left alone.
   */
  refresh() {
    const root = this.shadowRoot
    if (!root.getElementById('leftInput')) return

    const { char, name, effective } = this.source()
    this.current = effective

    root.getElementById('char').textContent = char
    root.getElementById('hex').textContent = char ? char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') : ''
    root.getElementById('name').textContent = name

    for (const side of SIDES) {
      const input = root.getElementById(`${side}Input`)
      const value = effective ? String(effective[side]) : ''

      this.values[side] = value
      input.disabled = !effective
      if (root.activeElement !== input) input.value = value

      if (side !== 'width') {
        const automatic = !effective || effective[`${side}IsAuto`]
        input.classList.toggle('auto', automatic)
        root.getElementById(`${side}Reset`).hidden = automatic
      }
    }

    root.getElementById('note').textContent = effective
      ? `1 px = ${effective.unit} units · gray values are automatic and follow the margin`
      : 'draw something to set its spacing'
  }
}

customElements.define('glyph-spacing', GlyphSpacing)
