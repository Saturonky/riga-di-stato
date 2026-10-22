// UI/UX checks for a drawn tree. Works on trees returned by `pane.drawn()` and on trees built from
// stub elements. It is a structural check: it catches overflow, dead keys and unsupported
// elements, and prints a text preview. It cannot judge looks; a human still needs one real look.

export type Node = { type?: string; props?: Record<string, any>; children?: any[] } | string | null | undefined
export type Finding = { level: 'error' | 'warn'; message: string }

const kidsOf = (n: any): any[] => (typeof n === 'object' && n ? (n.children ?? n.props?.children ?? []) : [])
const propsOf = (n: any): Record<string, any> => (typeof n === 'object' && n ? (n.props ?? {}) : {})
const isTruncating = (n: any) => String(propsOf(n).wrap ?? '').startsWith('truncate')

// Elements each surface can draw (docs: "Elements" table). Unknown elements are refused whole.
const SUPPORT: Record<string, string[]> = {
  terminal: ['Box', 'Text', 'Button', 'Link', 'Code', 'Markdown', 'Input', 'Select', 'Client', 'Raster', 'Image'],
  desktop: ['Box', 'Text', 'Button', 'Link', 'Code', 'Markdown', 'Input', 'Select', 'Svg', 'Client'],
}

/** Columns the node needs on one row. A truncating Text can shrink to nothing, so it needs 0. */
export function needed(n: any): number {
  if (typeof n === 'string') return n.length
  if (!n || typeof n !== 'object') return 0
  const p = propsOf(n)
  const kids = kidsOf(n)
  if (n.type === 'Text') {
    if (isTruncating(n)) return 0
    const text = kids.map((k: any) => (typeof k === 'string' ? k : '')).join('')
    // Text wraps by default, so it only needs room for its longest word.
    if (String(p.wrap ?? 'wrap') === 'wrap') return Math.max(0, ...text.split(/\s+/).map((w: string) => w.length))
    return text.length
  }
  if (n.type === 'Button') {
    const label = String(p.label ?? '')
    return p.plain ? label.length + (p.hotkey ? String(p.hotkey).length + 2 : 0) : label.length + 4
  }
  const padX = ((p.paddingX ?? p.padding ?? 0) as number) * 2
  const gap = (p.columnGap ?? p.gap ?? 0) as number
  const widths = kids.map(needed)
  if ((p.flexDirection ?? 'row').startsWith('column')) return padX + Math.max(0, ...widths)
  return padX + widths.reduce((s: number, w: number) => s + w, 0) + gap * Math.max(0, widths.length - 1)
}

export function lint(tree: Node, o: { surface: 'terminal' | 'desktop'; columns: number }): Finding[] {
  const out: Finding[] = []
  const keys = new Map<string, number>()
  const hotkeys = new Map<string, number>()
  const walk = (n: any, depth: number) => {
    if (!n || typeof n !== 'object') return
    if (n.type && !SUPPORT[o.surface].includes(n.type)) out.push({ level: 'error', message: `${n.type} is not drawn on ${o.surface}: the engine would refuse the whole tree` })
    const p = propsOf(n)
    if (['Button', 'Input', 'Select'].includes(n.type)) {
      if (!p.key) out.push({ level: 'error', message: `${n.type} "${p.label ?? ''}" has no key (tests and focus need one)` })
      else keys.set(p.key, (keys.get(p.key) ?? 0) + 1)
      if (n.type === 'Button' && !String(p.label ?? '').trim()) out.push({ level: 'error', message: `Button ${p.key ?? ''} has no label` })
    }
    if (p.hotkey != null) {
      if (!/^[0-9a-z]$/.test(String(p.hotkey))) out.push({ level: 'error', message: `hotkey "${p.hotkey}" must be one digit or one lowercase letter` })
      hotkeys.set(String(p.hotkey), (hotkeys.get(String(p.hotkey)) ?? 0) + 1)
    }
    if (depth > 6) out.push({ level: 'warn', message: 'nesting deeper than 6 levels: simplify the layout' })
    kidsOf(n).forEach((k) => walk(k, depth + 1))
  }
  walk(tree, 0)
  for (const [k, c] of keys) if (c > 1) out.push({ level: 'error', message: `key "${k}" is used ${c} times` })
  for (const [k, c] of hotkeys) if (c > 1) out.push({ level: 'error', message: `hotkey "${k}" is used ${c} times (the later button wins)` })
  const w = needed(tree)
  if (w > o.columns) out.push({ level: 'error', message: `needs ${w} columns but only ${o.columns} are available (add wrap:'truncate-end' or stack the row)` })
  const controls = [...keys.keys()].length
  if (controls > 0 && hotkeys.size === 0) out.push({ level: 'warn', message: 'controls have no hotkeys: keyboard users must tab to each one' })
  return out
}

/** Plain-text preview, for a human or an AI to eyeball. */
export function toText(n: any, columns: number): string[] {
  if (typeof n === 'string') return [n]
  if (!n || typeof n !== 'object') return []
  const p = propsOf(n)
  const kids = kidsOf(n)
  if (n.type === 'Text') {
    const s = kids.map((k: any) => (typeof k === 'string' ? k : '')).join('')
    if (isTruncating(n)) return [s.length > columns ? s.slice(0, Math.max(0, columns - 1)) + '…' : s]
    if (String(p.wrap ?? 'wrap') !== 'wrap' || s.length <= columns) return [s]
    const lines: string[] = []
    let line = ''
    for (const w of s.split(/\s+/)) {
      if ((line + ' ' + w).trim().length > columns) { lines.push(line); line = w } else line = (line + ' ' + w).trim()
    }
    return [...lines, line]
  }
  if (n.type === 'Button') return [p.plain ? (p.hotkey ? `${p.hotkey}: ${p.label}` : String(p.label)) : `[ ${p.label} ]`]
  const rows = kids.map((k: any) => toText(k, columns))
  if ((p.flexDirection ?? 'row').startsWith('column')) return rows.flat()
  const gap = ' '.repeat((p.columnGap ?? p.gap ?? 0) as number)
  return [rows.map((r: string[]) => r.join(' ')).join(gap || ' ')]
}

export const preview = (title: string, tree: Node, columns: number) =>
  [`┌ ${title} (${columns} cols)`, ...toText(tree, columns).map((l) => '│ ' + l), '└'].join('\n')

export const errors = (f: Finding[]) => f.filter((x) => x.level === 'error').map((x) => x.message)
