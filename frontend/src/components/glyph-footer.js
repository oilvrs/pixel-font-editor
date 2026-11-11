/**
 * The footer, shown in every view: the copyright line and a link to the about page.
 *
 * @version 0.1.0
 */

const FIRST_YEAR = 2026

class GlyphFooter extends HTMLElement {
  /**
   * Creates the shadow root.
   */
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  /**
   * Draws the footer.
   */
  connectedCallback() {
    const year = new Date().getFullYear()
    const years = year > FIRST_YEAR ? `${FIRST_YEAR}–${year}` : String(FIRST_YEAR)

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          color: var(--muted);
          font-family: var(--font);
        }

        footer {
          box-sizing: border-box;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.25rem 1.5rem;
          min-height: var(--footer-h);
          padding: 0.75rem 2rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
          border-top: 1px solid var(--line-soft);
          font-size: var(--fs-small);
        }

        p {
          margin: 0;
        }

        a {
          color: var(--fg);
          text-underline-offset: 3px;
          transition: color 0.25s var(--ease);
        }

        a:hover {
          color: var(--blue-ui);
        }

        a:focus-visible {
          outline: 2px solid var(--blue-ui);
          outline-offset: 3px;
        }

        @media (max-width: 40rem) {
          footer {
            padding-right: 1rem;
            padding-left: 1rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            transition: none !important;
          }
        }
      </style>
      <footer>
        <p>© <span id="years"></span> Oliver Woodhouse. All rights reserved.</p>
        <a href="#/about">about</a>
      </footer>
    `

    this.shadowRoot.getElementById('years').textContent = years
  }
}

customElements.define('glyph-footer', GlyphFooter)
