// Il registro di ciò che entra nel contesto: system prompt, primo messaggio, righe e richieste.
// Solo osservazione: ogni hook passa avanti l'evento invariato e, se qualcosa va storto, non registra.
import type { Avvio, Sistema } from '../../types'
import { pianifica, type On } from '../effetti.ts'
import { registraRichiesta, registraRiga, salvaAvvio, salvaSistema } from '../stato.ts'
import { caratteri, daCaratteri, origineDi, testoIniziale } from '../stime.ts'
import { compatta } from '../testo.ts'

export function registraRegistro(on: On): void {
  registraAvvio(on)
  registraConversazione(on)
}

/** Il system prompt e il primo messaggio: si ricompongono a ogni conversazione nuova. */
function registraAvvio(on: On): void {
  // Il system prompt, sezione per sezione, nell'ordine di invio.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    try {
      if (!e.traits.includes('analysis') && !e.traits.includes('teammate')) {
        const s: Sistema = {
          model: e.model,
          strumenti: e.tools.length,
          sezioni: r.sections.map(x => ({ id: x.id, scope: x.scope, tokens: daCaratteri(x.text.length) })),
          at: await $.clock.now(),
        }
        await salvaSistema($, s)
      }
    } catch { /* solo osservazione */ }
    return r
  })

  // I blocchi del primo messaggio e i file di istruzioni dietro claudeMd, nell'ordine di resa.
  on('prompt.context', async ($, e, next) => {
    const r = await next(e)
    try {
      const file = r.instructionFiles ?? e.instructionFiles ?? []
      const a: Avvio = {
        blocchi: r.blocks.map(x => ({ name: x.name, tokens: daCaratteri(x.text.length) })),
        file: file.map(f => ({ path: f.path, kind: f.kind, tokens: daCaratteri(f.content.length), ...(f.parent ? { parent: f.parent } : {}) })),
        at: await $.clock.now(),
      }
      await salvaAvvio($, a)
    } catch { /* solo osservazione */ }
    return r
  })

}

/** Le righe e le richieste, man mano che arrivano. */
function registraConversazione(on: On): void {
  // Ogni riga che entra nella conversazione, in ordine, con il suo peso stimato.
  on('session.append', async ($, e, next) => {
    const r = await next(e)
    try {
      const m = r.message
      if (m && (m.role || e.door === 'compaction')) {
        await registraRiga($, {
          at: await $.clock.now(),
          door: e.door,
          tipo: m.name ?? m.type,
          origine: origineDi(e.origin),
          tokens: daCaratteri(caratteri(m.content)),
          anteprima: compatta(testoIniziale(m.content)).slice(0, 200),
          ...(e.agentId ? { agente: e.agentId } : {}),
        })
        if (!e.agentId) pianifica($)
      }
    } catch { /* solo osservazione */ }
    return r
  }).catch(($, e, next) => next(e))

  // Ogni richiesta all'API: quanto contesto ha inviato, quanto dalla cache, quanto ha generato.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    try {
      if (r.usage) {
        await registraRichiesta($, r.usage, e.agentId)
        if (!e.agentId) pianifica($)
      }
    } catch { /* solo osservazione */ }
    return r
  })
}
