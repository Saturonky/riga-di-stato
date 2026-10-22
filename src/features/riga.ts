// La riga di stato: si ricompone dopo ogni turno, ogni compattazione e quando cambia la larghezza.
import { locale } from '../stato.ts'
import { aggiorna, leggiRamo, notaColonne, pianifica, type Motore, type On } from '../effetti.ts'

/** Alla partenza della sessione: il ramo e la prima riga. */
export async function avviaRiga($: Motore): Promise<void> {
  await leggiRamo($)
  await aggiorna($)
}

export function registraRiga(on: On): void {
  // La larghezza del terminale, letta dal disegno della banda sopra il prompt: non disegna nulla.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface === 'terminal') {
      notaColonne($, e.viewport?.columns)
      if (e.viewport?.rows) locale.righeTerminale = e.viewport.rows
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) {
      await leggiRamo($)
      locale.spaccato.at = 0
      pianifica($)
    }
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && r.messages) {
      locale.spaccato.at = 0
      pianifica($)
    }
    return r
  }).catch(($, e, next) => next(e))
}
