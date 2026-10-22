// La riga di stato: segmenti con più forme e allarmi. Funzioni pure, senza `$`.
import type { SessionContextBreakdown, SessionUsage } from 'claude-code'
import type { Richiesta } from '../types'
import { cacheHit } from './stime.ts'
import { livello, nomeLimite, nomeModello, taglia, tk, wc } from './testo.ts'

/** Quando un dato diventa un allarme nella riga di stato. */
export const SOGLIA_COMPACT = 0.15
export const SOGLIA_LIMITE = 80
const SOGLIA_CACHE = 50

/** Un segmento: priorità (più alta, più resiste) e forme dalla più lunga alla più corta. */
type Segmento = { pri: number; forme: string[] }

const SEP = '    '

/** Sceglie per ogni segmento la forma più lunga che fa stare la riga in `budget` celle. */
export function adatta(segmenti: Segmento[], budget: number): string {
  const livelli = segmenti.map(() => 0)
  const testo = () => segmenti.map((s, i) => s.forme[livelli[i] ?? 0] ?? '').filter(Boolean).join(SEP)
  const ordine = segmenti.map((s, i) => ({ s, i })).sort((a, b) => a.s.pri - b.s.pri)
  while (wc(testo()) > budget) {
    const c = ordine.find(({ s, i }) => (livelli[i] ?? 0) < s.forme.length - 1)
    if (!c) break
    livelli[c.i] = (livelli[c.i] ?? 0) + 1
  }
  return taglia(testo(), budget)
}

/** Gli allarmi: compaiono nella riga solo quando qualcosa va guardato. */
export type Allarme = { breve: string; lungo: string }

export function allarmi(u: SessionUsage, b: SessionContextBreakdown | undefined, ultima: Richiesta | undefined): Allarme[] {
  const out: Allarme[] = []
  const tokens = u.context.tokens ?? 0
  if (b?.isAutoCompactEnabled && b.autoCompactThreshold) {
    const manca = Math.max(0, b.autoCompactThreshold - tokens)
    if (manca < b.autoCompactThreshold * SOGLIA_COMPACT) out.push({ lungo: `⚠ compact tra ${tk(manca)}`, breve: `⚠ ${tk(manca)}` })
  }
  for (const l of u.rateLimits) {
    if (l.percentUsed >= SOGLIA_LIMITE) {
      out.push({ lungo: `⚠ limite ${nomeLimite(l.kind)} ${Math.round(l.percentUsed)}%`, breve: `⚠ ${nomeLimite(l.kind)} ${Math.round(l.percentUsed)}%` })
    }
  }
  if (ultima && ultima.contesto >= 50_000 && cacheHit(ultima) < SOGLIA_CACHE) {
    out.push({ lungo: `⚠ cache ${cacheHit(ultima)}%`, breve: `⚠ c${cacheHit(ultima)}%` })
  }
  return out
}

export type DatiRiga = { cartella: string; ramo: string | undefined; uso: SessionUsage; allarmi: Allarme[]; modello: string; colonne: number }

/** La riga intera, adattata alla larghezza del terminale. */
export function riga(d: DatiRiga): string {
  const { tokens = 0, window: finestra, percent } = d.uso.context
  const pct = percent ?? 0
  const { emoji } = livello(pct)
  const dir = d.cartella.split(/[\\/]/).filter(Boolean).pop() ?? '?'
  const s: Segmento[] = [{
    pri: 3,
    forme: d.ramo
      ? [`${dir}  ⎇ ${d.ramo}`, `${taglia(dir, 16)}  ⎇ ${taglia(d.ramo, 14)}`, taglia(dir, 14), '']
      : [dir, taglia(dir, 14), ''],
  }]
  s.push({ pri: 10, forme: [`${emoji} ${pct}%  ${tk(tokens)} / ${tk(finestra)}`, `${emoji} ${pct}%`] })
  for (const a of d.allarmi) s.push({ pri: 9, forme: [a.lungo, a.breve] })
  if (d.uso.cost) s.push({ pri: 6, forme: [`$${d.uso.cost.usd.toFixed(2)}`, ''] })
  s.push({ pri: 4, forme: [nomeModello(d.modello), ''] })
  return adatta(s, Math.max(20, d.colonne - 4))
}
