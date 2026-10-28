/**
 * The header, shown in every view: the logotype and the name of the site on
 * the left, and the links to the new font page and the profile on the right.
 * The links are only shown when someone is logged in.
 *
 * Attributes: route ('new', 'profile', 'editor' or 'login'), signed-in
 *
 * @version 0.1.0
 */

class GlyphHeader extends HTMLElement {
  static get observedAttributes() {
    return ['route', 'signed-in']
  }

  /**
   * Creates the shadow root.
   */
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  /**
   * Draws the header.
   */
  connectedCallback() {
    this.render()
    this.update()
  }

  /**
   * Updates the links when an attribute changes.
   */
  attributeChangedCallback() {
    if (this.nav) this.update()
  }

  /**
   * Draws the header.
   */
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          position: sticky;
          top: 0;
          z-index: 20;
          box-sizing: border-box;
          height: var(--header-h);
          background: var(--bg);
          color: var(--fg);
          font-family: var(--font);
        }

        header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight:700;
          gap: 1.5rem;
          height: 100%;
          padding: 0 2rem;
        }

        a {
          color: inherit;
          text-decoration: none;
          transition: color 0.25s var(--ease);
        }

        a:focus-visible {
          outline: 2px solid var(--blue-ui);
          outline-offset: 4px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 1rem;
          font-size: var(--fs-nav);
        }

        .brand img {
          display: block;
          width: 40px;
          height: 40px;
          image-rendering: pixelated;
          filter: var(--logo-filter);
          transition: transform 0.3s var(--ease);
        }

        .brand:hover img {
          transform: translateY(-2px);
        }

        .brand:hover span {
          color: var(--blue-ui);
        }

        .brand span {
          transition: color 0.25s var(--ease);
        }

        nav {
          display: flex;
          gap: 3rem;
          font-size: var(--fs-nav);
        }

        nav a {
          position: relative;
          padding: 0.25rem 0;
        }

        nav a::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          bottom: -2px;
          height: 3px;
          background: currentColor;
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.3s var(--ease);
        }

        nav a:hover::after {
          transform: scaleX(1);
        }

        nav a[aria-current] {
          color: var(--blue-ui);
        }

        [hidden] {
          display: none;
        }

        @media (max-width: 36rem) {
          header {
            padding: 0 1rem;
          }

          nav {
            gap: 1.5rem;
          }

          .brand span {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            transition: none !important;
          }
        }
        /* Mobile layout */
        @media (max-width: 40rem) {
          .brand {
            gap: 0.75rem;
          }

          .brand img {
            width: 32px;
            height: 32px;
          }

          nav {
            font-size: 1.05rem;
          }
        }

      </style>
      <header>
        <a class="brand" href="#/new" aria-label="o_p_g + tools: new font">
          <img src="images/logotype.png" alt="" width="40" height="40" />
          <span>o_p_g + tools</span>
        </a>
        <nav aria-label="main">
          <a href="#/new" data-route="new">new</a>
          <a href="#/profile" data-route="profile">profile</a>
        </nav>
      </header>
    `

    this.nav = this.shadowRoot.querySelector('nav')
  }

  /**
   * Shows or hides the links, and marks the page that is open.
   */
  update() {
    const route = this.getAttribute('route')

    this.nav.hidden = !this.hasAttribute('signed-in')

    for (const link of this.nav.querySelectorAll('a')) {
      if (link.dataset.route === route) link.setAttribute('aria-current', 'page')
      else link.removeAttribute('aria-current')
    }
  }
}

customElements.define('glyph-header', GlyphHeader)
