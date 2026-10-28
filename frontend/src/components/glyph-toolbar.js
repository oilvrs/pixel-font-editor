/**
 * Bar above the drawing area: tools, undo and redo, brush size, zoom, the
 * shapes menu and actions for the selection.
 * Stateless: everything shown is set through attributes, and user actions
 * are sent as events.
 *
 * Attributes: tool, shape, guides, brush, zoom, selection ('none', 'selected'
 * or 'floating'), can-undo, can-redo ('yes' or 'no')
 *
 * Events:
 * - tool-change { tool: 'pen' | 'eraser' | 'select' | 'shapes' | 'pan' }
 * - shape-change { shape: 'rect' | 'ellipse' | 'quarter' | 'concave' | 'triangle' }
 * - brush-step { delta: 1 | -1 }
 * - guides-toggle
 * - zoom-step { delta: 1 | -1 }
 * - zoom-fit
 * - clear
 * - undo
 * - redo
 * - selection-action { action: 'rotate' | 'copy' | 'paste' | 'delete' | 'place' | 'cancel' }
 *
 * @version 0.8.0
 */

const SHAPES = [
  ['rect', 'rectangle (shift: square)', '<rect x="2" y="2" width="12" height="12"/>'],
  ['ellipse', 'ellipse (shift: circle)', '<ellipse cx="8" cy="8" rx="6.5" ry="4.5"/>'],
  ['quarter', 'quarter circle', '<path d="M2 2 H14 A12 12 0 0 1 2 14 Z"/>'],
  ['concave', 'concave corner', '<path d="M2 2 H14 A12 12 0 0 0 2 14 Z"/>'],
  ['triangle', 'triangle', '<path d="M2 2 H14 L2 14 Z"/>'],
]

class GlyphToolbar extends HTMLElement {
  static get observedAttributes() {
    return ['tool', 'shape', 'guides', 'brush', 'zoom', 'selection', 'can-undo', 'can-redo']
  }

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  /**
   * Called whenever the element is added to the DOM.
   */
  connectedCallback() {
    this.render()
    this.setUpEventListeners()
    this.updateActive()
  }

  /**
   * Called whenever an observed attribute changes.
   */
  attributeChangedCallback() {
    this.updateActive()
  }

