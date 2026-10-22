// Ciò che il pannello disegna: tutto letto prima, così le viste restano pure.
import type { SessionContextBreakdown, SessionUsage } from 'claude-code'
import type { Avvio, Richiesta, Riga, Sistema, Totale, Vista } from '../../types'
import type { Allarme } from '../riga.ts'

export type DatiPannello = {
  uso: SessionUsage
  spaccato: SessionContextBreakdown | undefined
  richieste: Richiesta[]
  modifiche: { aggiunte: number; rimosse: number }
  allarmi: Allarme[]
  aperta: Vista
  chiuse: string[]
  sistema: Sistema | null
  avvio: Avvio | null
  perPorta: Record<string, Totale>
  cronologia: Riga[]
}

export type Azioni = { scegli: (id: Exclude<Vista, 'nessuna'>) => void; alternaMcp: () => void }
