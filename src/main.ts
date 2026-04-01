// ============================================================
// Pen → Figma Importer — Main Plugin Code
// ============================================================

// ─── State ──────────────────────────────────────────────────

const componentMap = new Map<string, ComponentNode>()
const varValues = new Map<string, any>()
const figmaVars = new Map<string, Variable>()
let collectionModeId = ''
let stats = { frames: 0, texts: 0, rects: 0, components: 0, instances: 0, variables: 0, vectors: 0 }

// ─── UI Helpers ─────────────────────────────────────────────

function sendProgress(percent: number, text: string) {
  figma.ui.postMessage({ type: 'progress', percent, text })
}
function sendLog(text: string, level = '') {
  figma.ui.postMessage({ type: 'log', text, level })
}

// ─── Color Utilities ────────────────────────────────────────

function parseHex(hex: string): { r: number; g: number; b: number; a: number } {
  hex = hex.replace('#', '')
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
  return { r, g, b, a }
}

function isVar(v: any): v is string {
  return typeof v === 'string' && v.startsWith('$')
}

function varName(v: string): string {
  return v.slice(1)
}

function resolve(v: any): any {
  if (!isVar(v)) return v
  const name = varName(v)
  const val = varValues.get(name)
  if (val === undefined) return v
  return isVar(val) ? resolve(val) : val
}

function resolveNum(v: any): number | null {
  if (typeof v === 'number') return v
  const r = resolve(v)
  return typeof r === 'number' ? r : null
}

// ─── Font Mapping ───────────────────────────────────────────

function mapWeight(w?: string): string {
  if (!w) return 'Regular'
  const m: Record<string, string> = {
    thin: 'Thin', '100': 'Thin',
    extralight: 'ExtraLight', '200': 'ExtraLight',
    light: 'Light', '300': 'Light',
    normal: 'Regular', regular: 'Regular', '400': 'Regular',
    medium: 'Medium', '500': 'Medium',
    semibold: 'SemiBold', '600': 'SemiBold',
    bold: 'Bold', '700': 'Bold',
    extrabold: 'ExtraBold', '800': 'ExtraBold',
    black: 'Black', '900': 'Black',
  }
  return m[w.toLowerCase().replace(/[-_ ]/g, '')] || 'Regular'
}

// Collect all font families + weights used, then preload
async function preloadFonts(nodes: any[]) {
  const fonts = new Set<string>()
  function scan(n: any) {
    if (n.fontFamily) fonts.add(`${n.fontFamily}::${mapWeight(n.fontWeight)}`)
    if (n.children) for (const c of n.children) scan(c)
    if (n.descendants) {
      for (const d of Object.values(n.descendants) as any[]) {
        if (d.fontFamily) fonts.add(`${d.fontFamily}::${mapWeight(d.fontWeight)}`)
      }
    }
  }
  for (const n of nodes) scan(n)

  // Always load Inter Regular as fallback
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })

  for (const key of fonts) {
    const [family, style] = key.split('::')
    try {
      await figma.loadFontAsync({ family, style })
    } catch (_e) {
      try { await figma.loadFontAsync({ family, style: 'Regular' }) } catch (_e) { /* fallback to Inter */ }
    }
  }
  sendLog(`Preloaded ${fonts.size} font variants`, 'ok')
}

// ─── Sizing Helpers ─────────────────────────────────────────

type SizeMode = 'FIXED' | 'HUG' | 'FILL'

function parseSizing(v: any): { mode: SizeMode; fallback?: number } {
  if (typeof v === 'number') return { mode: 'FIXED', fallback: v }
  if (typeof v === 'string') {
    if (v.startsWith('fill_container')) return { mode: 'FILL' }
    if (v.startsWith('fit_content')) {
      const m = v.match(/fit_content\((\d+)\)/)
      return { mode: 'HUG', fallback: m ? +m[1] : undefined }
    }
    // Variable reference for size
    const r = resolve(v)
    if (typeof r === 'number') return { mode: 'FIXED', fallback: r }
  }
  return { mode: 'FIXED' }
}

// ─── Variable Collection ────────────────────────────────────

async function createVariables(vars: Record<string, any>) {
  if (!vars || Object.keys(vars).length === 0) return

  const collection = figma.variables.createVariableCollection('Pen Design Tokens')
  collectionModeId = collection.modes[0].modeId
  collection.renameMode(collectionModeId, 'Default')

  for (const [name, def] of Object.entries(vars)) {
    varValues.set(name, def.value)

    const typeMap: Record<string, VariableResolvedDataType> = {
      color: 'COLOR', number: 'FLOAT', string: 'STRING', boolean: 'BOOLEAN',
    }
    const resolvedType = typeMap[def.type]
    if (!resolvedType) continue

    try {
      const v = figma.variables.createVariable(name, collection, resolvedType)
      figmaVars.set(name, v)

      const raw = def.value
      if (def.type === 'color' && typeof raw === 'string' && !isVar(raw)) {
        const { r, g, b, a } = parseHex(raw)
        v.setValueForMode(collectionModeId, { r, g, b, a })
      } else if (def.type === 'number' && typeof raw === 'number') {
        v.setValueForMode(collectionModeId, raw)
      } else if (def.type === 'string' && typeof raw === 'string' && !isVar(raw)) {
        v.setValueForMode(collectionModeId, raw)
      } else if (def.type === 'boolean' && typeof raw === 'boolean') {
        v.setValueForMode(collectionModeId, raw)
      }
      stats.variables++
    } catch (e: any) {
      sendLog(`Variable "${name}": ${e.message}`, 'warn')
    }
  }

  // Second pass: resolve variable-to-variable aliases
  for (const [name, def] of Object.entries(vars)) {
    if (isVar(def.value)) {
      const target = figmaVars.get(varName(def.value))
      const source = figmaVars.get(name)
      if (target && source) {
        try {
          source.setValueForMode(collectionModeId, { type: 'VARIABLE_ALIAS', id: target.id })
        } catch (_e) {
          // Fallback: set concrete value
          const concrete = resolve(def.value)
          if (def.type === 'color' && typeof concrete === 'string') {
            const { r, g, b, a } = parseHex(concrete)
            source.setValueForMode(collectionModeId, { r, g, b, a })
          }
        }
      }
    }
  }

  sendLog(`Created ${stats.variables} variables`, 'ok')
}

