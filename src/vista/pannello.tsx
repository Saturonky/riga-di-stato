// Il pannello intero: riepilogo, menu, la sezione aperta e, se sotto il bordo c'è altro, l'avviso.
import type { Vista } from '../../types'
import { spazi, taglia } from '../testo.ts'
import type { Azioni, DatiPannello } from './dati.ts'
import { kit, M, type Elementi, type Kit } from './kit.tsx'
import { ordine } from './ordine.tsx'
import { menu, riepilogo } from './riepilogo.tsx'
import { categorie, cronologia, limiti } from './sezioni.tsx'

type Sezione = (ui: Elementi, k: Kit, d: DatiPannello, a: Azioni) => unknown[]
const SEZIONE: Record<Exclude<Vista, 'nessuna'>, Sezione> = { categorie, ordine, cronologia, limiti }

/** Le righe del pannello, larghe al più `W` celle. */
export function righePannello(ui: Elementi, W: number, d: DatiPannello, a: Azioni, focus = true): unknown[] {
  const k = kit(ui, W)
  const corpo = [...riepilogo(ui, k, d), ...menu(ui, k, d, a, focus)]
  if (d.aperta !== 'nessuna') corpo.push(k.vuota(), ...SEZIONE[d.aperta](ui, k, d, a))
  return corpo
}

/** Se sotto il bordo c'è altro, l'ultima riga visibile lo dice. */
export function conAvvisoScorrimento(ui: Elementi, W: number, corpo: unknown[], scroll: { offset: number; bodyRows: number }): unknown[] {
  const { Text } = ui
  const nascoste = corpo.length - scroll.offset - scroll.bodyRows + 1
  if (scroll.bodyRows <= 1 || nascoste <= 0) return corpo
  const out = [...corpo]
  out.splice(scroll.offset + scroll.bodyRows - 1, 0, (
    <Text color="suggestion">{taglia(`${spazi(M)}↓ altre ${nascoste} righe: clic sul pannello e frecce`, W)}</Text>
  ))
  return out
}
