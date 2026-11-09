/**
 * The new font page: a name, a grid size and a create button, and a way to
 * import a font. It shows what source() gives it and sends events. The app
 * does the requests.
 *
 * source() returns { busy, error }. Call refresh() when that has changed.
 * Events: project-create { name, gridSize }, project-import { name, gridSize, file }
 *
 * @version 0.2.0
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
          min-height: calc(100dvh - var(--header-h));
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
        }

        form {
          display: flex;
          gap: 0.4rem;
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

        input:focus-visible {
          outline: 2px solid var(--fg);
          outline-offset: 2px;
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

        .import {
          margin: 1.5rem 0 0;
        }

        button.link {
          min-height: 0;
          padding: 0;
          background: none;
          color: var(--fg);
          font-size: var(--fs-small);
          text-decoration: underline;
        }

        button.link:hover:not(:disabled),
        button.link:focus-visible {
          transform: none;
          box-shadow: none;
        }

        .import .hint {
          margin-top: 0.25rem;
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

        /* Mobile layout */
        @media (max-width: 30rem) {
          form {
            flex-wrap: wrap;
          }

          input {
            flex: 1 1 100%;
          }

          select,
          form button {
            flex: 1 1 0;
            min-height: 48px;
          }
        }

        @media (hover: none) {
          select:hover:not(:disabled),
          button:hover:not(:disabled) {
            transform: none;
            box-shadow: none;
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
          <div class="import">
            <button type="button" class="link" id="importBtn">import a font</button>
            <input type="file" id="importFile" accept=".zip,.ufoz,application/zip" hidden />
            <p class="hint">a .ufo from this editor, zipped (.zip or .ufoz). it is imported at the grid size above, and the name is optional.</p>
          </div>
          <p class="error" role="alert" hidden></p>
        </div>
      </div>
    `

    const root = this.shadowRoot
    this.form = root.querySelector('form')
    this.nameInput = root.querySelector('[name=name]')
    this.sizeSelect = root.querySelector('[name=size]')
    this.submitButton = root.querySelector('form button')
    this.importButton = root.getElementById('importBtn')
    this.importFile = root.getElementById('importFile')
    this.errorEl = root.querySelector('.error')
  }

  /**
   * Listens for the form and for the import.
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

    this.importButton.addEventListener('click', () => this.importFile.click())

    this.importFile.addEventListener('change', () => {
      const file = this.importFile.files[0]

      // The field is emptied, so that the same file can be chosen again.
      this.importFile.value = ''
      if (!file) return

      this.dispatchEvent(
        new CustomEvent('project-import', {
          detail: {
            name: this.nameInput.value.trim(),
            gridSize: Number(this.sizeSelect.value),
            file,
          },
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

    for (const element of [this.nameInput, this.sizeSelect, this.submitButton, this.importButton]) {
      element.disabled = busy
    }

    this.errorEl.textContent = error
    this.errorEl.hidden = !error
  }
}

customElements.define('glyph-new', GlyphNew)