// ─── Paint / Fill Building ──────────────────────────────────

function buildSolidPaint(color: string, opacity?: number): SolidPaint {
  const { r, g, b, a } = parseHex(color)
  return { type: 'SOLID', color: { r, g, b }, opacity: opacity !== undefined ? opacity : a }
}

function buildGradientPaint(f: any): GradientPaint | null {
  const colors = f.colors || []
  if (colors.length === 0) return null

  const stops: ColorStop[] = colors.map((s: any) => {
    const c = typeof s.color === 'string' ? (isVar(s.color) ? resolve(s.color) : s.color) : '#000000'
    const { r, g, b, a } = parseHex(typeof c === 'string' ? c : '#000000')
    return { position: typeof s.position === 'number' ? s.position : 0, color: { r, g, b, a } }
  })

  const typeMap: Record<string, any> = {
    linear: 'GRADIENT_LINEAR', radial: 'GRADIENT_RADIAL', angular: 'GRADIENT_ANGULAR',
  }
  const gradType = typeMap[f.gradientType || 'linear'] || 'GRADIENT_LINEAR'

  // Compute transform from rotation
  const rot = (typeof f.rotation === 'number' ? f.rotation : 180) * Math.PI / 180
  const cos = Math.cos(rot), sin = Math.sin(rot)
  const gradientTransform: Transform = [
    [cos, sin, 0.5 - (cos + sin) * 0.5],
    [-sin, cos, 0.5 - (-sin + cos) * 0.5],
  ]

  return {
    type: gradType,
    gradientStops: stops,
    gradientTransform,
    visible: f.enabled !== false,
  } as GradientPaint
}

function buildPaint(fill: any): Paint | null {
  if (typeof fill === 'string') {
    const c = isVar(fill) ? resolve(fill) : fill
    if (typeof c === 'string') return buildSolidPaint(c)
    return null
  }
  if (typeof fill !== 'object' || fill === null) return null

  if (fill.type === 'gradient') return buildGradientPaint(fill)
  if (fill.type === 'image') {
    // Image fills need actual image bytes — create a placeholder
    return { type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.5 }, opacity: 0.15 } as SolidPaint
  }
  if (fill.type === 'mesh_gradient') {
    // Mesh gradients have no Figma equivalent — approximate with first color
    const firstColor = fill.colors && fill.colors[0]
    if (firstColor) {
      const c = isVar(firstColor) ? resolve(firstColor) : firstColor
      if (typeof c === 'string') return buildSolidPaint(c, 0.5)
    }
    return null
  }
  // type: "color" or bare color object
  const colorVal = fill.color || fill
  if (typeof colorVal === 'string') {
    const c = isVar(colorVal) ? resolve(colorVal) : colorVal
    if (typeof c === 'string') {
      const paint = buildSolidPaint(c, fill.opacity)
      return { ...paint, visible: fill.enabled !== false } as SolidPaint
    }
  }
  return null
}

function buildPaints(fills: any): Paint[] {
  if (fills === undefined || fills === null) return []
  const arr = Array.isArray(fills) ? fills : [fills]
  const paints: Paint[] = []
  for (const f of arr) {
    const p = buildPaint(f)
    if (p) paints.push(p)
  }
  return paints
}

function applyFills(node: MinimalFillsMixin, fills: any, bindVar = true) {
  // Try variable binding first
  if (bindVar && isVar(fills)) {
    const fv = figmaVars.get(varName(fills))
    if (fv) {
      try {
        const solid: SolidPaint = { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }
        const bound = figma.variables.setBoundVariableForPaint(solid, 'color', fv)
        node.fills = [bound]
        return
      } catch (_e) { /* fall through */ }
    }
  }
  const paints = buildPaints(fills)
  if (paints.length > 0) node.fills = paints
}

// ─── Strokes ────────────────────────────────────────────────

function applyStroke(node: any, stroke: any) {
  if (!stroke) return

  if (stroke.fill) {
    const paints = buildPaints(stroke.fill)
    if (paints.length > 0) node.strokes = paints
  }

  if (stroke.thickness !== undefined) {
    if (typeof stroke.thickness === 'number') {
      node.strokeWeight = stroke.thickness
    } else if (typeof stroke.thickness === 'object') {
      node.strokeTopWeight = stroke.thickness.top || 0
      node.strokeRightWeight = stroke.thickness.right || 0
      node.strokeBottomWeight = stroke.thickness.bottom || 0
      node.strokeLeftWeight = stroke.thickness.left || 0
    } else {
      const n = resolveNum(stroke.thickness)
      if (n !== null) node.strokeWeight = n
    }
  }

  const alignMap: Record<string, string> = { inside: 'INSIDE', center: 'CENTER', outside: 'OUTSIDE' }
  if (stroke.align && alignMap[stroke.align]) node.strokeAlign = alignMap[stroke.align]

  if (stroke.dashPattern) node.dashPattern = stroke.dashPattern

  const joinMap: Record<string, string> = { miter: 'MITER', bevel: 'BEVEL', round: 'ROUND' }
  if (stroke.join && joinMap[stroke.join]) node.strokeJoin = joinMap[stroke.join]

  const capMap: Record<string, string> = { none: 'NONE', round: 'ROUND', square: 'SQUARE' }
  if (stroke.cap && capMap[stroke.cap]) node.strokeCap = capMap[stroke.cap]
}

// ─── Effects ────────────────────────────────────────────────

