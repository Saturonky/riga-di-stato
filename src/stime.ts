// Stime del peso di ciò che entra nel contesto: funzioni pure, senza `$`.
import type { Richiesta, Riga } from '../types'

/** Token stimati da una lunghezza in caratteri (circa 4 per token). */
export const daCaratteri = (n: number): number => Math.ceil(n / 4)

/** Caratteri per tipo di blocco; immagini e documenti a forfait. */
const PESO_BLOCCO: Record<string, (b: Record<string, unknown>) => number> = {
  text: b => String(b.text ?? '').length,
  thinking: b => String(b.thinking ?? '').length,
  tool_use: b => JSON.stringify(b.input ?? {}).length + String(b.name ?? '').length,
  tool_result: b => caratteri(b.content),
  image: () => 6400,
  document: () => 6400,
}

/** Caratteri di un contenuto API, blocco per blocco. */
export function caratteri(contenuto: unknown): number {
  if (typeof contenuto === 'string') return contenuto.length
  if (!Array.isArray(contenuto)) return 0
  let n = 0
  for (const b of contenuto as Record<string, unknown>[]) {
    const peso = PESO_BLOCCO[String(b?.type)]
    n += peso ? peso(b) : JSON.stringify(b).length
  }
  return n
}

export function testoIniziale(contenuto: unknown): string {
  if (typeof contenuto === 'string') return contenuto
  if (!Array.isArray(contenuto)) return ''
  for (const b of contenuto as Record<string, unknown>[]) {
    if (b?.type === 'text') return String(b.text ?? '')
    if (b?.type === 'tool_result') return testoIniziale(b.content)
    if (b?.type === 'tool_use') return `${String(b.name ?? '')} ${JSON.stringify(b.input ?? {})}`
  }
  return ''
}

export function origineDi(o: unknown): string {
  const r = (o ?? {}) as Record<string, unknown>
  const dettaglio = r.tool ?? r.name ?? r.event ?? ''
  return dettaglio ? `${String(r.kind)}:${String(dettaglio)}` : String(r.kind ?? '?')
}

/** Che cosa è una riga, in poche parole: lo strumento, il tipo d'allegato, chi l'ha mandata. */
export const etichetta = (r: Riga): string => {
  const chi = r.origine.replace(/^(tool|model|plugin|hook):/, '')
  return r.tipo === r.door || r.tipo === 'user' || r.tipo === 'assistant' ? chi : `${r.tipo} · ${chi}`
}

export const righeDi = (s: string | undefined): number => (s ? s.split('\n').length : 0)

/** Cache hit della richiesta: quota dell'input servita dalla cache. */
export const cacheHit = (r: Richiesta): number => (r.contesto > 0 ? Math.round((r.cacheRead * 100) / r.contesto) : 0)
