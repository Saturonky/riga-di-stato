/** Una sezione del system prompt, nell'ordine in cui viene inviata. */
export type Sezione = { id: string; scope: 'shared' | 'session'; tokens: number }

/** Il system prompt dell'ultima composizione osservata. */
export type Sistema = { model: string; strumenti: number; sezioni: Sezione[]; at: number }

/** Un blocco di contesto del primo messaggio (claudeMd, userEmail, currentDate...). */
export type Blocco = { name: string; tokens: number }

/** Un file di istruzioni dietro claudeMd, nell'ordine in cui viene reso. */
export type FileIstruzioni = { path: string; kind: string; parent?: string; tokens: number }

export type Avvio = { blocchi: Blocco[]; file: FileIstruzioni[]; at: number }

/** Una riga entrata nella conversazione (session.append), con la stima dei token. */
export type Riga = {
  n: number
  at: number
  door: string
  tipo: string
  origine: string
  tokens: number
  anteprima: string
  agente?: string
}

/** Una richiesta all'API (turn.step) con l'uso che ha riportato. */
export type Richiesta = {
  n: number
  at: number
  model: string
  input: number
  cacheRead: number
  cacheWrite: number
  output: number
  /** input + cacheRead + cacheWrite: la dimensione del contesto inviato. */
  contesto: number
  agente?: string
}

export type Totale = { righe: number; tokens: number }

/** La sezione aperta sotto il riepilogo del pannello; `nessuna` mostra il solo riepilogo. */
export type Vista = 'nessuna' | 'categorie' | 'ordine' | 'cronologia' | 'limiti'

declare module 'claude-code' {
  interface PluginState {
    'riga-di-stato': {
      sistema: Sistema | null
      avvio: Avvio | null
      cronologia: Riga[]
      perPorta: Record<string, Totale>
      richieste: Richiesta[]
      modifiche: { aggiunte: number; rimosse: number }
      vista: Vista
      /** Le sezioni del pannello che la persona ha chiuso. */
      chiuse: string[]
    }
  }
}