function applyEffects(node: BlendMixin, effects: any) {
  if (!effects) return
  const arr = Array.isArray(effects) ? effects : [effects]
  const out: Effect[] = []

  for (const e of arr) {
    if (e.type === 'blur') {
      out.push({ type: 'LAYER_BLUR', radius: resolveNum(e.radius) ?? 10, visible: e.enabled !== false })
    } else if (e.type === 'background_blur') {
      out.push({ type: 'BACKGROUND_BLUR', radius: resolveNum(e.radius) ?? 10, visible: e.enabled !== false })
    } else if (e.type === 'shadow') {
      const cStr = e.color ? (isVar(e.color) ? resolve(e.color) : e.color) : '#00000040'
      const { r, g, b, a } = parseHex(typeof cStr === 'string' ? cStr : '#00000040')
      const shadowType = (e.shadowType === 'inner' ? 'INNER_SHADOW' : 'DROP_SHADOW') as 'DROP_SHADOW' | 'INNER_SHADOW'
      const ox = e.offset ? (resolveNum(e.offset.x) || 0) : 0
      const oy = e.offset ? (resolveNum(e.offset.y) || 0) : 0
      out.push({
        type: shadowType,
        color: { r, g, b, a },
        offset: { x: ox, y: oy },
        radius: resolveNum(e.blur) || 4,
        spread: resolveNum(e.spread) || 0,
        visible: e.enabled !== false,
        blendMode: 'NORMAL',
      } as DropShadowEffect)
    }
  }

  if (out.length) {
    try {
      node.effects = out
    } catch (_eEff) {
      sendLog('Effects error: ' + (_eEff as any).message, 'warn')
    }
  }
}

// ─── Auto-Layout ────────────────────────────────────────────

function hasLayout(pen: any): boolean {
  // Frames default to horizontal, groups to none
  if (pen.type === 'frame' || pen.type === 'group') {
    if (pen.layout === 'none') return false
    if (pen.type === 'frame') return true  // frames default to horizontal
    if (pen.type === 'group' && (pen.layout === 'horizontal' || pen.layout === 'vertical')) return true
  }
  return false
}

function applyLayout(node: FrameNode | ComponentNode, pen: any) {
  if (!hasLayout(pen)) return

  const dir = pen.layout === 'vertical' ? 'VERTICAL' : 'HORIZONTAL'
  node.layoutMode = dir

  // Gap
  const gap = resolveNum(pen.gap)
  if (gap !== null) node.itemSpacing = gap

  // Padding
  if (pen.padding !== undefined) {
    const p = pen.padding
    if (typeof p === 'number' || isVar(p)) {
      const val = resolveNum(p) ?? 0
      node.paddingTop = val; node.paddingRight = val; node.paddingBottom = val; node.paddingLeft = val
    } else if (Array.isArray(p)) {
      if (p.length === 2) {
        const v = resolveNum(p[0]) ?? 0, h = resolveNum(p[1]) ?? 0
        node.paddingTop = v; node.paddingBottom = v; node.paddingLeft = h; node.paddingRight = h
      } else if (p.length === 4) {
        node.paddingTop = resolveNum(p[0]) ?? 0
        node.paddingRight = resolveNum(p[1]) ?? 0
        node.paddingBottom = resolveNum(p[2]) ?? 0
        node.paddingLeft = resolveNum(p[3]) ?? 0
      }
    }
  }

  // Primary axis alignment
  const justMap: Record<string, 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'> = {
    start: 'MIN', center: 'CENTER', end: 'MAX', space_between: 'SPACE_BETWEEN',
  }
  if (pen.justifyContent && justMap[pen.justifyContent]) {
    node.primaryAxisAlignItems = justMap[pen.justifyContent]
  }

  // Counter axis alignment
  const alignMap: Record<string, 'MIN' | 'CENTER' | 'MAX'> = {
    start: 'MIN', center: 'CENTER', end: 'MAX',
  }
  if (pen.alignItems && alignMap[pen.alignItems]) {
    node.counterAxisAlignItems = alignMap[pen.alignItems]
  }

  // Default sizing for auto-layout frames: HUG both axes
  node.layoutSizingHorizontal = 'HUG'
  node.layoutSizingVertical = 'HUG'
}

// Apply width/height sizing AFTER parent context is known
function applySizing(node: SceneNode, pen: any, parentLayout: boolean) {
  try {
    if (pen.width !== undefined) {
      const s = parseSizing(pen.width)
      if ('layoutSizingHorizontal' in node) {
        const fn = node as FrameNode
        if (s.mode === 'FILL' && parentLayout) fn.layoutSizingHorizontal = 'FILL'
        else if (s.mode === 'HUG') fn.layoutSizingHorizontal = 'HUG'
        else if (s.mode === 'FIXED' && s.fallback && s.fallback > 0) {
          fn.layoutSizingHorizontal = 'FIXED'
          fn.resize(s.fallback, Math.max(fn.height, 1))
        }
      } else if (s.mode === 'FIXED' && s.fallback && s.fallback > 0 && 'resize' in node) {
        (node as any).resize(s.fallback, Math.max((node as any).height || 1, 1))
      }
    }

    if (pen.height !== undefined) {
      const s = parseSizing(pen.height)
      if ('layoutSizingVertical' in node) {
        const fn = node as FrameNode
        if (s.mode === 'FILL' && parentLayout) fn.layoutSizingVertical = 'FILL'
        else if (s.mode === 'HUG') fn.layoutSizingVertical = 'HUG'
        else if (s.mode === 'FIXED' && s.fallback && s.fallback > 0) {
          fn.layoutSizingVertical = 'FIXED'
          fn.resize(Math.max(fn.width, 1), s.fallback)
        }
      } else if (s.mode === 'FIXED' && s.fallback && s.fallback > 0 && 'resize' in node) {
        (node as any).resize(Math.max((node as any).width || 1, 1), s.fallback)
      }
    }

    // For text nodes: sizing from textGrowth
    if (node.type === 'TEXT') {
      const tn = node as TextNode
      if (pen.textGrowth === 'fixed-width' || pen.textGrowth === 'fixed-width-height') {
        tn.textAutoResize = pen.textGrowth === 'fixed-width' ? 'HEIGHT' : 'NONE'
        if (pen.width !== undefined) {
          const ws = parseSizing(pen.width)
          if (ws.mode === 'FILL' && parentLayout) {
            (tn as any).layoutSizingHorizontal = 'FILL'
          } else if (ws.mode === 'FIXED' && ws.fallback) {
            tn.resize(ws.fallback, tn.height)
          }
        }
      } else {
        tn.textAutoResize = 'WIDTH_AND_HEIGHT'
      }
    }
  } catch (_e) {
    sendLog(`Sizing error on ${pen.name || pen.id || pen.type}: ${(_e as any).message}`, 'warn')
  }
}

