// Lo stato, in un posto solo. Gli atom stanno in $.state (sopravvivono al ricaricamento, non a
// /clear); `locale` tiene ciò che si rifà a ogni ricarica: ramo, misure del terminale, cache.
// Il caricatore accetta read e update solo su un atom dichiarato nello stesso file: per questo ogni
// lettura e scrittura passa da una funzione di questo modulo.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, SessionContextBreakdown, TurnUsage } from 'claude-code'
import type { Avvio, Richiesta, Riga, Sistema, Totale, Vista } from '../types'
import { MAX_RICHIESTE, MAX_RIGHE } from './costanti.ts'

const sistema = atom({ plugin: 'riga-di-stato', key: 'sistema' } as const, null)
const avvio = atom({ plugin: 'riga-di-stato', key: 'avvio' } as const, null)
const cronologia = atom({ plugin: 'riga-di-stato', key: 'cronologia' } as const, [])
const perPorta = atom({ plugin: 'riga-di-stato', key: 'perPorta' } as const, {})
const richieste = atom({ plugin: 'riga-di-stato', key: 'richieste' } as const, [])
const modifiche = atom({ plugin: 'riga-di-stato', key: 'modifiche' } as const, { aggiunte: 0, rimosse: 0 })
const vista = atom({ plugin: 'riga-di-stato', key: 'vista' } as const, 'nessuna')
const chiuse = atom({ plugin: 'riga-di-stato', key: 'chiuse' } as const, ['mcp'])

type Motore = EngineInterface

export type Locale = {
  ramo: string | undefined
  cartella: string
  colonne: number
  righeTerminale: number
  /** L'altezza chiesta per il pannello sopra il prompt, e se un nuovo ridimensionamento è in arrivo. */
  altezzaChiesta: number
  ridimensiona: boolean
  spaccato: { at: number; valore: SessionContextBreakdown | undefined }
  pianificato: boolean
}

export const locale: Locale = {
  ramo: undefined,
  cartella: '',
  colonne: 120,
  righeTerminale: 0,
  altezzaChiesta: 0,
  ridimensiona: false,
  spaccato: { at: 0, valore: undefined },
  pianificato: false,
}

// --- letture ---------------------------------------------------------------------------------------

export async function leggiRichieste($: Motore): Promise<Richiesta[]> {
  return read($, richieste)
}

export type Registro = {
  aperta: Vista
  chiuse: string[]
  richieste: Richiesta[]
  modifiche: { aggiunte: number; rimosse: number }
  sistema: Sistema | null
  avvio: Avvio | null
  perPorta: Record<string, Totale>
  cronologia: Riga[]
}

export async function leggiRegistro($: Motore): Promise<Registro> {
  return {
    aperta: await read($, vista),
    chiuse: await read($, chiuse),
    richieste: await read($, richieste),
    modifiche: await read($, modifiche),
    sistema: await read($, sistema),
    avvio: await read($, avvio),
    perPorta: await read($, perPorta),
    cronologia: await read($, cronologia),
  }
}

// --- scritture -------------------------------------------------------------------------------------

export async function scegliVista($: Motore, v: Vista): Promise<void> {
  await update($, vista, () => v)
}

/** Apre la sezione, o la chiude se è già quella aperta. */
export async function alternaVista($: Motore, id: Exclude<Vista, 'nessuna'>): Promise<void> {
  await update($, vista, v => (v === id ? 'nessuna' : id))
}

export async function alternaChiusa($: Motore, id: string): Promise<void> {
  await update($, chiuse, l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]))
}

export async function salvaSistema($: Motore, s: Sistema): Promise<void> {
  await update($, sistema, () => s)
}

export async function salvaAvvio($: Motore, a: Avvio): Promise<void> {
  await update($, avvio, () => a)
}

export async function aggiungiModifiche($: Motore, aggiunte: number, rimosse: number): Promise<void> {
  await update($, modifiche, m => ({ aggiunte: m.aggiunte + aggiunte, rimosse: m.rimosse + rimosse }))
}

export async function azzera($: Motore): Promise<void> {
  await update($, cronologia, () => [])
  await update($, perPorta, () => ({}))
  await update($, richieste, () => [])
  await update($, modifiche, () => ({ aggiunte: 0, rimosse: 0 }))
  await update($, avvio, () => null)
}

export async function registraRiga($: Motore, riga: Omit<Riga, 'n'>): Promise<void> {
  await update($, cronologia, l => [...l, { ...riga, n: (l.at(-1)?.n ?? 0) + 1 }].slice(-MAX_RIGHE))
  if (!riga.agente) {
    await update($, perPorta, t => {
      const prec: Totale = t[riga.door] ?? { righe: 0, tokens: 0 }
      return { ...t, [riga.door]: { righe: prec.righe + 1, tokens: prec.tokens + riga.tokens } }
    })
  }
}

export async function registraRichiesta($: Motore, usage: TurnUsage, agente: string | undefined): Promise<void> {
  const contesto = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  const at = await $.clock.now()
  await update($, richieste, l => [
    ...l,
    {
      n: (l.at(-1)?.n ?? 0) + 1,
      at,
      model: usage.model,
      input: usage.input_tokens,
      cacheRead: usage.cache_read_input_tokens,
      cacheWrite: usage.cache_creation_input_tokens,
      output: usage.output_tokens,
      contesto,
      ...(agente ? { agente } : {}),
    },
  ].slice(-MAX_RICHIESTE))
}
