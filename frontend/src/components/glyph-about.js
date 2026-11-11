/**
 * The about page: what the app is, what it stores, and the copyright.
 * The text is a list at the top of render(), so it is easy to change.
 *
 * @version 0.1.0
 */

const FIRST_YEAR = 2026

class GlyphAbout extends HTMLElement {
  /**
   * Creates the shadow root.
   */
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  /**
   * Draws the page.
   */
  connectedCallback() {
    this.render()
  }

  /**
   * Draws the page. The text is set with textContent, never as HTML.
   */
  render() {
    const year = new Date().getFullYear()
    const years = year > FIRST_YEAR ? `${FIRST_YEAR}–${year}` : String(FIRST_YEAR)

    const content = [
      ['h1', 'about'],
      [
        'p',
        'o_p_g + tools is an editor for drawing pixel fonts in the browser. Draw each character on a grid from 8×8 to 128×128, put vector shapes on top of the pixels, set the spacing between the letters and test your text while you draw.',
      ],
      [
        'p',
        'Your fonts are saved to your account, so you can make several and come back to them later. Export a font as UFO to continue in Glyphs, as TrueType or WOFF for the web, or export single glyphs as SVG or PNG.',
      ],
      ['h2', 'your data'],
      [
        'p',
        'An account is a username and a password. The password is stored as a hash, never as text. Your fonts are stored so that you can open them again. Your browser keeps your login, your theme and changes that are not saved yet in its local storage. This site sets no cookies and has no analytics.',
      ],
      [
        'p',
        'The typeface is loaded from Adobe Fonts, which means that your browser contacts Adobe when a page is opened.',
      ],
      ['h2', 'copyright'],
      ['p', `© ${years} Oliver Woodhouse. All rights reserved. The fonts you make are yours.`],
      ['p', 'Typeface: Neue Haas Grotesk Display, from Adobe Fonts.'],
    ]

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          color: var(--fg);
          font-family: var(--font);
        }

        article {
          box-sizing: border-box;
          max-width: 38rem;
          margin: 0 auto;
          padding: 3rem 1.5rem 4rem;
          animation: rise 0.5s var(--ease) both;
        }

        h1 {
          margin: 0 0 1.5rem;
          font-size: var(--fs-title);
          font-weight: 700;
          line-height: 1.1;
        }

        h2 {
          margin: 2.25rem 0 0.75rem;
          font-size: var(--fs-heading);
          font-weight: 700;
        }

        p {
          margin: 0 0 1rem;
          font-size: 1rem;
          line-height: 1.55;
        }

        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
        }

        @media (max-width: 40rem) {
          article {
            padding: 1.5rem 1rem 3rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation: none !important;
          }
        }
      </style>
      <article></article>
    `

    const article = this.shadowRoot.querySelector('article')

    for (const [tag, text] of content) {
      const element = document.createElement(tag)
      element.textContent = text
      article.append(element)
    }
  }
}

customElements.define('glyph-about', GlyphAbout)