// ─── Common Properties ──────────────────────────────────────

function applyCommon(node: SceneNode, pen: any) {
  // Name
  node.name = pen.name || pen.id || node.name

  // Plugin data for descendant lookup
  if (pen.id) node.setPluginData('penId', pen.id)

  // Opacity
  if (pen.opacity !== undefined && 'opacity' in node) {
    const o = resolveNum(pen.opacity)
    if (o !== null) (node as any).opacity = o
  }

  // Rotation
  if (pen.rotation !== undefined) {
    const r = resolveNum(pen.rotation)
    if (r !== null) node.rotation = -r // .pen is counter-clockwise, Figma is clockwise
  }

  // Visibility
  if (pen.enabled === false) node.visible = false

  // Corner radius
  if ('cornerRadius' in node && pen.cornerRadius !== undefined) {
    const cr = pen.cornerRadius
    if (typeof cr === 'number') {
      (node as any).cornerRadius = cr
    } else if (Array.isArray(cr) && cr.length === 4) {
      (node as any).topLeftRadius = resolveNum(cr[0]) ?? 0;
      (node as any).topRightRadius = resolveNum(cr[1]) ?? 0;
      (node as any).bottomRightRadius = resolveNum(cr[2]) ?? 0;
      (node as any).bottomLeftRadius = resolveNum(cr[3]) ?? 0
    }
  }

  // Clipping
  if ('clipsContent' in node && pen.clip !== undefined) {
    (node as any).clipsContent = pen.clip === true
  }

  // Layout position (absolute within auto-layout parent)
  // Only safe when parent has auto-layout — wrapped in try/catch
  if (pen.layoutPosition === 'absolute' && 'layoutPositioning' in node) {
    try {
      (node as any).layoutPositioning = 'ABSOLUTE'
    } catch (_e2) { /* parent has no layoutMode */ }
  }
}

// ─── Text Node ──────────────────────────────────────────────

async function createText(pen: any): Promise<TextNode> {
  const node = figma.createText()
  stats.texts++

  const family = pen.fontFamily || 'Inter'
  const style = mapWeight(pen.fontWeight)

  // Try loading the exact font, fall back gracefully
  let loadedFamily = family, loadedStyle = style
  try {
    await figma.loadFontAsync({ family, style })
  } catch (_e) {
    try {
      await figma.loadFontAsync({ family, style: 'Regular' })
      loadedStyle = 'Regular'
    } catch (_e) {
      loadedFamily = 'Inter'; loadedStyle = 'Regular'
    }
  }

  node.fontName = { family: loadedFamily, style: loadedStyle }

  // Content
  if (pen.content && typeof pen.content === 'string') {
    const text = isVar(pen.content) ? String(resolve(pen.content)) : pen.content
    node.characters = text
  }

  // Font size
  if (pen.fontSize) node.fontSize = resolveNum(pen.fontSize) ?? 14

  // Letter spacing
  if (pen.letterSpacing !== undefined) {
    const ls = resolveNum(pen.letterSpacing)
    if (ls !== null) {
      // .pen letterSpacing is a ratio (e.g. 0.03 = 3%). Figma uses { value, unit }.
      // If < 1, treat as percentage of font size; if >= 1, treat as pixels.
      if (Math.abs(ls) < 1) {
        node.letterSpacing = { value: ls * 100, unit: 'PERCENT' }
      } else {
        node.letterSpacing = { value: ls, unit: 'PIXELS' }
      }
    }
  }

  // Line height
  if (pen.lineHeight !== undefined) {
    const lh = resolveNum(pen.lineHeight)
    if (lh !== null) {
      // .pen lineHeight is a multiplier (1.0 = 100%)
      node.lineHeight = { value: lh * 100, unit: 'PERCENT' }
    }
  }

  // Text alignment
  const hAlignMap: Record<string, 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'> = {
    left: 'LEFT', center: 'CENTER', right: 'RIGHT', justify: 'JUSTIFIED',
  }
  if (pen.textAlign && hAlignMap[pen.textAlign]) {
    node.textAlignHorizontal = hAlignMap[pen.textAlign]
  }

  const vAlignMap: Record<string, 'TOP' | 'CENTER' | 'BOTTOM'> = {
    top: 'TOP', middle: 'CENTER', bottom: 'BOTTOM',
  }
  if (pen.textAlignVertical && vAlignMap[pen.textAlignVertical]) {
    node.textAlignVertical = vAlignMap[pen.textAlignVertical]
  }

  // Fill (text color)
  if (pen.fill !== undefined) applyFills(node, pen.fill)

  // Stroke & effects
  applyStroke(node, pen.stroke)
  applyEffects(node, pen.effect)

  return node
}

// ─── Frame / Component Creation ─────────────────────────────

function createFrameBase(pen: any, asComponent: boolean): FrameNode | ComponentNode {
  const node = asComponent ? figma.createComponent() : figma.createFrame()

  // Clear default fills — .pen frames have no fill by default
  node.fills = []

  // Apply auto-layout BEFORE children
  applyLayout(node, pen)

  // Graphics
  if (pen.fill !== undefined) applyFills(node, pen.fill)
  applyStroke(node, pen.stroke)
  applyEffects(node, pen.effect)

  return node
}

// ─── Instance (Ref) Creation ────────────────────────────────

async function createInstance(pen: any): Promise<InstanceNode | null> {
  const refId = pen.ref
  const comp = componentMap.get(refId)
  if (!comp) {
    sendLog(`Missing component ref: ${refId}`, 'warn')
    return null
  }

  const instance = comp.createInstance()
  stats.instances++

  // Apply root-level overrides (properties on the ref node itself, excluding type/ref/id/descendants)
  const skipKeys = new Set(['type', 'ref', 'id', 'name', 'descendants', 'children', 'x', 'y', 'reusable'])
  for (const [key, val] of Object.entries(pen)) {
    if (skipKeys.has(key)) continue
    applyPropertyOverride(instance, key, val)
  }

  // Apply descendant overrides
  if (pen.descendants) {
    for (const [idPath, overrides] of Object.entries(pen.descendants)) {
      const target = findDescendant(instance, idPath)
      if (!target) {
        sendLog(`Descendant not found: ${idPath} in ${refId}`, 'warn')
        continue
      }
      await applyDescendantOverrides(target, overrides as any)
    }
  }

  return instance
}

