// Il pannello /contesto: legge i dati, li passa alla vista pura e, sopra il prompt, chiede
// l'altezza del contenuto fino al tetto (il riepilogo sempre intero).
import { MAX_LARGHEZZA } from '../costanti.ts'
import { allarmiOra, altezzaInline, apriPannello, leggiSpaccato, notaColonne, type Motore, type On } from '../effetti.ts'
import { alternaChiusa, alternaVista, leggiRegistro, locale } from '../stato.ts'
import type { Azioni, DatiPannello } from '../vista/dati.ts'
import { conAvvisoScorrimento, righePannello } from '../vista/pannello.tsx'

async function leggiDati($: Motore): Promise<DatiPannello> {
  const registro = await leggiRegistro($)
  const uso = await $.session.usage()
  const spaccato = await leggiSpaccato($)
  return { ...registro, uso, spaccato, allarmi: await allarmiOra($, uso) }
}

function azioni($: Motore): Azioni {
  return {
    scegli: id => void alternaVista($, id),
    alternaMcp: () => void alternaChiusa($, 'mcp'),
  }
}

/** Sopra il prompt il blocco prende l'altezza del contenuto; il nuovo ordine parte da un timer, fuori dal disegno. */
function adattaAltezza($: Motore, righe: number): void {
  const voluta = altezzaInline(righe)
  if (voluta === locale.altezzaChiesta || locale.ridimensiona) return
  locale.ridimensiona = true
  $.clock.after(50, () => {
    locale.ridimensiona = false
    locale.altezzaChiesta = voluta
    void apriPannello($, voluta)
  })
}

export function registraPannello(on: On): void {
  on('ui.render', { component: 'Pane', requestId: 'contesto' }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const W = Math.min(MAX_LARGHEZZA, Math.max(24, e.props.bodyColumns))
    if (e.surface === 'terminal' && e.props.placement === 'inline') notaColonne($, e.viewport?.columns)
    if (e.viewport?.rows) locale.righeTerminale = e.viewport.rows
    const corpo = righePannello(ui, W, await leggiDati($), azioni($), e.props.isFocused !== false)
    if (e.props.placement === 'inline') adattaAltezza($, corpo.length)
    const { Box } = ui
    return <Box flexDirection="column">{conAvvisoScorrimento(ui, W, corpo, e.props.scroll) as never[]}</Box>
  })
}

