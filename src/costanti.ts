// Le misure del pannello e i limiti del registro.
import type { Vista } from '../types'

export const PANNELLO = 'contesto'
export const MAX_RIGHE = 400
export const MAX_RICHIESTE = 200
/** Quanto chiede il pannello: largo di fianco alla chat, basso sopra il prompt. */
export const DOCK_COLONNE = 46
/** Il motore mette il pannello di fianco alla chat solo nel fullscreen e da questa larghezza. */
export const DOCK_MIN_COLONNE = 110
/** Sopra il prompt: almeno il riepilogo intero, al più questa quota dell'altezza del terminale. */
export const INLINE_MIN = 18
export const INLINE_QUOTA = 0.6
/** Oltre questa larghezza il contenuto non si allarga: resta una colonna leggibile. */
export const MAX_LARGHEZZA = 72

export const SEZIONI: { id: Exclude<Vista, 'nessuna'>; nome: string; breve: string }[] = [
  { id: 'categorie', nome: 'Categorie', breve: 'Categorie' },
  { id: 'ordine', nome: 'Ordine di caricamento', breve: 'Ordine' },
  { id: 'cronologia', nome: 'Cronologia', breve: 'Cronologia' },
  { id: 'limiti', nome: 'Limiti', breve: 'Limiti' },
]