function findDescendant(root: SceneNode, idPath: string): SceneNode | null {
  const parts = idPath.split('/')
  let current: SceneNode = root

  for (const part of parts) {
    if (!('findOne' in current)) return null
    const found = (current as FrameNode).findOne(n => n.getPluginData('penId') === part)
    if (!found) {
      // Fallback: search by name
      const byName = (current as FrameNode).findOne(n => n.name === part)
      if (!byName) return null
      current = byName
      continue
    }
    current = found
  }

  return current
}

function applyPropertyOverride(node: SceneNode, key: string, val: any) {
  try {
    switch (key) {
      case 'padding':
        if (typeof val === 'number' || isVar(val)) {
          const v = resolveNum(val) ?? 0
          const f = node as FrameNode
          f.paddingTop = v; f.paddingRight = v; f.paddingBottom = v; f.paddingLeft = v
        } else if (Array.isArray(val)) {
          const f = node as FrameNode
          if (val.length === 2) {
            const v = resolveNum(val[0]) ?? 0, h = resolveNum(val[1]) ?? 0
            f.paddingTop = v; f.paddingBottom = v; f.paddingLeft = h; f.paddingRight = h
          } else if (val.length === 4) {
            f.paddingTop = resolveNum(val[0]) ?? 0; f.paddingRight = resolveNum(val[1]) ?? 0
            f.paddingBottom = resolveNum(val[2]) ?? 0; f.paddingLeft = resolveNum(val[3]) ?? 0
          }
        }
        break
      case 'fill':
        if ('fills' in node) applyFills(node as MinimalFillsMixin, val)
        break
      case 'stroke':
        applyStroke(node, val)
        break
      case 'effect':
        applyEffects(node as any, val)
        break
      case 'opacity':
        if ('opacity' in node) (node as any).opacity = resolveNum(val) ?? 1
        break
      case 'cornerRadius':
        if ('cornerRadius' in node) {
          if (typeof val === 'number') (node as any).cornerRadius = val
        }
        break
      case 'width':
      case 'height':
        // Sizing handled separately
        break
      case 'gap':
        if ('itemSpacing' in node) (node as any).itemSpacing = resolveNum(val) ?? 0
        break
      case 'clip':
        if ('clipsContent' in node) (node as any).clipsContent = val === true
        break
      case 'layout':
      case 'justifyContent':
      case 'alignItems':
        // Layout overrides on instances are rare; skip for now
        break
    }
  } catch (e: any) {
    sendLog(`Override ${key}: ${e.message}`, 'warn')
  }
}

async function applyDescendantOverrides(node: SceneNode, overrides: any) {
  if (!overrides || typeof overrides !== 'object') return

  // If override has 'type', it's a full subtree replacement
  if (overrides.type) {
    // For ref overrides, swap the component on the target node
    if (overrides.type === 'ref' && overrides.ref) {
      const comp = componentMap.get(overrides.ref)
      if (comp) {
        try {
          // If the node is already an instance, use swapComponent
          if (node.type === 'INSTANCE') {
            (node as InstanceNode).swapComponent(comp)
            stats.instances++
            if (overrides.name) node.name = overrides.name
            // Apply descendant overrides on the swapped instance
            if (overrides.descendants) {
              for (const [dp, dov] of Object.entries(overrides.descendants)) {
                const dt = findDescendant(node, dp)
                if (dt) await applyDescendantOverrides(dt, dov as any)
              }
            }
          } else {
            // Target is not an instance (e.g. a frame/slot) — try insert if parent allows it
            const parent = node.parent
            if (parent && parent.type !== 'INSTANCE' && 'insertChild' in parent) {
              const inst = comp.createInstance()
              stats.instances++
              inst.name = overrides.name || node.name
              if (overrides.id) inst.setPluginData('penId', overrides.id)
              const idx = Array.prototype.indexOf.call((parent as FrameNode).children, node)
              ;(parent as FrameNode).insertChild(idx, inst)
              node.remove()
              if (overrides.descendants) {
                for (const [dp, dov] of Object.entries(overrides.descendants)) {
                  const dt = findDescendant(inst, dp)
                  if (dt) await applyDescendantOverrides(dt, dov as any)
                }
              }
            } else {
              // Inside an instance — can't insert, just log
              sendLog(`Can't replace non-instance node inside instance (ref: ${overrides.ref})`, 'warn')
            }
          }
        } catch (_e6) {
          sendLog(`Replacement failed for ref ${overrides.ref}: ${(_e6 as any).message}`, 'warn')
        }
      } else {
        sendLog(`Missing component for replacement ref: ${overrides.ref}`, 'warn')
      }
    } else {
      // Other replacement types (frame, text, etc.) — log and skip
      sendLog(`Subtree replacement type "${overrides.type}" not yet supported`, 'warn')
    }
    return
  }

  // Text property overrides
  if (node.type === 'TEXT') {
    const tn = node as TextNode
    // Must load font before any text mutation
    try {
      await figma.loadFontAsync(tn.fontName as FontName)
    } catch (_e) {
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
    }

    if (overrides.content !== undefined) {
      const text = isVar(overrides.content) ? String(resolve(overrides.content)) : String(overrides.content)
      tn.characters = text
    }
    if (overrides.fontSize !== undefined) {
      const fs = resolveNum(overrides.fontSize)
      if (fs !== null) tn.fontSize = fs
    }
    if (overrides.fontWeight !== undefined) {
      const family = (tn.fontName as FontName).family
      const style = mapWeight(overrides.fontWeight)
      try {
        await figma.loadFontAsync({ family, style })
        tn.fontName = { family, style }
      } catch (_e) { /* keep existing */ }
    }
    if (overrides.fill !== undefined) applyFills(tn, overrides.fill)
    if (overrides.letterSpacing !== undefined) {
      const ls = resolveNum(overrides.letterSpacing)
      if (ls !== null) {
        tn.letterSpacing = Math.abs(ls) < 1
          ? { value: ls * 100, unit: 'PERCENT' }
          : { value: ls, unit: 'PIXELS' }
      }
    }
    if (overrides.lineHeight !== undefined) {
      const lh = resolveNum(overrides.lineHeight)
      if (lh !== null) tn.lineHeight = { value: lh * 100, unit: 'PERCENT' }
    }
    return
  }

  // Frame/shape overrides
  if (overrides.fill !== undefined && 'fills' in node) applyFills(node as MinimalFillsMixin, overrides.fill)
  if (overrides.stroke !== undefined) applyStroke(node, overrides.stroke)
  if (overrides.effect !== undefined) applyEffects(node as any, overrides.effect)
  if (overrides.opacity !== undefined && 'opacity' in node) {
    (node as any).opacity = resolveNum(overrides.opacity) ?? 1
  }
  if (overrides.width !== undefined && 'resize' in node) {
    const s = parseSizing(overrides.width)
    if (s.mode === 'FIXED' && s.fallback) (node as any).resize(s.fallback, (node as any).height)
  }
  if (overrides.height !== undefined && 'resize' in node) {
    const s = parseSizing(overrides.height)
    if (s.mode === 'FIXED' && s.fallback) (node as any).resize((node as any).width, s.fallback)
  }
  if (overrides.cornerRadius !== undefined && 'cornerRadius' in node) {
    if (typeof overrides.cornerRadius === 'number') (node as any).cornerRadius = overrides.cornerRadius
  }
  if (overrides.enabled === false) node.visible = false
}

