/**
 * The log in and create account form. It shows what it is given and sends an
 * event when the form is submitted. The app does the actual request.
 *
 * Attributes: busy, error, notice. The mode (log in or create account) is the
 * only state the form keeps itself.
 * Events: auth-submit { mode, username, password }
 *
 * @version 0.2.0
 */

const HINT_DELAY_MS = 4000

class GlyphLogin extends HTMLElement {
  static get observedAttributes() {
    return ['busy', 'error', 'notice']
  }

  /**
   * Creates the shadow root.
   */
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.mode = 'login'
    this.hintTimer = null
  }

  /**
   * Draws the form and starts listening.
   */
  connectedCallback() {
    this.render()
    this.setUpEventListeners()
    this.update()
  }

  /**
   * Stops the timer for the "server is waking up" hint.
   */
  disconnectedCallback() {
    clearTimeout(this.hintTimer)
  }

  /**
   * Updates the form when an attribute changes. The form is not drawn again,
   * so what has been typed is kept.
   */
  attributeChangedCallback() {
    if (this.form) this.update()
  }

  /**
   * Draws the form.
   */
  render() {
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
          min-height: calc(100dvh - var(--header-h));
          padding: 0 1.5rem 14vh;
        }

        .box {
          width: min(22rem, 100%);
          animation: rise 0.6s var(--ease) both;
        }

        h1 {
          margin: 0 0 1.25rem;
          font-size: var(--fs-heading);
          font-weight: 700;
        }

        p {
          margin: 0 0 1rem;
          font-size: var(--fs-small);
        }

        label {
          display: block;
          margin-bottom: 0.9rem;
          color: var(--muted);
          font-size: var(--fs-small);
        }

        input {
          display: block;
          box-sizing: border-box;
          width: 100%;
          margin-top: 0.3rem;
          padding: 0.55rem 0.7rem;
          border: 0;
          border-radius: 0;
          color: var(--on-accent);
          font: inherit;
          font-size: 1rem;
        }

        input.user {
          background: var(--red);
        }

        input.pass {
          background: var(--green);
        }

        input:focus-visible {
          outline: 2px solid var(--fg);
          outline-offset: 2px;
        }

        .actions {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          margin-top: 1.25rem;
        }

        .submit {
          padding: 0.55rem 1.1rem;
          border: 0;
          background: var(--blue);
          color: var(--on-accent);
          font: inherit;
          font-size: 1rem;
          cursor: pointer;
          transition: transform 0.15s var(--ease), box-shadow 0.15s var(--ease), opacity 0.2s;
        }

        .submit:hover:not(:disabled),
        .submit:focus-visible {
          transform: translate(-2px, -2px);
          box-shadow: 2px 2px 0 var(--fg);
          outline: none;
        }

        .submit:active {
          transform: none;
          box-shadow: none;
        }

        .switch {
          padding: 0.55rem 0;
          border: 0;
          background: none;
          color: var(--fg);
          font: inherit;
          font-size: var(--fs-small);
          text-decoration: underline;
          cursor: pointer;
        }

        input:disabled,
        button:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .error {
          color: var(--red);
        }

        .notice,
        .help,
        .hint {
          color: var(--muted);
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
          .actions {
            flex-wrap: wrap;
          }

          .submit {
            min-height: 48px;
          }
        }

        @media (hover: none) {
          .submit:hover:not(:disabled) {
            transform: none;
            box-shadow: none;
          }
        }

      </style>
      <div class="page">
        <form class="box">
          <h1 id="title"></h1>
          <p class="notice" hidden></p>
          <label>username
            <input class="user" name="username" required minlength="3" maxlength="30" autocomplete="username" autocapitalize="none" spellcheck="false" />
          </label>
          <label>password
            <input class="pass" name="password" type="password" required maxlength="72" />
          </label>
          <p class="help" hidden>at least 10 characters.</p>
          <p class="error" role="alert" hidden></p>
          <p class="hint" hidden>connecting. the server may need up to a minute to wake up.</p>
          <div class="actions">
            <button type="submit" class="submit"></button>
            <button type="button" class="switch"></button>
          </div>
        </form>
      </div>
    `

    const root = this.shadowRoot
    this.form = root.querySelector('form')
    this.titleEl = root.getElementById('title')
    this.usernameInput = root.querySelector('[name=username]')
    this.passwordInput = root.querySelector('[name=password]')
    this.noticeEl = root.querySelector('.notice')
    this.helpEl = root.querySelector('.help')
    this.errorEl = root.querySelector('.error')
    this.hintEl = root.querySelector('.hint')
    this.submitButton = root.querySelector('.submit')
    this.switchButton = root.querySelector('.switch')
  }

  /**
   * Listens for submit and for the switch between log in and create account.
   */
  setUpEventListeners() {
    this.form.addEventListener('submit', (event) => {
      event.preventDefault()

      this.dispatchEvent(
        new CustomEvent('auth-submit', {
          detail: {
            mode: this.mode,
            username: this.usernameInput.value.trim(),
            password: this.passwordInput.value,
          },
        })
      )
    })

    this.switchButton.addEventListener('click', () => {
      this.mode = this.mode === 'login' ? 'register' : 'login'
      this.removeAttribute('error')
      this.update()
    })
  }

  /**
   * Shows the mode and the attributes.
   */
  update() {
    const register = this.mode === 'register'
    const busy = this.hasAttribute('busy')
    const error = this.getAttribute('error') || ''
    const notice = this.getAttribute('notice') || ''

    this.titleEl.textContent = register ? 'create account' : 'log in'
    this.noticeEl.textContent = notice
    this.noticeEl.hidden = !notice
    this.errorEl.textContent = error
    this.errorEl.hidden = !error
    this.helpEl.hidden = !register

    this.passwordInput.autocomplete = register ? 'new-password' : 'current-password'

    // A short password is only a problem when an account is created.
    if (register) this.passwordInput.setAttribute('minlength', '10')
    else this.passwordInput.removeAttribute('minlength')

    this.submitButton.textContent = register ? 'create account' : 'log in'
    this.switchButton.textContent = register ? 'i already have an account' : 'create an account'

    for (const element of [
      this.usernameInput,
      this.passwordInput,
      this.submitButton,
      this.switchButton,
    ]) {
      element.disabled = busy
    }

    clearTimeout(this.hintTimer)
    this.hintEl.hidden = true

    if (busy) {
      this.hintTimer = setTimeout(() => {
        this.hintEl.hidden = false
      }, HINT_DELAY_MS)
    }
  }
}

customElements.define('glyph-login', GlyphLogin)
