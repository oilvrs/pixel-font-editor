/**
 * The log in and create account form. It shows what it is given and sends an
 * event when the form is submitted. The app does the actual request.
 *
 * Attributes: busy, error, notice. The mode (log in or create account) is the
 * only state the form keeps itself.
 * Events: auth-submit { mode, username, password }
 *
 * @version 0.1.0
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
        :host { display: block; max-width: 22rem; margin: 10vh auto 0; padding: 0 1rem; font: inherit; color: inherit; }
        h1 { font-size: 1.5em; font-weight: normal; margin: 0 0 1.5rem; }
        p { margin: 0 0 1rem; }
        label { display: block; margin-bottom: 1rem; }
        input { display: block; box-sizing: border-box; width: 100%; margin-top: 0.25rem; padding: 0.4rem; font: inherit; color: inherit; background: transparent; border: 1px solid currentColor; }
        button { font: inherit; color: inherit; background: transparent; border: 1px solid currentColor; padding: 0.4rem 0.8rem; cursor: pointer; }
        button.link { border: 0; padding: 0.4rem 0; text-decoration: underline; }
        button:disabled, input:disabled { opacity: 0.5; cursor: default; }
        .actions { display: flex; gap: 1rem; align-items: center; }
        .error { color: #e0574b; }
        .notice, .help, .hint { opacity: 0.7; }
        [hidden] { display: none; }
      </style>
      <form>
        <h1>pixel glyph editor</h1>
        <p class="notice" hidden></p>
        <label>username
          <input name="username" required minlength="3" maxlength="30" autocomplete="username" autocapitalize="none" spellcheck="false">
        </label>
        <label>password
          <input name="password" type="password" required maxlength="72">
        </label>
        <p class="help" hidden>at least 10 characters.</p>
        <p class="error" role="alert" hidden></p>
        <p class="hint" hidden>connecting. the server may need up to a minute to wake up.</p>
        <div class="actions">
          <button type="submit" class="submit"></button>
          <button type="button" class="link switch"></button>
        </div>
      </form>
    `

    const root = this.shadowRoot
    this.form = root.querySelector('form')
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