// ─── Geometry Nodes ─────────────────────────────────────────

function createRectangle(pen: any): RectangleNode {
  const node = figma.createRectangle()
  stats.rects++
  node.fills = []
  if (pen.fill !== undefined) applyFills(node, pen.fill)
  applyStroke(node, pen.stroke)
  applyEffects(node, pen.effect)
  return node
}

function createEllipse(pen: any): EllipseNode {
  const node = figma.createEllipse()
  stats.rects++
  node.fills = []
  if (pen.fill !== undefined) applyFills(node, pen.fill)
  applyStroke(node, pen.stroke)
  applyEffects(node, pen.effect)

  // Arc properties
  if (pen.startAngle !== undefined || pen.sweepAngle !== undefined) {
    const start = resolveNum(pen.startAngle) ?? 0
    const sweep = resolveNum(pen.sweepAngle) ?? 360
    node.arcData = {
      startingAngle: start * Math.PI / 180,
      endingAngle: (start + sweep) * Math.PI / 180,
      innerRadius: resolveNum(pen.innerRadius) ?? 0,
    }
  }
  return node
}

function createLine(pen: any): LineNode {
  const node = figma.createLine()
  stats.vectors++
  applyStroke(node, pen.stroke)
  applyEffects(node, pen.effect)
  return node
}

function createPolygon(pen: any): PolygonNode {
  const node = figma.createPolygon()
  stats.vectors++
  node.fills = []
  if (pen.fill !== undefined) applyFills(node, pen.fill)
  applyStroke(node, pen.stroke)
  applyEffects(node, pen.effect)
  if (pen.polygonCount) node.pointCount = pen.polygonCount
  return node
}

