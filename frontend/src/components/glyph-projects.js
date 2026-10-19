/**
 * The project list: the user's fonts, and a form for a new one. It shows what
 * source() gives it and sends events. The app does the requests.
 *
 * source() returns { username, projects, loading, busy, error }. Call
 * refresh() when that data has changed.
 * Events: project-create { name, gridSize }, project-open { id },
 * project-rename { id, name }, project-delete { id }, projects-reload, logout
 *
 * @version 0.1.0
 */

import { SIZES } from '../core/grid.js'

const DEFAULT_SIZE = 32
const MAX_NAME_LENGTH = 60

/**
 * Formats a time from the server for the list.
 * @param {string} iso
 * @returns {string} for example '2026-10-14 13:55'
 */
function formatDate(iso) {
  return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
}

class GlyphProjects extends HTMLElement {
  /**
   * Creates the shadow root and an empty source.
   */
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.source = () => ({ username: '', projects: [], loading: false, busy: false, error: '' })
  }

  /**
   * Draws the view and starts listening.
   */
  connectedCallback() {
    this.render()
    this.setUpEventListeners()
    this.refresh()
  }

  /**
   * Draws the static parts: heading, form and the empty list.
   */
  render() {
    const sizes = SIZES.map(
      (size) =>
        `<option value="${size}"${size === DEFAULT_SIZE ? ' selected' : ''}>${size}×${size}</option>`
    ).join('')

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; max-width: 40rem; margin: 6vh auto 0; padding: 0 1rem; font: inherit; color: inherit; }
        header { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: 1.5rem; }
        .title {color:red;}
        h1 { font-size: 1.5em; font-weight: normal; margin: 0; }
        form { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        input, select { font: inherit; color: inherit; background: transparent; border: 1px solid currentColor; padding: 0.4rem; }
        input { flex: 1 1 12rem; min-width: 0; }
        option { color: initial; }
        button { font: inherit; color: inherit; background: transparent; border: 1px solid currentColor; padding: 0.4rem 0.8rem; cursor: pointer; }
        button.name { border: 0; padding: 0; text-decoration: underline; font-size: 1.1em; text-align: left; }
        button:disabled, input:disabled, select:disabled { opacity: 0.5; cursor: default; }
        .hint, .meta { opacity: 0.7; }
        .hint { margin: 0.5rem 0 1.5rem; }
        .status { margin-bottom: 1rem; }
        .error { color: #e0574b; }
        ul { list-style: none; padding: 0; margin: 0; }
        li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem 1rem; padding: 0.6rem 0; border-top: 1px solid rgba(128, 128, 128, 0.4); }
        li .meta { flex: 1 1 12rem; }
      </style>
      <header>
        <h1 class="title">wood___house font editor<h1>
        <h1>projects</h1>
        <div><span class="user"></span> <button type="button" class="logout">log out</button></div>
      </header>
      <form class="create">
        <input name="name" placeholder="name of the new font" maxlength="${MAX_NAME_LENGTH}" required autocomplete="off" aria-label="font name">
        <select name="size" aria-label="grid size">${sizes}</select>
        <button type="submit" class="create-button">new project</button>
      </form>
      <p class="hint">the grid size is fixed for the whole project.</p>
      <div class="status"></div>
      <ul></ul>
    `

    const root = this.shadowRoot
    this.userEl = root.querySelector('.user')
    this.createForm = root.querySelector('.create')
    this.nameInput = root.querySelector('[name=name]')
    this.sizeSelect = root.querySelector('[name=size]')
    this.createButton = root.querySelector('.create-button')
    this.statusEl = root.querySelector('.status')
    this.list = root.querySelector('ul')
  }

  /**
   * Listens for log out and for the form for a new project.
   */
  setUpEventListeners() {
    this.shadowRoot.querySelector('.logout').addEventListener('click', () => this.emit('logout'))

    this.createForm.addEventListener('submit', (event) => {
      event.preventDefault()

      const name = this.nameInput.value.trim()
      if (!name) return

      this.emit('project-create', { name, gridSize: Number(this.sizeSelect.value) })
    })
  }

  /**
   * Draws the user name, the status line and the list from source().
   */
  refresh() {
    if (!this.isConnected || !this.list) return

    const { username, projects, loading, busy, error } = this.source()

    this.userEl.textContent = username
    this.nameInput.disabled = busy
    this.sizeSelect.disabled = busy
    this.createButton.disabled = busy

    this.statusEl.replaceChildren()

    if (loading) {
      this.statusEl.textContent = 'loading projects…'
    } else if (error) {
      const message = document.createElement('span')
      message.className = 'error'
      message.textContent = error
      this.statusEl.append(
        message,
        ' ',
        this.makeButton('try again', () => this.emit('projects-reload'))
      )
    } else if (projects.length === 0) {
      this.statusEl.textContent = 'no projects yet. create one above.'
    }

    this.list.replaceChildren(...projects.map((project) => this.makeRow(project, busy)))
  }

  /**
   * Makes one row of the list. Text is set with textContent, never as HTML.
   * @param {Object} project - { id, name, gridSize, glyphCount, updatedAt }
   * @param {boolean} busy
   * @returns {HTMLLIElement}
   */
  makeRow(project, busy) {
    const item = document.createElement('li')

    const open = this.makeButton(
      project.name,
      () => this.emit('project-open', { id: project.id }),
      busy
    )
    open.className = 'name'
    open.title = 'open this project'

    const count = project.glyphCount
    const meta = document.createElement('span')
    meta.className = 'meta'
    meta.textContent = `${project.gridSize}×${project.gridSize} · ${count} ${count === 1 ? 'glyph' : 'glyphs'} · ${formatDate(project.updatedAt)}`

    const rename = this.makeButton(
      'rename',
      () => {
        const name = window.prompt('new name', project.name)
        const trimmed = name ? name.trim().slice(0, MAX_NAME_LENGTH) : ''

        if (trimmed && trimmed !== project.name)
          this.emit('project-rename', { id: project.id, name: trimmed })
      },
      busy
    )

    const remove = this.makeButton(
      'delete',
      () => {
        if (window.confirm(`delete "${project.name}" and all its glyphs? this cannot be undone.`)) {
          this.emit('project-delete', { id: project.id })
        }
      },
      busy
    )

    item.append(open, meta, rename, remove)
    return item
  }

  /**
   * Makes a button.
   * @param {string} label
   * @param {Function} onClick
   * @param {boolean} [disabled]
   * @returns {HTMLButtonElement}
   */
  makeButton(label, onClick, disabled = false) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.disabled = disabled
    button.addEventListener('click', onClick)
    return button
  }

  /**
   * Sends an event to the app.
   * @param {string} name
   * @param {Object} [detail]
   */
  emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { detail }))
  }
}

customElements.define('glyph-projects', GlyphProjects)
