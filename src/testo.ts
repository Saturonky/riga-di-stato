// Larghezza a schermo e formati: funzioni pure, senza `$`.

const LARGHI_BMP = new Set([
  0x231a, 0x231b, 0x23e9, 0x23ea, 0x23eb, 0x23ec, 0x23f0, 0x23f3, 0x25fd, 0x25fe, 0x2614, 0x2615,
  0x267f, 0x2693, 0x26a1, 0x26aa, 0x26ab, 0x26bd, 0x26be, 0x26c4, 0x26c5, 0x26ce, 0x26d4, 0x26ea,
  0x26f2, 0x26f3, 0x26f5, 0x26fa, 0x26fd, 0x2705, 0x270a, 0x270b, 0x2728, 0x274c, 0x274e, 0x2753,
  0x2754, 0x2755, 0x2757, 0x2795, 0x2796, 0x2797, 0x27b0, 0x27bf, 0x2b1b, 0x2b1c, 0x2b50, 0x2b55,
])

/** Celle occupate da un carattere: 0 per i modificatori, 2 per emoji e ideogrammi. */
function celle(cp: number): number {
  if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x300 && cp <= 0x36f)) return 0
  if (LARGHI_BMP.has(cp) || (cp >= 0x2648 && cp <= 0x2653)) return 2
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3)) return 2
  if ((cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0x1f300 && cp <= 0x1faff)) return 2
  return 1
}

export const wc = (s: string): number => {
  let n = 0
  for (const ch of s) n += celle(ch.codePointAt(0) ?? 0)
  return n
}

/** Taglia a `n` celle, con l'ellissi alla fine. */
export function taglia(s: string, n: number): string {
  if (n <= 0) return ''
  if (wc(s) <= n) return s
  let out = ''
  let w = 0
  for (const ch of s) {
    const c = celle(ch.codePointAt(0) ?? 0)
    if (w + c > n - 1) break
    out += ch
    w += c
  }
  return `${out}…`
}

/** Taglia un percorso dal centro: tiene la radice e il nome del file. */
export function tagliaPercorso(p: string, n: number): string {
  const s = p.replace(/\\/g, '/').replace(/^[A-Za-z]:\/Users\/[^/]+/, '~')
  if (wc(s) <= n) return s
  const pezzi = s.split('/')
  const nome = pezzi.pop() ?? s
  if (wc(nome) + 2 >= n) return taglia(nome, n)
  const testa = taglia(pezzi.join('/'), n - wc(nome) - 2).replace(/…$/, '')
  return `${testa}…/${nome}`
}

export const spazi = (n: number): string => ' '.repeat(Math.max(0, n))
export const compatta = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** 1234 -> 1.2k, 123456 -> 123k, 1000000 -> 1M. */
export function tk(n: number | undefined): string {
  if (n === undefined) return '?'
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a % 1_000_000 === 0 ? 0 : 2)}M`
  if (a >= 100_000) return `${Math.round(n / 1000)}k`
  if (a >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export const conSegno = (n: number): string => `${n >= 0 ? '+' : '−'}${tk(Math.abs(n))}`

export const ora = (ms: number): string => {
  const d = new Date(ms)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(x => String(x).padStart(2, '0')).join(':')
}

export const quando = (iso: string): string => {
  const d = new Date(iso)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return d.toDateString() === new Date().toDateString() ? hm : `${['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][d.getDay()]} ${hm}`
}

export const livello = (pct: number): { emoji: string; colore: string } =>
  pct < 20 ? { emoji: '🟢', colore: 'success' }
  : pct < 70 ? { emoji: '⚡', colore: 'warning' }
  : pct < 90 ? { emoji: '🔥', colore: 'warning' }
  : { emoji: '🚨', colore: 'error' }

const OTTAVI = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

/** Barra a ottavi di cella: `n` celle, piena per `pct` su 100. */
export function barra(pct: number, n: number): string {
  const ottavi = Math.round((Math.max(0, Math.min(100, pct)) * n * 8) / 100)
  const pieni = Math.floor(ottavi / 8)
  const resto = OTTAVI[ottavi % 8] ?? ''
  return '█'.repeat(pieni) + resto + '·'.repeat(Math.max(0, n - pieni - (resto ? 1 : 0)))
}

const NOMI_LIMITE: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spesa' }
export const nomeLimite = (kind: string): string => NOMI_LIMITE[kind] ?? kind

export const nomeModello = (m: string): string => m.replace(/^claude-/, '').replace(/\s*[([].*$/, '').trim()
