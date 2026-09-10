import { exportToBlob, restore, serializeAsJSON } from '@excalidraw/excalidraw'
import { checkSize, parseScene } from '../../src/scene.js'

// Called only by the host's fixed webview invocation, never by scene content.
export function installHandoff({ api, scope, save, backup, target = window }) {
  let alive = true
  let generation = 0
  let staged = null
  const snapshot = () => {
    const raw = serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), 'local')
    checkSize(raw)
    return raw
  }
  const invoke = async request => {
    const response = { version: 1, id: request?.id, scope }
    try {
      if (!alive || request?.version !== 1 || request.scope !== scope || typeof request.id !== 'string' || request.id.length > 100) throw new Error('Invalid or stale drawing request.')
      if (request.action === 'snapshot') return { ...response, ok: true, result: { raw: snapshot() } }
      if (request.action === 'preview') {
        const turn = ++generation
        staged = null
        const parsed = parseScene(request.raw)
        const scene = restore(parsed, null, null, { repairBindings: true })
        checkSize(serializeAsJSON(scene.elements, scene.appState, scene.files, 'local'))
        const expected = snapshot()
        let image = null
        if (scene.elements.some(element => !element.isDeleted)) {
          const blob = await exportToBlob({ elements: scene.elements.filter(element => !element.isDeleted), appState: { ...scene.appState, exportBackground: true }, files: scene.files, maxWidthOrHeight: 800 })
          image = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => reject(new Error('Could not render the preview.'))
            reader.readAsDataURL(blob)
          })
        }
        if (!alive || turn !== generation) throw new Error('Drawing preview was cancelled.')
        staged = { id: request.id, scene, expected }
        return { ...response, ok: true, result: { image, expected, previewId: request.id, count: scene.elements.filter(element => !element.isDeleted).length } }
      }
      if (request.action === 'apply') {
        if (!staged || staged.id !== request.previewId) throw new Error('Read the result again before applying it.')
        const current = snapshot()
        if (current !== staged.expected) throw new Error('Your drawing changed after preview. Read the result again to review those changes before replacing it.')
        // No awaits between the conflict check, durable backup, save and update.
        // Never mutate the canvas if either storage operation fails.
        backup(current)
        const { scene } = staged
        const raw = serializeAsJSON(scene.elements, scene.appState, scene.files, 'local')
        checkSize(raw)
        save(raw)
        staged = null
        api.addFiles(Object.values(scene.files))
        api.updateScene({ elements: scene.elements, appState: { viewBackgroundColor: scene.appState.viewBackgroundColor, selectedElementIds: {}, selectedGroupIds: {} }, captureUpdate: 'IMMEDIATELY' })
        api.scrollToContent(scene.elements, { fitToContent: true })
        return { ...response, ok: true, result: { applied: true } }
      }
      throw new Error('Unknown drawing request.')
    } catch (error) {
      return { ...response, ok: false, error: String(error.message || error) }
    }
  }
  target.hermesDrawingHandoff = invoke
  return () => {
    alive = false
    generation++
    staged = null
    if (target.hermesDrawingHandoff === invoke) delete target.hermesDrawingHandoff
  }
}
