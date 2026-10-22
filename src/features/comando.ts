// /contesto: apre o chiude il pannello, o apre una sezione; senza posto per il pannello risponde in testo.
import type { SessionContextBreakdown, SessionUsage } from 'claude-code'
import type { Vista } from '../../types'
import { DOCK_MIN_COLONNE, INLINE_MIN, PANNELLO, SEZIONI } from '../costanti.ts'
import { altezzaInline, apriPannello, leggiSpaccato, notaColonne, type On } from '../effetti.ts'
import { locale, scegliVista } from '../stato.ts'
import { tk } from '../testo.ts'

export const COMANDO = {
  name: 'contesto',
  description: 'Apre o chiude il pannello del contesto: riepilogo, categorie, ordine di caricamento, cronologia, limiti',
  argumentHint: '[categorie|ordine|cronologia|limiti]',
}

/** Il riepilogo in testo, quando il pannello non trova posto. */
export function riassunto(u: SessionUsage, b: SessionContextBreakdown | undefined): string {
  const c = u.context
  const righe = [`Contesto ${c.percent ?? 0}% · ${tk(c.tokens ?? 0)}/${tk(c.window)} token`]
  if (b) {
    for (const cat of b.categories.filter(x => x.tokens > 0)) righe.push(`- ${cat.name}: ${tk(cat.tokens)}`)
    if (b.autoCompactThreshold) righe.push(`Autocompact a ${tk(b.autoCompactThreshold)}`)
  }
  return righe.join('\n')
}

type Presentazione = { columns: number; isFullscreen: boolean } | undefined

/** Che cosa manca per avere il pannello di fianco alla chat, o niente se c'è tutto. */
export function cheCosaManca(p: Presentazione): string | undefined {
  if (!p || (p.isFullscreen && p.columns >= DOCK_MIN_COLONNE)) return undefined
  const manca = [
    p.isFullscreen ? '' : 'il layout fullscreen (ora non attivo: per esempio dentro tmux o con CLAUDE_CODE_NO_FLICKER=0)',
    p.columns < DOCK_MIN_COLONNE ? `almeno ${DOCK_MIN_COLONNE} colonne (ora ${p.columns})` : '',
  ].filter(Boolean)
  return `Pannello del contesto aperto sopra il prompt. Per averlo di fianco alla chat serve ${manca.join(' e ')}.`
}

export function registraComando(on: On): void {
  on('command.run', { command: 'contesto' }, async ($, e) => {
    notaColonne($, e.presentation?.columns)
    const richiesta = String(e.args ?? '').trim() as Vista
    const scelta = SEZIONI.some(x => x.id === richiesta)
    if (scelta) await scegliVista($, richiesta)
    const aperto = (await $.ui.panes()).some(p => p.id === PANNELLO)
    if (aperto && !scelta) {
      await $.ui.close({ id: PANNELLO })
      return { text: 'Pannello del contesto chiuso.' }
    }
    locale.altezzaChiesta = locale.altezzaChiesta || altezzaInline(INLINE_MIN)
    const r = await apriPannello($, locale.altezzaChiesta)
    if (r.isPlaced) return { text: cheCosaManca(e.presentation) ?? 'Pannello del contesto aperto.' }
    return { text: riassunto(await $.session.usage(), await leggiSpaccato($, 0)) }
  }).catch(async () => ({ text: 'Non riesco ad aprire il pannello del contesto. Riprova; intanto /context mostra lo stesso riepilogo.' }))
}
