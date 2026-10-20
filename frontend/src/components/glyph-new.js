/**
 * The new font page: a name, a grid size and a create button. It shows what
 * source() gives it and sends an event. The app does the request.
 *
 * source() returns { busy, error }. Call refresh() when that has changed.
 * Events: project-create { name, gridSize }
 *
 * @version 0.1.0
 */

import { SIZES } from '../core/grid.js'

const DEFAULT_SIZE = 32
const MAX_NAME_LENGTH = 60

class GlyphNew extends HTMLElement {
  /**
   * Creates the shadow root and an empty source.
   */
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.source = () => ({ busy: false, error: '' })
  }

  /**
   * Draws the page and starts listening.
   */
  connectedCallback() {
    this.render()
    this.setUpEventListeners()
    this.refresh()
    this.nameInput.focus({ preventScroll: true })
  }

  /**
   * Draws the page.
   */
  render() {
    const sizes = SIZES.map(
      (size) =>
        `<option value="${size}"${size === DEFAULT_SIZE ? ' selected' : ''}>${size}×${size}</option>`
    ).join('')

    this.shadowRoot.innerHTML = `
      <style>

        @keyframes bounce {
          0%, 100% { transform: translateY(0) }
          50% { transform: translateY(-4px); }
        }

        :host {
          display: block;
          color: var(--fg);
          font-family: var(--font);
        }

        .page {
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: calc(100vh - var(--header-h));
          padding: 0 1.5rem 18vh;
        }

        .box {
          width: min(26rem, 100%);
          animation: rise 0.6s var(--ease) both;
        }

        h1 {
          margin: 0 0 0.5rem;
          font-size: var(--fs-heading);
          font-weight: 700;
          animation: bounce 0.4s ease infinite;
        }

        form {
          display: flex;
          gap: 0.4rem;
          font-weight:600;
        }

        input,
        select,
        button {
          box-sizing: border-box;
          border: 0;
          border-radius: 0;
          padding: 0.55rem 0.8rem;
          color: var(--on-accent);
          font: inherit;
          font-size: 1rem;
          transition: transform 0.15s var(--ease), box-shadow 0.15s var(--ease), opacity 0.2s;
        }

        input {
          flex: 1 1 auto;
          min-width: 0;
          background: var(--red);
        }

        input::placeholder {
          color: var(--on-accent);
          opacity: 1;
        }

       

        select {
          appearance: none;
          background: var(--green);
          text-align: center;
          cursor: pointer;
        }

        option {
          background: var(--bg);
          color: var(--fg);
        }

        button {
          background: var(--blue);
          cursor: pointer;
        }

        select:hover:not(:disabled),
        select:focus-visible,
        button:hover:not(:disabled),
        button:focus-visible {
          transform: translate(-2px, -2px);
          box-shadow: 2px 2px 0 var(--fg);
          outline: none;
        }

        select:active,
        button:active {
          transform: none;
          box-shadow: none;
        }

        input:disabled,
        select:disabled,
        button:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .hint {
          margin: 0.75rem 0 0;
          color: var(--muted);
          font-size: var(--fs-small);
        }

        .error {
          margin: 0.75rem 0 0;
          color: var(--red);
          font-size: var(--fs-body);
        }

        [hidden] {
          display: none;
        }

        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation: none !important;
            transition: none !important;
          }
        }
      </style>
      <div class="page">
        <div class="box">
          <h1>new font</h1>
          <form>
            <input name="name" placeholder="name of the new font" maxlength="${MAX_NAME_LENGTH}" required autocomplete="off" aria-label="font name" />
            <select name="size" aria-label="grid size">${sizes}</select>
            <button type="submit">create</button>
          </form>
          <p class="hint">the grid size is fixed for the whole project.</p>
          <p class="error" role="alert" hidden></p>
        </div>
      </div>
    `

    const root = this.shadowRoot
    this.form = root.querySelector('form')
    this.nameInput = root.querySelector('[name=name]')
    this.sizeSelect = root.querySelector('[name=size]')
    this.submitButton = root.querySelector('button')
    this.errorEl = root.querySelector('.error')
  }

  /**
   * Listens for the form.
   */
  setUpEventListeners() {
    this.form.addEventListener('submit', (event) => {
      event.preventDefault()

      const name = this.nameInput.value.trim()
      if (!name) return

      this.dispatchEvent(
        new CustomEvent('project-create', {
          detail: { name, gridSize: Number(this.sizeSelect.value) },
        })
      )
    })
  }

  /**
   * Shows the busy state and the error from source().
   */
  refresh() {
    if (!this.form) return

    const { busy, error } = this.source()

    for (const element of [this.nameInput, this.sizeSelect, this.submitButton]) {
      element.disabled = busy
    }

    this.errorEl.textContent = error
    this.errorEl.hidden = !error
  }
}

customElements.define('glyph-new', GlyphNew)
