import { host, PALETTE_AREA } from '@hermes/plugin-sdk'
import { ExcalidrawPane } from './pane.jsx'

const ID = 'hermes-desktop-excalidraw'

export default {
  id: ID,
  name: 'Hermes Desktop Excalidraw',
  register(ctx) {
    let close = null
    let disposing = false
    const open = () => {
      if (typeof host.openWorkspace !== 'function') {
        host.notify({ kind: 'error', message: 'Update Hermes Desktop to use Excalidraw (openWorkspace SDK required).' })
        return
      }
      close = host.openWorkspace(ID, {
        title: 'Excalidraw',
        dock: { pane: 'workspace', pos: 'right' },
        minWidth: '320px',
        render: () => <ExcalidrawPane />,
        onClose: () => {
          close = null
          if (!disposing) ctx.storage.set('pane-open', false)
        }
      })
      ctx.storage.set('pane-open', true)
    }
    ctx.register({
      id: 'toggle',
      area: PALETTE_AREA,
      data: {
        id: `${ID}.toggle`,
        label: 'Excalidraw: toggle drawing pane',
        keywords: ['drawing', 'diagram', 'canvas'],
        run: () => close ? close() : open()
      }
    })
    ctx.onDispose(() => {
      disposing = true
      close?.()
    })
    if (ctx.storage.get('pane-open')) open()
  }
}
