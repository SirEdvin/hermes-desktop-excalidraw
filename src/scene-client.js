export async function callScene(webview, scope, action, data = {}, active = () => true) {
  if (!active()) throw new Error('Drawing scope changed or the pane closed.')
  if (typeof webview?.executeJavaScript !== 'function') throw new Error('The drawing editor is not ready. Open the pane and try again.')
  const request = { ...data, version: 1, scope: encodeURIComponent(scope), id: crypto.randomUUID(), action }
  // JSON is a data literal, never raw code. No paths or source come from the guest.
  const script = `window.hermesDrawingHandoff ? window.hermesDrawingHandoff(${JSON.stringify(request)}) : null`
  let timer
  try {
    const reply = await Promise.race([
      webview.executeJavaScript(script),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Drawing editor timed out.')), 15000) })
    ])
    if (!active()) throw new Error('Drawing scope changed or the pane closed.')
    if (!reply || reply.version !== 1 || reply.id !== request.id || reply.scope !== request.scope) throw new Error('The drawing editor is not ready or returned a stale response.')
    if (!reply.ok) throw new Error(reply.error || 'Drawing operation failed.')
    return reply.result
  } finally { clearTimeout(timer) }
}
