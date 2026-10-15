/**
 * The app: shows the login page, the project list or the editor depending on
 * the hash of the URL and on whether the user is logged in. It owns the state
 * and does all requests. The views only show data and send events.
 *
 * It has no shadow DOM, so that the editor is drawn exactly as before.
 *
 * @version 0.1.0
 */

import { parseRoute, resolveRoute, routeToHash } from '../core/route.js'
import * as api from '../utils/api.js'
import { clearSession, getSession, saveSession } from '../utils/session.js'

class GlyphApp extends HTMLElement {
  /**
   * Sets up the state and the listeners that are added when the app is connected.
   */
  constructor() {
    super()
    this.view = null
    this.projects = []
    this.loading = false
    this.busy = false
    this.error = ''
    this.notice = ''
    this.returnTo = null

    this.onHashChange = () => this.navigate()
    this.onSessionExpired = () => {
      this.notice = 'your session has expired. log in again.'
      this.navigate()
    }
  }

  /**
   * Starts listening and shows the first view.
   */
  connectedCallback() {
    window.addEventListener('hashchange', this.onHashChange)
    window.addEventListener('session-expired', this.onSessionExpired)
    this.navigate()
  }

  /**
   * Stops listening.
   */
  disconnectedCallback() {
    window.removeEventListener('hashchange', this.onHashChange)
    window.removeEventListener('session-expired', this.onSessionExpired)
  }

  /**
   * Shows the view for the current hash. If the hash is not allowed, or not in
   * its normal form, it is replaced, and this runs again from the hashchange.
   */
  navigate() {
    const loggedIn = getSession() !== null
    const requested = parseRoute(window.location.hash)

    // A link to a project is remembered, so that it opens after logging in.
    if (!loggedIn && requested.name === 'editor') this.returnTo = routeToHash(requested)

    const route = resolveRoute(window.location.hash, loggedIn)
    const hash = routeToHash(route)

    if (window.location.hash !== hash) {
      window.location.replace(hash)
      return
    }

    this.show(route)
  }

  /**
   * Replaces the current view.
   * @param {Object} route - { name, projectId? }
   */
  show(route) {
    this.replaceChildren()
    this.view = null

    if (route.name === 'login') this.showLogin()
    else if (route.name === 'editor') this.showEditor(route.projectId)
    else this.showProjects()
  }

  /**
   * Shows the login page.
   */
  showLogin() {
    const view = document.createElement('glyph-login')

    if (this.notice) view.setAttribute('notice', this.notice)
    view.addEventListener('auth-submit', (event) => this.submitAuth(event.detail))

    this.append(view)
    this.view = view
  }

  /**
   * Shows the project list and loads the projects.
   */
  showProjects() {
    const view = document.createElement('glyph-projects')

    view.source = () => ({
      username: (getSession() || {}).username || '',
      projects: this.projects,
      loading: this.loading,
      busy: this.busy,
      error: this.error,
    })

    view.addEventListener('project-open', (event) => {
      window.location.hash = routeToHash({ name: 'editor', projectId: event.detail.id })
    })
    view.addEventListener('project-create', (event) => this.createProject(event.detail))
    view.addEventListener('project-rename', (event) => this.renameProject(event.detail))
    view.addEventListener('project-delete', (event) => this.deleteProject(event.detail.id))
    view.addEventListener('projects-reload', () => this.loadProjects())
    view.addEventListener('logout', () => this.logout())

    this.append(view)
    this.view = view
    this.loadProjects()
  }

  /**
   * Shows the editor. The editor does not use the project id yet (step 5), so
   * it still shows the local drawing. The link back is temporary and moves
   * into the settings panel in step 5.
   * @param {string} projectId
   */
  showEditor(projectId) {
    const editor = document.createElement('glyph-editor')
    editor.setAttribute('project-id', projectId)

    const back = document.createElement('a')
    back.href = '#/projects'
    back.textContent = '← projects'
    back.style.cssText =
      'position: fixed; left: 8px; bottom: 8px; z-index: 10; font: inherit; font-size: 12px; color: inherit; opacity: 0.7;'

    this.append(editor, back)
    this.view = editor
  }

  /**
   * Logs in or creates an account, and then goes to the project list or to the
   * project that was asked for before the login.
   * @param {Object} detail - { mode, username, password }
   */
  async submitAuth({ mode, username, password }) {
    const view = this.view

    view.removeAttribute('error')
    view.setAttribute('busy', '')

    try {
      if (mode === 'register') await api.register(username, password)

      const token = await api.login(username, password)

      if (!saveSession(token)) {
        throw new Error('The session could not be saved. Is storage blocked in the browser?')
      }

      const target = this.returnTo || '#/projects'
      this.returnTo = null
      this.notice = ''
      window.location.hash = target
    } catch (error) {
      if (this.view === view) {
        view.setAttribute('error', error.message)
        view.removeAttribute('busy')
      }
    }
  }

  /**
   * Logs out and shows the login page.
   */
  logout() {
    clearSession()
    this.projects = []
    this.navigate()
  }

  /**
   * Loads the projects and draws the list.
   */
  async loadProjects() {
    const view = this.view

    this.loading = true
    this.error = ''
    view.refresh()

    try {
      this.projects = await api.getProjects()
    } catch (error) {
      // A 401 is handled by the session-expired event.
      if (error.status !== 401) this.error = error.message
    }

    this.loading = false
    if (this.view === view) view.refresh()
  }

  /**
   * Runs a request from the project list. The list is disabled meanwhile and
   * shows the error if the request fails.
   * @param {Function} action
   */
  async run(action) {
    const view = this.view

    this.busy = true
    this.error = ''
    view.refresh()

    try {
      await action()
    } catch (error) {
      if (error.status !== 401) this.error = error.message
    }

    this.busy = false
    if (this.view === view) view.refresh()
  }

  /**
   * Creates a project and opens it.
   * @param {Object} data - { name, gridSize }
   */
  createProject(data) {
    return this.run(async () => {
      const project = await api.createProject(data)
      window.location.hash = routeToHash({ name: 'editor', projectId: project.id })
    })
  }

  /**
   * Renames a project.
   * @param {Object} detail - { id, name }
   */
  renameProject({ id, name }) {
    return this.run(async () => {
      await api.updateProject(id, { name })
      this.projects = await api.getProjects()
    })
  }

  /**
   * Deletes a project.
   * @param {string} id
   */
  deleteProject(id) {
    return this.run(async () => {
      await api.deleteProject(id)
      this.projects = await api.getProjects()
    })
  }
}

customElements.define('glyph-app', GlyphApp)