function createPath(pen: any): SceneNode {
  stats.vectors++
  if (pen.geometry) {
    const w = typeof pen.width === 'number' ? pen.width : 100
    const h = typeof pen.height === 'number' ? pen.height : 100
    try {
      const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><path d="${pen.geometry}" fill="black"/></svg>`
      const frame = figma.createNodeFromSvg(svg)
      // Flatten the SVG frame into a single vector if possible
      if (frame.children.length === 1 && frame.children[0].type === 'VECTOR') {
        const vec = frame.children[0] as VectorNode
        vec.name = pen.name || pen.id || 'Path'
        if (pen.fill !== undefined) applyFills(vec, pen.fill)
        applyStroke(vec, pen.stroke)
        return vec
      }
      frame.name = pen.name || pen.id || 'Path'
      return frame
    } catch (_e) {
      // Fallback to rectangle placeholder
      const rect = figma.createRectangle()
      rect.name = `Path (${pen.name || pen.id || 'placeholder'})`
      rect.fills = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 }, opacity: 0.2 }]
      return rect
    }
  }
  const rect = figma.createRectangle()
  rect.name = pen.name || 'Empty path'
  rect.fills = []
  return rect
}

async function createIconFont(pen: any): Promise<FrameNode> {
  // Create a small frame with the icon name as text
  const frame = figma.createFrame()
  frame.fills = []
  const w = typeof pen.width === 'number' ? pen.width : 24
  const h = typeof pen.height === 'number' ? pen.height : 24
  frame.resize(w, h)

  // Try to use the actual icon font
  const iconFamily = pen.iconFontFamily || 'Material Symbols Outlined'
  const iconName = pen.iconFontName || 'star'

  const textNode = figma.createText()
  try {
    await figma.loadFontAsync({ family: iconFamily, style: 'Regular' })
    textNode.fontName = { family: iconFamily, style: 'Regular' }
  } catch (_e) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
    textNode.fontName = { family: 'Inter', style: 'Regular' }
  }
  textNode.characters = iconName
  textNode.fontSize = Math.min(w, h)
  if (pen.fill !== undefined) applyFills(textNode, pen.fill)

  frame.appendChild(textNode)
  frame.layoutMode = 'HORIZONTAL'
  frame.primaryAxisAlignItems = 'CENTER'
  frame.counterAxisAlignItems = 'CENTER'
  frame.layoutSizingHorizontal = 'FIXED'
  frame.layoutSizingVertical = 'FIXED'

  return frame
}

// ─── Main Node Tree Builder ─────────────────────────────────

async function buildNode(pen: any, parent: BaseNode & ChildrenMixin, parentLayout: boolean): Promise<SceneNode | null> {
  if (!pen || !pen.type) return null

  // Handle instance/ref
  if (pen.type === 'ref') {
    const inst = await createInstance(pen)
    if (!inst) return null
    applyCommon(inst, pen)
    parent.appendChild(inst)

    // Apply sizing after parenting
    if (parentLayout) {
      applySizing(inst, pen, parentLayout)
    } else {
      // Position
      if (pen.x !== undefined) inst.x = pen.x
      if (pen.y !== undefined) inst.y = pen.y
    }

    return inst
  }

  let node: SceneNode

  switch (pen.type) {
    case 'frame':
    case 'group': {
      const isComp = pen.reusable === true
      const frame = createFrameBase(pen, isComp)
      if (isComp) stats.components++
      else stats.frames++

      applyCommon(frame, pen)
      parent.appendChild(frame)

      // Position & sizing after parenting
      if (parentLayout) {
        applySizing(frame, pen, parentLayout)
      } else {
        if (pen.x !== undefined) frame.x = pen.x
        if (pen.y !== undefined) frame.y = pen.y
        // For top-level frames, set explicit size
        const w = parseSizing(pen.width)
        const h = parseSizing(pen.height)
        if (w.mode === 'FIXED' && w.fallback) {
          frame.layoutSizingHorizontal = 'FIXED'
          frame.resize(w.fallback, frame.height)
        }
        if (h.mode === 'FIXED' && h.fallback) {
          frame.layoutSizingVertical = 'FIXED'
          frame.resize(frame.width, h.fallback)
        }
      }

      // Store component
      if (isComp && pen.id) componentMap.set(pen.id, frame as ComponentNode)

      // Build children
      const childLayout = hasLayout(pen)
      if (pen.children && Array.isArray(pen.children)) {
        for (const child of pen.children) {
          try {
            await buildNode(child, frame, childLayout)
          } catch (_e3) {
            sendLog(`Error building child ${child.name || child.id || child.type}: ${(_e3 as any).message}`, 'warn')
          }
        }
      }

      return frame
    }

    case 'rectangle': {
      node = createRectangle(pen)
      break
    }

    case 'ellipse': {
      node = createEllipse(pen)
      break
    }

    case 'text': {
      node = await createText(pen)
      break
    }

    case 'line': {
      node = createLine(pen)
      break
    }

    case 'polygon': {
      node = createPolygon(pen)
      break
    }

    case 'path': {
      node = createPath(pen)
      break
    }

    case 'icon_font': {
      node = await createIconFont(pen)
      break
    }

    case 'note':
    case 'prompt':
    case 'context': {
      // These are annotation/AI node types — import as styled text
      node = await createText({
        ...pen,
        type: 'text',
        content: pen.content || ('[' + pen.type + ']'),
        fontFamily: pen.fontFamily || 'Space Mono',
        fontSize: pen.fontSize || 12,
        fill: pen.fill || '#7a8499',
      })
      break
    }

    default: {
      sendLog(`Unknown type: ${pen.type}`, 'warn')
      return null
    }
  }

  applyCommon(node, pen)
  parent.appendChild(node)

  // Position & sizing
  if (parentLayout) {
    applySizing(node, pen, parentLayout)
  } else {
    if (pen.x !== undefined && 'x' in node) node.x = pen.x
    if (pen.y !== undefined && 'y' in node) node.y = pen.y
    // Explicit size for non-layout children — guard against zero
    const w = typeof pen.width === 'number' ? pen.width : null
    const h = typeof pen.height === 'number' ? pen.height : null
    const safeW = (w !== null && w > 0) ? w : null
    const safeH = (h !== null && h > 0) ? h : null
    if (safeW !== null && safeH !== null && 'resize' in node) (node as any).resize(safeW, safeH)
    else if (safeW !== null && 'resize' in node) (node as any).resize(safeW, (node as any).height || 100)
    else if (safeH !== null && 'resize' in node) (node as any).resize((node as any).width || 100, safeH)
  }

  return node
}

// ─── Scan: Extract screens + existing pages for the mapper ──

function scanDocument(data: any) {
  const doc = Array.isArray(data) ? { children: data } : data
  const children: any[] = doc.children || []

  // Deep scan: find ALL reusable nodes anywhere in the tree
  const allReusableIds = new Set<string>()
  const allRefIds = new Set<string>()
  function deepScan(node: any) {
    if (node.reusable === true && node.id) allReusableIds.add(node.id)
    if (node.type === 'ref' && node.ref) allRefIds.add(node.ref)
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) deepScan(child)
    }
    if (node.descendants) {
      for (const d of Object.values(node.descendants) as any[]) {
        if (d.type === 'ref' && d.ref) allRefIds.add(d.ref)
      }
    }
  }
  for (const child of children) deepScan(child)

  // Find missing refs
  const missingRefs: string[] = []
  allRefIds.forEach(function(refId) {
    if (!allReusableIds.has(refId)) missingRefs.push(refId)
  })

  const components = children.filter((n: any) => n.reusable === true)
  const screens = children.filter((n: any) => n.reusable !== true)

  const screenList = screens.map((n: any) => ({
    id: n.id || '',
    name: n.name || n.id || 'Untitled',
    type: n.type || 'frame',
  }))

  const existingPages = figma.root.children.map((p: PageNode) => ({
    id: p.id,
    name: p.name,
  }))

  figma.ui.postMessage({
    type: 'scan-result',
    screens: screenList,
    componentCount: components.length,
    existingPages: existingPages,
    currentPageId: figma.currentPage.id,
    currentPageName: figma.currentPage.name,
    missingRefs: missingRefs,
    totalRefs: allRefIds.size,
  })
}

// ─── Import Orchestration ───────────────────────────────────

async function importDocument(data: any, pageMap?: Record<string, string>) {
  // Reset state
  componentMap.clear()
  varValues.clear()
  figmaVars.clear()
  stats = { frames: 0, texts: 0, rects: 0, components: 0, instances: 0, variables: 0, vectors: 0 }

  // Normalize input
  const doc = Array.isArray(data) ? { children: data } : data
  const children: any[] = doc.children || []

  if (children.length === 0) {
    figma.ui.postMessage({ type: 'error', text: 'No nodes found in document' })
    return
  }

  // 0. Load all pages upfront to avoid cross-page access errors
  sendProgress(3, 'Loading all pages...')
  try {
    await figma.loadAllPagesAsync()
  } catch (_eLoad) {
    // Older API — fall through, individual pages loaded on switch
  }

  sendProgress(5, 'Creating variable collection...')

  // 1. Variables
  if (doc.variables) {
    await createVariables(doc.variables)
  }

  sendProgress(15, 'Loading fonts...')

  // 2. Preload fonts
  await preloadFonts(children)

  // 3. Deep collect ALL reusable nodes from the entire tree, plus top-level screens
  const components: any[] = []
  const componentIds = new Set<string>()
  function collectComponents(nodes: any[]) {
    for (const n of nodes) {
      if (n.reusable === true && n.id && !componentIds.has(n.id)) {
        components.push(n)
        componentIds.add(n.id)
      }
      if (n.children && Array.isArray(n.children)) {
        collectComponents(n.children)
      }
    }
  }
  collectComponents(children)
  const screens = children.filter((n: any) => n.reusable !== true)

  // 4. Create or find the Components page
  sendProgress(22, 'Preparing Components page...')
  let componentsPage: PageNode
  const compPageName = (pageMap && pageMap['__components__']) || 'Components'

  if (compPageName === figma.currentPage.name) {
    componentsPage = figma.currentPage
  } else {
    // Check if page exists
    const existing = figma.root.children.find((p: PageNode) => p.name === compPageName)
    if (existing) {
      componentsPage = existing
    } else {
      componentsPage = figma.createPage()
      componentsPage.name = compPageName
    }
  }

  // 5. Build components on the Components page
  sendProgress(25, 'Building components...')
  await figma.setCurrentPageAsync(componentsPage)

  for (let i = 0; i < components.length; i++) {
    const pen = components[i]
    const orig = { ...pen, x: (i % 5) * 300, y: Math.floor(i / 5) * 250 }
    try {
      await buildNode(orig, figma.currentPage, false)
    } catch (_e4) {
      sendLog('Component error: ' + (pen.name || pen.id) + ': ' + (_e4 as any).message, 'warn')
    }
    sendProgress(25 + (i / Math.max(components.length, 1)) * 20,
      'Building ' + (pen.name || pen.id) + '...')
  }
  sendLog('Created ' + components.length + ' components', 'ok')

  // 6. Group screens by target page
  const pageGroups: Record<string, any[]> = {}
  for (const screen of screens) {
    const targetPage = (pageMap && pageMap[screen.id]) || '__current__'
    if (!pageGroups[targetPage]) pageGroups[targetPage] = []
    pageGroups[targetPage].push(screen)
  }

  // 7. Build screens on their assigned pages
  const pageNames = Object.keys(pageGroups)
  let screensDone = 0
  const totalScreens = screens.length
  const firstScreenPage: PageNode | null = null

  for (let pi = 0; pi < pageNames.length; pi++) {
    const pageName = pageNames[pi]
    const pageScreens = pageGroups[pageName]
    let targetPage: PageNode

    if (pageName === '__current__') {
      // Use the original current page (the one active when plugin started)
      targetPage = figma.root.children.find((p: PageNode) => p.id === originalPageId) || figma.root.children[0]
    } else {
      // Find or create the page
      const existing = figma.root.children.find((p: PageNode) => p.name === pageName)
      if (existing) {
        targetPage = existing
      } else {
        targetPage = figma.createPage()
        targetPage.name = pageName
      }
    }

    await figma.setCurrentPageAsync(targetPage)
    try { await targetPage.loadAsync() } catch (_eLP) { /* already loaded */ }
    sendProgress(45 + (pi / Math.max(pageNames.length, 1)) * 10,
      'Organizing: ' + targetPage.name + '...')

    for (const pen of pageScreens) {
      try {
        await buildNode(pen, figma.currentPage, false)
      } catch (_e5) {
        sendLog('Page error: ' + (pen.name || pen.id) + ': ' + (_e5 as any).message, 'warn')
      }
      screensDone++
      sendProgress(55 + (screensDone / Math.max(totalScreens, 1)) * 40,
        'Building ' + (pen.name || pen.id) + '...')
    }
  }
  sendLog('Created ' + screens.length + ' screens across ' + pageNames.length + ' page(s)', 'ok')

  // 8. Zoom to fit on the first screen page
  sendProgress(96, 'Finishing up...')
  try {
    // Find a page with content (not the components page)
    let landingPage = figma.currentPage
    for (var pi2 = 0; pi2 < figma.root.children.length; pi2++) {
      var pg = figma.root.children[pi2]
      if (pg.id !== componentsPage.id) {
        try {
          await pg.loadAsync()
          if (pg.children.length > 0) { landingPage = pg; break }
        } catch (_ePg) { /* skip unloadable pages */ }
      }
    }
    await figma.setCurrentPageAsync(landingPage)
    if (landingPage.children.length > 0) {
      figma.viewport.scrollAndZoomIntoView(landingPage.children)
    }
  } catch (_eZoom) {
    // Non-critical — just zoom to current page
    try { figma.viewport.scrollAndZoomIntoView(figma.currentPage.children) } catch (_e9) { /* ignore */ }
  }

  sendProgress(100, 'Done!')
  figma.ui.postMessage({
    type: 'done',
    stats: {
      'Pages': pageNames.length,
      'Components': stats.components,
      'Instances': stats.instances,
      'Frames': stats.frames,
      'Text layers': stats.texts,
      'Shapes': stats.rects,
      'Vectors': stats.vectors,
      'Variables': stats.variables,
    },
  })
}

// ─── Plugin Entry Point ─────────────────────────────────────

figma.showUI(__html__, { width: 480, height: 600, themeColors: true })

// Store the original page so we can reference "Current Page" later
var originalPageId = figma.currentPage.id

figma.ui.onmessage = async (msg: any) => {
  if (msg.type === 'scan') {
    try {
      scanDocument(msg.data)
    } catch (e: any) {
      figma.ui.postMessage({ type: 'error', text: e.message || String(e) })
    }
  }

  if (msg.type === 'import') {
    try {
      await importDocument(msg.data, msg.pageMap)
    } catch (e: any) {
      figma.ui.postMessage({ type: 'error', text: e.message || String(e) })
      console.error(e)
    }
  }
}
