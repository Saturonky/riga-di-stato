// La riga di stato come Mod (al posto di una status line a script) e il pannello /contesto:
// che cosa entra nel contesto, in che ordine e quanto pesa. Solo osservazione: ogni hook passa
// avanti l'evento invariato e, se qualcosa va storto, si limita a non registrare.
//
// Questo file compone soltanto. Le decisioni sono funzioni pure in src/ (testo, stime, riga, viste in
// src/vista/), lo stato sta in src/stato.ts, gli effetti in src/effetti.ts, una funzionalità per file in
// src/features/. Un evento con lo stesso matcher si aggancia una volta sola in tutto il modulo: per
// questo session.start e session.end stanno qui e chiamano le funzionalità.
//
// Portata: legge l'uso della sessione e lancia `git rev-parse` con un argv letterale; non scrive file,
// non usa la rete, non aggiunge testo per il modello.
import type { Register } from 'claude-code'
import { COMANDO, registraComando } from '../src/features/comando.ts'
import { registraModifiche } from '../src/features/modifiche.ts'
import { registraPannello } from '../src/features/pannello.tsx'
import { registraRegistro } from '../src/features/registro.ts'
import { azzera } from '../src/stato.ts'
import { avviaRiga, registraRiga } from '../src/features/riga.ts'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register(COMANDO)
    await avviaRiga($)
    return r
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await azzera($)
    return next(e)
  })

  registraComando(on)
  registraRiga(on)
  registraRegistro(on)
  registraModifiche(on)
  registraPannello(on)
}