  /**
   * Renders the HTML template and styles into the shadow DOM.
   */
  render() {
    const shapeButtons = SHAPES.map(
      ([type, title, drawing]) =>
        `<button class="shape" data-shape="${type}" title="${title}"><svg viewBox="0 0 16 16" width="18" height="18">${drawing}</svg></button>`
    ).join('')

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--font);
        }

        .frame {
          border-top: 1px solid var(--fg);
          border-bottom: 1px solid var(--fg);
          margin-bottom: 1.5rem;
        }

        .bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.75rem 2rem;
          padding: 0.9rem 0;
        }

        .row {
          display: contents;
        }

        .group {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .selection,
        .shapes {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 0;
          border-top: 1px solid var(--fg);
        }

        .hidden,
        [hidden] {
          display: none !important;
        }

        .compact-only {
          display: none;
        }

        .label {
          font-size: 0.9rem;
          color: var(--fg);
        }

        .value {
          font-size: 0.85rem;
          color: var(--fg);
          min-width: 3rem;
          text-align: center;
        }

        button {
          background: transparent;
          color: var(--fg);
          border: 1px solid var(--fg);
          font-weight: 400;
          padding: 0.5rem 1rem;
          cursor: pointer;
          font-size: 0.85rem;
          font-family: inherit;
          transition: background 0.2s, color 0.2s, opacity 0.2s;
        }

        button:disabled {
          opacity: 0.35;
          cursor: default;
        }

        button:active:not(:disabled) {
          background: var(--fg);
          color: var(--bg);
        }

        @media (hover: hover) {
          button:hover:not(:disabled):not(.active) {
            background: var(--fg);
            color: var(--bg);
          }
        }

        button.active {
          background: var(--green);
          color: var(--on-accent);
          border-color: var(--green);
        }

        button.shape {
          padding: 0.45rem 0.7rem;
          line-height: 0;
        }

        button.shape svg {
          fill: currentColor;
        }

        /* Mobile layout: the bar is a few full-width rows of large buttons */
        @media (max-width: 1100px) {
          .frame {
            border: 0;
            margin-bottom: 0;
          }

          .bar {
            flex-direction: column;
            flex-wrap: nowrap;
            align-items: stretch;
            gap: 0.5rem;
            padding: 0;
          }

          .row {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
          }

          .row > .group {
            flex: 1 1 11rem;
          }

          .group {
            gap: 0.4rem;
          }

          .group button,
          .selection button,
          .shapes button {
            flex: 1 1 0;
            min-width: 0;
            min-height: 44px;
            padding: 0.5rem 0.3rem;
          }

          .label {
            display: none;
          }

          .compact-only {
            display: inline-block;
          }

          .value {
            flex: 0 0 auto;
            min-width: 2.6rem;
          }

          .selection,
          .shapes {
            gap: 0.4rem;
            padding: 0.5rem 0 0;
            border-top: 0;
          }

          button.shape {
            padding: 0.45rem 0.3rem;
          }
        }
      </style>

      <div class="frame">
        <div class="bar">
          <div class="group">
            <span class="label">tool:</span>
            <button data-tool="pen" title="pen (B)">pen</button>
            <button data-tool="eraser" title="eraser (E)">eraser</button>
            <button data-tool="select" title="select (M)">select</button>
            <button data-tool="shapes" title="shapes (S)">shapes</button>
            <button data-tool="pan" class="compact-only" title="move the view (H)">pan</button>
          </div>
          <div class="group">
            <button id="undoBtn" title="undo (⌘Z)">undo</button>
            <button id="redoBtn" title="redo (⌘⇧Z)">redo</button>
            <button id="clearBtn">clear</button>
            <button id="guidesBtn">guides</button>
          </div>
          <div class="row">
            <div class="group">
              <span class="label">brush:</span>
              <button id="brushDownBtn" title="smaller ( [ or - )">−</button>
              <span class="value" id="brushValue">1 px</span>
              <button id="brushUpBtn" title="larger ( ] or + )">+</button>
            </div>
            <div class="group">
              <span class="label">zoom:</span>
              <button id="zoomOutBtn" title="smaller canvas (⌘ or ctrl + scroll)">−</button>
              <span class="value" id="zoomValue">100%</span>
              <button id="zoomInBtn" title="larger canvas">+</button>
              <button id="zoomFitBtn" title="fit the canvas to the window (F)">fit</button>
            </div>
          </div>
        </div>
        <div class="selection hidden" id="selectionRow">
          <button data-action="rotate" title="rotate 90° (R)">rotate</button>
          <button data-action="copy" title="copy (⌘C)">copy</button>
          <button data-action="paste" title="paste (⌘V)">paste</button>
          <button data-action="delete" title="delete (backspace)">delete</button>
          <button data-action="place" id="placeBtn" title="place (enter)">place</button>
          <button data-action="cancel" id="cancelBtn" title="cancel (esc)">deselect</button>
        </div>
        <div class="shapes hidden" id="shapeRow">${shapeButtons}</div>
      </div>
    `
  }

  /**
   * Sets up event listeners for all buttons.
   */
  setUpEventListeners() {
    const byId = (id) => this.shadowRoot.getElementById(id)

    this.shadowRoot.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => this.emit('tool-change', { tool: btn.dataset.tool }))
    })

    this.shadowRoot.querySelectorAll('[data-shape]').forEach((btn) => {
      btn.addEventListener('click', () => this.emit('shape-change', { shape: btn.dataset.shape }))
    })

    this.shadowRoot.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () =>
        this.emit('selection-action', { action: btn.dataset.action })
      )
    })

    byId('undoBtn').addEventListener('click', () => this.emit('undo'))
    byId('redoBtn').addEventListener('click', () => this.emit('redo'))
    byId('brushDownBtn').addEventListener('click', () => this.emit('brush-step', { delta: -1 }))
    byId('brushUpBtn').addEventListener('click', () => this.emit('brush-step', { delta: 1 }))
    byId('clearBtn').addEventListener('click', () => this.emit('clear'))
    byId('guidesBtn').addEventListener('click', () => this.emit('guides-toggle'))
    byId('zoomOutBtn').addEventListener('click', () => this.emit('zoom-step', { delta: -1 }))
    byId('zoomInBtn').addEventListener('click', () => this.emit('zoom-step', { delta: 1 }))
    byId('zoomFitBtn').addEventListener('click', () => this.emit('zoom-fit'))
  }

  /**
   * Dispatches a custom event from the toolbar element.
   * @param {string} name
   * @param {Object} detail
   */
  emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { detail }))
  }

  /**
   * Marks the buttons that match the current attributes, shows the shapes
   * menu while the shapes tool is active, the actions while something is
   * selected, and the brush size.
   */
  updateActive() {
    const byId = (id) => this.shadowRoot.getElementById(id)
    if (!byId('guidesBtn')) return // Not rendered yet

    const tool = this.getAttribute('tool')
    const shape = this.getAttribute('shape')
    const selection = this.getAttribute('selection') || 'none'

    this.shadowRoot.querySelectorAll('[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === tool)
    })

    this.shadowRoot.querySelectorAll('[data-shape]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.shape === shape)
    })

    byId('shapeRow').classList.toggle('hidden', tool !== 'shapes')
    byId('selectionRow').classList.toggle('hidden', selection === 'none')
    byId('placeBtn').hidden = selection !== 'floating'
    byId('cancelBtn').textContent = selection === 'floating' ? 'cancel' : 'deselect'
    byId('undoBtn').disabled = this.getAttribute('can-undo') !== 'yes'
    byId('redoBtn').disabled = this.getAttribute('can-redo') !== 'yes'
    byId('guidesBtn').classList.toggle('active', this.getAttribute('guides') === 'on')
    byId('zoomValue').textContent = this.getAttribute('zoom') || '100%'
    byId('brushValue').textContent = `${this.getAttribute('brush') || 1} px`
  }
}

customElements.define('glyph-toolbar', GlyphToolbar)
