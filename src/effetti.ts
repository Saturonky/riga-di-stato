// Gli effetti, in un posto solo: la portata della Mod si legge da qui. Legge l'uso della sessione,
// lancia `git rev-parse` (argv letterale, nessun testo dell'utente), apre il pannello, scrive la riga.
import type { EngineInterface, Register, SessionContextBreakdown, SessionUsage } from 'claude-code'
import { DOCK_COLONNE, INLINE_MIN, INLINE_QUOTA, PANNELLO } from './costanti.ts'
import { allarmi, riga, type Allarme } from './riga.ts'
import { leggiRichieste, locale } from './stato.ts'

export type Motore = EngineInterface
export type On = Parameters<Register>[0]

/** Lo spaccato del contesto, letto al più una volta ogni `eta` ms. */
export async function leggiSpaccato($: Motore, eta = 5000): Promise<SessionContextBreakdown | undefined> {
  const adesso = await $.clock.now()
  if (adesso - locale.spaccato.at < eta) return locale.spaccato.valore
  try {
    const u = await $.session.usage({ breakdown: 'summary' })
    locale.spaccato = { at: adesso, valore: u.context.breakdown }
  } catch {
    locale.spaccato = { at: adesso, valore: locale.spaccato.valore }
  }
  return locale.spaccato.valore
}

export async function leggiRamo($: Motore): Promise<void> {
  try {
    locale.cartella = await $.session.cwd()
    const r = await $.process.run(['git', '-C', locale.cartella, '--no-optional-locks', 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5000 })
    locale.ramo = r.exitCode === 0 ? r.stdout.trim() || undefined : undefined
  } catch {
    locale.ramo = undefined
  }
}

export async function allarmiOra($: Motore, u: SessionUsage): Promise<Allarme[]> {
  const b = await leggiSpaccato($, 20_000)
  const ultima = (await leggiRichieste($)).filter(r => !r.agente).at(-1)
  return allarmi(u, b, ultima)
}

export async function aggiorna($: Motore): Promise<void> {
  try {
    const uso: SessionUsage = await $.session.usage()
    const a = await allarmiOra($, uso)
    $.ui.status(riga({ cartella: locale.cartella, ramo: locale.ramo, uso, allarmi: a, modello: await $.session.model(), colonne: locale.colonne }))
  } catch (err) {
    $.ui.status(`⚠ ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Raggruppa le richieste di aggiornamento arrivate a raffica. */
export function pianifica($: Motore): void {
  if (locale.pianificato) return
  locale.pianificato = true
  $.clock.after(400, () => {
    locale.pianificato = false
    void aggiorna($)
  })
}

/** Tiene la larghezza del terminale; se cambia, ricompone la riga (fuori dal disegno). */
export function notaColonne($: Motore, n: number | undefined): void {
  if (!n || n === locale.colonne) return
  locale.colonne = n
  pianifica($)
}

/** Le righe da chiedere sopra il prompt per un contenuto alto `contenuto`: tutto, fino al tetto. */
export function altezzaInline(contenuto: number): number {
  const t = locale.righeTerminale
  const tetto = t ? Math.max(INLINE_MIN, Math.floor(t * INLINE_QUOTA)) : 30
  return Math.max(1, Math.min(contenuto, tetto))
}

export function apriPannello($: Motore, rows: number) {
  return $.ui.open({ id: PANNELLO, title: 'Contesto', rows, columns: DOCK_COLONNE, closeOnEscape: true })
}
