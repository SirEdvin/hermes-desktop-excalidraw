// Match the native readFileText preview cap; measure UTF-8, not JS characters.
export const MAX_SCENE_BYTES = 512 * 1024
const types = new Set(['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line', 'freedraw', 'image', 'frame', 'magicframe'])
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000
const point = value => Array.isArray(value) && value.length === 2 && value.every(finite)
const arrowheads = ['arrow', 'bar', 'dot', 'circle', 'circle_outline', 'triangle', 'triangle_outline', 'diamond', 'diamond_outline', 'crowfoot_one', 'crowfoot_many', 'crowfoot_one_or_many']

export function checkSize(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_SCENE_BYTES) {
    throw new Error('Drawing exceeds the 512 KiB handoff limit. Use the editor menu for manual file export instead.')
  }
}

function checkTree(value, depth = 0) {
  if (depth > 32) throw new Error('Drawing data is nested too deeply.')
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Drawing contains an invalid number.')
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Drawing contains an unsafe property.')
      checkTree(child, depth + 1)
    }
  }
}

export function parseScene(raw) {
  checkSize(raw)
  let scene
  try { scene = JSON.parse(raw) } catch { throw new Error('Result is not complete JSON. Wait for the agent to finish, then read it again.') }
  if (!record(scene) || scene.type !== 'excalidraw' || !Array.isArray(scene.elements)) throw new Error('Expected an Excalidraw drawing with an elements array.')
  checkTree(scene)
  if (scene.elements.length > 2000) throw new Error('Handoffs support at most 2,000 elements.')
  if (scene.appState !== undefined && !record(scene.appState)) throw new Error('Invalid drawing appState.')
  if (scene.files !== undefined && !record(scene.files)) throw new Error('Invalid drawing files.')
  const files = scene.files || {}
  for (const [id, file] of Object.entries(files)) {
    if (!record(file) || file.id !== id || !/^image\/(png|jpeg|gif|webp)$/.test(file.mimeType) ||
        typeof file.dataURL !== 'string' || !file.dataURL.startsWith(`data:${file.mimeType};base64,`) ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(file.dataURL.split(',')[1])) {
      throw new Error('Handoffs accept embedded PNG, JPEG, GIF or WebP images only; remote images and SVG are not supported.')
    }
  }
  const ids = new Set()
  for (const element of scene.elements) {
    if (!record(element) || !types.has(element.type) || typeof element.id !== 'string' || !element.id || ['__proto__', 'constructor', 'prototype'].includes(element.id) || ids.has(element.id)) {
      throw new Error('Invalid or duplicate element. Remote embeds are not supported in handoffs.')
    }
    ids.add(element.id)
    for (const key of ['index', 'frameId', 'containerId', 'name', 'originalText']) {
      if (element[key] != null && typeof element[key] !== 'string') throw new Error(`Invalid element ${key}.`)
    }
    for (const key of ['isDeleted', 'locked', 'elbowed', 'simulatePressure', 'autoResize']) {
      if (element[key] !== undefined && typeof element[key] !== 'boolean') throw new Error(`Invalid element ${key}.`)
    }
    const enums = { fillStyle: ['hachure', 'cross-hatch', 'solid', 'zigzag'], strokeStyle: ['solid', 'dashed', 'dotted'], textAlign: ['left', 'center', 'right'], verticalAlign: ['top', 'middle', 'bottom'] }
    for (const [key, values] of Object.entries(enums)) {
      if (element[key] !== undefined && !values.includes(element[key])) throw new Error(`Invalid element ${key}.`)
    }
    for (const key of ['seed', 'version', 'versionNonce', 'updated']) {
      if (element[key] !== undefined && (typeof element[key] !== 'number' || !Number.isFinite(element[key]))) throw new Error(`Invalid element ${key}.`)
    }
    if (element.fontFamily !== undefined && ![1, 2, 3, 5, 6, 7, 8, 9].includes(element.fontFamily)) throw new Error('Invalid font family.')
    if (element.roundness != null && (!record(element.roundness) || ![1, 2, 3].includes(element.roundness.type) || (element.roundness.value !== undefined && !finite(element.roundness.value)))) throw new Error('Invalid roundness.')
    if (element.pressures !== undefined && (!Array.isArray(element.pressures) || !element.pressures.every(value => finite(value) && value >= 0 && value <= 1))) throw new Error('Invalid pen pressure.')
    if (element.lastCommittedPoint != null && !point(element.lastCommittedPoint)) throw new Error('Invalid line point.')
    if (element.fixedSegments != null && (!Array.isArray(element.fixedSegments) || !element.fixedSegments.every(segment => record(segment) && point(segment.start) && point(segment.end) && Number.isInteger(segment.index)))) throw new Error('Invalid fixed arrow segments.')
    for (const key of ['startArrowhead', 'endArrowhead']) {
      if (element[key] != null && !arrowheads.includes(element[key])) throw new Error('Invalid arrowhead.')
    }
    if (element.crop != null && (!record(element.crop) || !['x', 'y', 'width', 'height', 'naturalWidth', 'naturalHeight'].every(key => finite(element.crop[key]) && element.crop[key] >= 0) || !element.crop.naturalWidth || !element.crop.naturalHeight)) throw new Error('Invalid image crop.')
    if (!['x', 'y', 'width', 'height'].every(key => finite(element[key])) || element.width < 0 || element.height < 0) throw new Error('Invalid element coordinates or dimensions.')
    for (const key of ['angle', 'strokeWidth', 'roughness', 'opacity', 'fontSize', 'lineHeight']) {
      if (element[key] !== undefined && !finite(element[key])) throw new Error(`Invalid element ${key}.`)
    }
    if (element.strokeWidth < 0 || element.roughness < 0 || element.opacity < 0 || element.opacity > 100 || element.lineHeight <= 0) throw new Error('Invalid drawing style range.')
    if (element.link != null && (typeof element.link !== 'string' || !/^(https?:\/\/|mailto:)/i.test(element.link))) throw new Error('Unsafe element link.')
    for (const key of ['strokeColor', 'backgroundColor']) {
      if (element[key] !== undefined && (typeof element[key] !== 'string' || !/^(#[\da-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d\s.,%+-]+\))$/i.test(element[key]))) throw new Error('Invalid element color.')
    }
    if (element.type === 'text' && (typeof element.text !== 'string' || (element.fontSize !== undefined && element.fontSize <= 0))) throw new Error('Invalid text element.')
    if (['arrow', 'line', 'freedraw'].includes(element.type) && (!Array.isArray(element.points) || !element.points.length || !element.points.every(point => Array.isArray(point) && point.length === 2 && point.every(finite)))) throw new Error('Invalid line points.')
    if (element.type === 'image' && (!files[element.fileId] || (element.scale !== undefined && (!Array.isArray(element.scale) || element.scale.length !== 2 || !element.scale.every(finite))))) throw new Error('Image element is missing valid embedded data.')
    if (element.groupIds !== undefined && (!Array.isArray(element.groupIds) || !element.groupIds.every(id => typeof id === 'string'))) throw new Error('Invalid groups.')
    if (element.boundElements != null && (!Array.isArray(element.boundElements) || !element.boundElements.every(binding => record(binding) && typeof binding.id === 'string' && ['text', 'arrow'].includes(binding.type)))) throw new Error('Invalid element bindings.')
    for (const key of ['startBinding', 'endBinding']) {
      const binding = element[key]
      if (binding != null && (!record(binding) || typeof binding.elementId !== 'string' || !finite(binding.focus) || !finite(binding.gap))) throw new Error('Invalid arrow binding.')
      if (binding?.fixedPoint != null && !point(binding.fixedPoint)) throw new Error('Invalid fixed arrow binding.')
    }
  }
  const background = scene.appState?.viewBackgroundColor
  if (background !== undefined && (typeof background !== 'string' || !/^(#[\da-f]{3,8}|[a-z]+)$/i.test(background))) throw new Error('Invalid canvas background.')
  // Do not import editor state such as collaborators, dialogs or remote handles.
  return { type: 'excalidraw', version: 2, elements: scene.elements, files, appState: background ? { viewBackgroundColor: background } : {} }
}

export async function fingerprint(raw) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
