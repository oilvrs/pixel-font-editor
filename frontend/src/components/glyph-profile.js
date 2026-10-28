/**
 * The profile page: the user's name and a card for each of their fonts. It
 * shows what source() gives it and sends events. The app does the requests.
 *
 * source() returns { username, projects, loading, busy, error, theme }. Call
 * refresh() when that has changed.
 * Events: project-rename { id, name }, project-delete { id }, projects-reload,
 * theme-toggle, logout. A card is a link to #/p/<id>, so opening needs no event.
 *
 * @version 0.1.0
 */

import { palette } from '../utils/theme.js'
import { drawThumbnail } from '../utils/thumbnail.js'

const MAX_NAME_LENGTH = 60
const COLORS = ['var(--red)', 'var(--green)', 'var(--blue)']

/**
 * Formats a time from the server for the cards.
 * @param {string} iso
 * @returns {string} for example '2026-10-14'
 */
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('sv-SE')
}

class GlyphProfile extends HTMLElement {
  /**
   * Creates the shadow root and an empty source.
   */
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.animated = false // The cards fade in once, not on every redraw
    this.thumbData = new WeakMap() // thumbnail element -> project
    this.observer = new ResizeObserver((entries) => {
      for (const entry of entries) this.drawThumbnailOf(entry.target)
    })
    this.source = () => ({
      username: '',
      projects: [],
      loading: false,
      busy: false,
      error: '',
      theme: 'light',
    })
  }

  /**
   * Draws the page and starts listening.
   */
  connectedCallback() {
    this.render()
    this.setUpEventListeners()
    this.refresh()
  }

  /**
   * Stops watching the thumbnails.
   */
  disconnectedCallback() {
    this.observer.disconnect()
  }

  /**
   * Draws the static parts: the title row, the status line and the empty grid.
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
          max-width: 42.5rem;
          margin: 0 auto;
          padding: 2.5rem 1.5rem 5rem;
        }

        .title-row {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.75rem 1.5rem;
          margin-bottom: 1.5rem;
          animation: rise 0.5s var(--ease) both;
        }

        h1 {
          margin: 0;
          font-size: var(--fs-title);
          font-weight: 700;
          line-height: 1.1;
          overflow-wrap: anywhere;
        }

        .tools {
          display: flex;
          gap: 0.5rem;
        }

        .tool {
          padding: 0.4rem 0.8rem;
          border: 1px solid var(--fg);
          background: transparent;
          color: var(--fg);
          font: inherit;
          font-size: var(--fs-small);
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
        }

        .tool:hover {
          background: var(--fg);
          color: var(--bg);
        }

        .tool:focus-visible,
        a:focus-visible {
          outline: 3px solid var(--blue-ui);
          outline-offset: 3px;
        }

        .status {
          margin-bottom: 1rem;
          font-size: var(--fs-body);
        }

        .status .error {
          color: var(--red);
        }

        .status button,
        .status a {
          margin-left: 0.5rem;
          padding: 0;
          border: 0;
          background: none;
          color: inherit;
          font: inherit;
          text-decoration: underline;
          cursor: pointer;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr));
          gap: 1.3rem;
        }

        .card {
          position: relative;
          display: flex;
          flex-direction: column;
          aspect-ratio: 212 / 206;
          padding: 14px 14px 36px;
          background: var(--c);
          transition: transform 0.25s var(--ease), box-shadow 0.25s var(--ease);
        }

        .animate .card {
          animation: card-in 0.55s var(--ease) both;
          animation-delay: calc(var(--i) * 60ms);
        }

        .card:hover,
        .card:focus-within {
          transform: translate(-3px, -3px);
          box-shadow: 3px 3px 0 var(--fg);
        }

        .paper {
          display: flex;
          flex: 1;
          flex-direction: column;
          min-height: 0;
          box-sizing: border-box;
          padding: 0.9rem;
          background: var(--bg);
          color: var(--fg);
          text-decoration: none;
        }

        .thumb {
          display: flex;
          flex: 1;
          align-items: center;
          justify-content: flex-start;
          min-height: 0;
          overflow: hidden;
        }

        .thumb canvas {
          display: block;
        }

        .name {
          overflow: hidden;
          font-size: var(--fs-body);
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .specs {
          overflow: hidden;
          color: var(--muted);
          font-size: 0.75rem;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .actions {
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 0;
          display: flex;
          align-items: center;
          gap: 1rem;
          height: 36px;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .card:hover .actions,
        .card:focus-within .actions {
          opacity: 1;
        }

        @media (hover: none) {
          .actions {
            opacity: 1;
          }
        }

        .actions button {
          padding: 0;
          border: 0;
          background: none;
          color: var(--on-accent);
          font: inherit;
          font-size: var(--fs-small);
          text-decoration: underline;
          cursor: pointer;
        }

        .actions button:disabled {
          opacity: 0.5;
          cursor: default;
        }

        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
        }

        @keyframes card-in {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation: none !important;
            transition: none !important;
          }
        }
        /* Mobile layout */
        @media (max-width: 40rem) {
          .page {
            padding: 1.5rem 1rem 4rem;
          }

          .grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.9rem;
          }

          .card {
            padding: 10px 10px 30px;
          }

          .actions {
            left: 10px;
            right: 10px;
            height: 30px;
          }

          .paper {
            padding: 0.6rem;
          }

          .name {
            font-size: 0.85rem;
          }
        }

        @media (pointer: coarse) {
          .tool {
            padding: 0.6rem 0.9rem;
          }
        }

        @media (hover: none) {
          .card:hover {
            transform: none;
            box-shadow: none;
          }

          .tool:hover {
            background: transparent;
            color: var(--fg);
          }
        }

      </style>
      <div class="page">
        <div class="title-row">
          <h1 id="title"></h1>
          <div class="tools">
            <button type="button" class="tool" id="themeBtn"></button>
            <button type="button" class="tool" id="logoutBtn">log out</button>
          </div>
        </div>
        <div class="status" id="status"></div>
        <div class="grid" id="grid"></div>
      </div>
    `

    const root = this.shadowRoot
    this.titleEl = root.getElementById('title')
    this.themeButton = root.getElementById('themeBtn')
    this.statusEl = root.getElementById('status')
    this.grid = root.getElementById('grid')
  }

  /**
   * Listens for the buttons in the title row.
   */
  setUpEventListeners() {
    this.themeButton.addEventListener('click', () => this.emit('theme-toggle'))
    this.shadowRoot.getElementById('logoutBtn').addEventListener('click', () => this.emit('logout'))
  }

  /**
   * Draws the title, the status line and the cards from source().
   */
  refresh() {
    if (!this.isConnected || !this.grid) return

    this.observer.disconnect()

    const { username, projects, loading, busy, error, theme } = this.source()
    const dark = theme === 'dark'

    this.titleEl.textContent = `@${username}`
    this.themeButton.textContent = `dark mode: ${dark ? 'on' : 'off'}`
    this.themeButton.setAttribute('aria-pressed', String(dark))

    this.statusEl.replaceChildren()

    if (loading) {
      this.statusEl.textContent = 'loading fonts…'
    } else if (error) {
      const message = document.createElement('span')
      message.className = 'error'
      message.textContent = error

      const retry = document.createElement('button')
      retry.type = 'button'
      retry.textContent = 'try again'
      retry.addEventListener('click', () => this.emit('projects-reload'))

      this.statusEl.append(message, retry)
    } else if (projects.length === 0) {
      const link = document.createElement('a')
      link.href = '#/new'
      link.textContent = 'make your first font'

      this.statusEl.append('no fonts yet.', link)
    }

    this.grid.classList.toggle('animate', !this.animated && projects.length > 0)
    this.grid.replaceChildren(...projects.map((project, i) => this.makeCard(project, i, busy)))
    if (projects.length > 0) this.animated = true
  }

  /**
   * Makes the card of one font. Text is set with textContent, never as HTML.
   * @param {Object} project - { id, name, gridSize, glyphCount, updatedAt }
   * @param {number} index
   * @param {boolean} busy
   * @returns {HTMLElement}
   */
  makeCard(project, index, busy) {
    const card = document.createElement('article')
    card.className = 'card'
    card.style.setProperty('--c', COLORS[index % COLORS.length])
    card.style.setProperty('--i', String(Math.min(index, 11)))

    const paper = document.createElement('a')
    paper.className = 'paper'
    paper.href = `#/p/${project.id}`
    paper.setAttribute('aria-label', `open ${project.name}`)

    const thumb = document.createElement('div')
    thumb.className = 'thumb'
    thumb.setAttribute('aria-hidden', 'true')
    thumb.append(document.createElement('canvas'))
    this.thumbData.set(thumb, project)
    this.observer.observe(thumb)

    const name = document.createElement('div')
    name.className = 'name'
    name.textContent = project.name

    const count = project.glyphCount
    const specs = document.createElement('div')
    specs.className = 'specs'
    specs.textContent = `${project.gridSize}×${project.gridSize} · ${count} ${count === 1 ? 'glyph' : 'glyphs'} · ${formatDate(project.updatedAt)}`

    paper.append(thumb, name, specs)

    const actions = document.createElement('div')
    actions.className = 'actions'
    actions.append(
      this.makeButton(
        'rename',
        () => {
          const next = window.prompt('new name', project.name)
          const trimmed = next ? next.trim().slice(0, MAX_NAME_LENGTH) : ''

          if (trimmed && trimmed !== project.name) {
            this.emit('project-rename', { id: project.id, name: trimmed })
          }
        },
        busy
      ),
      this.makeButton(
        'delete',
        () => {
          if (
            window.confirm(`delete "${project.name}" and all its glyphs? this cannot be undone.`)
          ) {
            this.emit('project-delete', { id: project.id })
          }
        },
        busy
      )
    )

    card.append(paper, actions)
    return card
  }

  /**
   * Draws the thumbnail of a card, at the width the card has now.
   * @param {HTMLElement} thumb
   */
  drawThumbnailOf(thumb) {
    const project = this.thumbData.get(thumb)
    const width = thumb.clientWidth
    if (!project || width === 0) return

    drawThumbnail(thumb.firstElementChild, project, { width, color: palette().fg })
  }

  /**
   * Makes a button.
   * @param {string} label
   * @param {Function} onClick
   * @param {boolean} disabled
   * @returns {HTMLButtonElement}
   */
  makeButton(label, onClick, disabled) {
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

customElements.define('glyph-profile', GlyphProfile)
