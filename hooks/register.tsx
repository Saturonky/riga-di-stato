// La riga di stato come Mod (al posto di una status line a script) e il pannello /contesto:
// che cosa entra nel contesto, in che ordine e quanto pesa. Solo osservazione: ogni hook passa
// avanti l'evento invariato e, se qualcosa va storto, si limita a non registrare.
//
// Disegno: la riga di stato si adatta alla larghezza del terminale togliendo prima i segmenti meno
// importanti (ogni segmento ha più forme, dalla più lunga alla più corta); il pannello è una colonna
// stretta, pensata per stare di fianco alla chat (dock) o, sotto i 110 colonne o fuori dal fullscreen,
// in un blocco basso sopra il prompt, e ogni sua riga sta nella larghezza che gli è data.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown, SessionUsage, TurnUsage } from 'claude-code'

import type { Avvio, Richiesta, Riga, Sistema, Totale, Vista } from '../types'

const PANNELLO = 'contesto'
const MAX_RIGHE = 400
const MAX_RICHIESTE = 200
/** Quanto chiede il pannello: largo di fianco alla chat, basso sopra il prompt. */
const DOCK_COLONNE = 46
const INLINE_RIGHE = 16
/** Oltre questa larghezza il contenuto non si allarga: resta una colonna leggibile. */
const MAX_LARGHEZZA = 72
/** Quando un dato diventa un allarme nella riga di stato. */
const SOGLIA_COMPACT = 0.15
const SOGLIA_LIMITE = 80
const SOGLIA_CACHE = 50

const sistema = atom({ plugin: 'riga-di-stato', key: 'sistema' } as const, null)
const avvio = atom({ plugin: 'riga-di-stato', key: 'avvio' } as const, null)
const cronologia = atom({ plugin: 'riga-di-stato', key: 'cronologia' } as const, [])
const perPorta = atom({ plugin: 'riga-di-stato', key: 'perPorta' } as const, {})
const richieste = atom({ plugin: 'riga-di-stato', key: 'richieste' } as const, [])
const modifiche = atom({ plugin: 'riga-di-stato', key: 'modifiche' } as const, { aggiunte: 0, rimosse: 0 })
const vista = atom({ plugin: 'riga-di-stato', key: 'vista' } as const, 'nessuna')
const chiuse = atom({ plugin: 'riga-di-stato', key: 'chiuse' } as const, ['mcp'])

type Motore = EngineInterface

// --- larghezza a schermo -------------------------------------------------------------------------

const LARGHI_BMP = new Set([
  0x231a, 0x231b, 0x23e9, 0x23ea, 0x23eb, 0x23ec, 0x23f0, 0x23f3, 0x25fd, 0x25fe, 0x2614, 0x2615,
  0x267f, 0x2693, 0x26a1, 0x26aa, 0x26ab, 0x26bd, 0x26be, 0x26c4, 0x26c5, 0x26ce, 0x26d4, 0x26ea,
  0x26f2, 0x26f3, 0x26f5, 0x26fa, 0x26fd, 0x2705, 0x270a, 0x270b, 0x2728, 0x274c, 0x274e, 0x2753,
  0x2754, 0x2755, 0x2757, 0x2795, 0x2796, 0x2797, 0x27b0, 0x27bf, 0x2b1b, 0x2b1c, 0x2b50, 0x2b55,
])

/** Celle occupate da un carattere: 0 per i modificatori, 2 per emoji e ideogrammi. */
function celle(cp: number): number {
  if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0x300 && cp <= 0x36f)) return 0
  if (LARGHI_BMP.has(cp) || (cp >= 0x2648 && cp <= 0x2653)) return 2
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3)) return 2
  if ((cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0x1f300 && cp <= 0x1faff)) return 2
  return 1
}

const wc = (s: string): number => {
  let n = 0
  for (const ch of s) n += celle(ch.codePointAt(0) ?? 0)
  return n
}

/** Taglia a `n` celle, con l'ellissi alla fine. */
function taglia(s: string, n: number): string {
  if (n <= 0) return ''
  if (wc(s) <= n) return s
  let out = ''
  let w = 0
  for (const ch of s) {
    const c = celle(ch.codePointAt(0) ?? 0)
    if (w + c > n - 1) break
    out += ch
    w += c
  }
  return `${out}…`
}

/** Taglia un percorso dal centro: tiene la radice e il nome del file. */
function tagliaPercorso(p: string, n: number): string {
  const s = p.replace(/\\/g, '/').replace(/^[A-Za-z]:\/Users\/[^/]+/, '~')
  if (wc(s) <= n) return s
  const pezzi = s.split('/')
  const nome = pezzi.pop() ?? s
  if (wc(nome) + 2 >= n) return taglia(nome, n)
  const testa = taglia(pezzi.join('/'), n - wc(nome) - 2).replace(/…$/, '')
  return `${testa}…/${nome}`
}

const spazi = (n: number): string => ' '.repeat(Math.max(0, n))
const compatta = (s: string): string => s.replace(/\s+/g, ' ').trim()

// --- stime e formati ---------------------------------------------------------------------------

/** Token stimati da una lunghezza in caratteri (circa 4 per token). */
const daCaratteri = (n: number): number => Math.ceil(n / 4)

/** Caratteri di un contenuto API, blocco per blocco; immagini e documenti a forfait. */
function caratteri(contenuto: unknown): number {
  if (typeof contenuto === 'string') return contenuto.length
  if (!Array.isArray(contenuto)) return 0
  let n = 0
  for (const b of contenuto as Record<string, unknown>[]) {
    switch (b?.type) {
      case 'text': n += String(b.text ?? '').length; break
      case 'thinking': n += String(b.thinking ?? '').length; break
      case 'tool_use': n += JSON.stringify(b.input ?? {}).length + String(b.name ?? '').length; break
      case 'tool_result': n += caratteri(b.content); break
      case 'image': case 'document': n += 6400; break
      default: n += JSON.stringify(b).length
    }
  }
  return n
}

function testoIniziale(contenuto: unknown): string {
  if (typeof contenuto === 'string') return contenuto
  if (!Array.isArray(contenuto)) return ''
  for (const b of contenuto as Record<string, unknown>[]) {
    if (b?.type === 'text') return String(b.text ?? '')
    if (b?.type === 'tool_result') return testoIniziale(b.content)
    if (b?.type === 'tool_use') return `${String(b.name ?? '')} ${JSON.stringify(b.input ?? {})}`
  }
  return ''
}

/** 1234 -> 1.2k, 123456 -> 123k, 1000000 -> 1M. */
function tk(n: number | undefined): string {
  if (n === undefined) return '?'
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(a % 1_000_000 === 0 ? 0 : 2)}M`
  if (a >= 100_000) return `${Math.round(n / 1000)}k`
  if (a >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

const conSegno = (n: number): string => `${n >= 0 ? '+' : '−'}${tk(Math.abs(n))}`

const ora = (ms: number): string => {
  const d = new Date(ms)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(x => String(x).padStart(2, '0')).join(':')
}

const quando = (iso: string): string => {
  const d = new Date(iso)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return d.toDateString() === new Date().toDateString() ? hm : `${['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][d.getDay()]} ${hm}`
}

const livello = (pct: number): { emoji: string; colore: string } =>
  pct < 20 ? { emoji: '🟢', colore: 'success' }
  : pct < 70 ? { emoji: '⚡', colore: 'warning' }
  : pct < 90 ? { emoji: '🔥', colore: 'warning' }
  : { emoji: '🚨', colore: 'error' }

const OTTAVI = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

/** Barra a ottavi di cella: `n` celle, piena per `pct` su 100. */
function barra(pct: number, n: number): string {
  const ottavi = Math.round((Math.max(0, Math.min(100, pct)) * n * 8) / 100)
  const pieni = Math.floor(ottavi / 8)
  const resto = OTTAVI[ottavi % 8] ?? ''
  return '█'.repeat(pieni) + resto + '·'.repeat(Math.max(0, n - pieni - (resto ? 1 : 0)))
}

const nomeLimite = (kind: string): string =>
  kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : kind === 'spend_limit' ? 'spesa' : kind

function origineDi(o: unknown): string {
  const r = (o ?? {}) as Record<string, unknown>
  const dettaglio = r.tool ?? r.name ?? r.event ?? ''
  return dettaglio ? `${String(r.kind)}:${String(dettaglio)}` : String(r.kind ?? '?')
}

/** Che cosa è una riga, in poche parole: lo strumento, il tipo d'allegato, chi l'ha mandata. */
const etichetta = (r: Riga): string => {
  const chi = r.origine.replace(/^(tool|model|plugin|hook):/, '')
  return r.tipo === r.door || r.tipo === 'user' || r.tipo === 'assistant' ? chi : `${r.tipo} · ${chi}`
}

const righeDi = (s: string | undefined): number => (s ? s.split('\n').length : 0)

/** Cache hit della richiesta: quota dell'input servita dalla cache. */
const cacheHit = (r: Richiesta): number => (r.contesto > 0 ? Math.round((r.cacheRead * 100) / r.contesto) : 0)

const nomeModello = (m: string): string => m.replace(/^claude-/, '').replace(/\s*[([].*$/, '').trim()

// --- dati che non stanno nello stato (si rifanno a ogni ricarica) --------------------------------

let ramo: string | undefined
let cartella = ''
let colonne = 120
let spaccato: { at: number; valore: SessionContextBreakdown | undefined } = { at: 0, valore: undefined }
let pianificato = false

async function leggiSpaccato($: Motore, eta = 5000): Promise<SessionContextBreakdown | undefined> {
  const adesso = await $.clock.now()
  if (adesso - spaccato.at < eta) return spaccato.valore
  try {
    const u = await $.session.usage({ breakdown: 'summary' })
    spaccato = { at: adesso, valore: u.context.breakdown }
  } catch {
    spaccato = { at: adesso, valore: spaccato.valore }
  }
  return spaccato.valore
}

async function leggiRamo($: Motore): Promise<void> {
  try {
    cartella = await $.session.cwd()
    const r = await $.process.run(['git', '-C', cartella, '--no-optional-locks', 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5000 })
    ramo = r.exitCode === 0 ? r.stdout.trim() || undefined : undefined
  } catch {
    ramo = undefined
  }
}

/** Tiene la larghezza del terminale; se cambia, ricompone la riga (fuori dal disegno). */
function notaColonne($: Motore, n: number | undefined): void {
  if (!n || n === colonne) return
  colonne = n
  pianifica($)
}

// --- la riga di stato ----------------------------------------------------------------------------

/** Un segmento: priorità (più alta, più resiste) e forme dalla più lunga alla più corta. */
type Segmento = { pri: number; forme: string[] }

const SEP = '    '

/** Sceglie per ogni segmento la forma più lunga che fa stare la riga in `budget` celle. */
function adatta(segmenti: Segmento[], budget: number): string {
  const livelli = segmenti.map(() => 0)
  const testo = () => segmenti.map((s, i) => s.forme[livelli[i] ?? 0] ?? '').filter(Boolean).join(SEP)
  const ordine = segmenti.map((s, i) => ({ s, i })).sort((a, b) => a.s.pri - b.s.pri)
  while (wc(testo()) > budget) {
    const c = ordine.find(({ s, i }) => (livelli[i] ?? 0) < s.forme.length - 1)
    if (!c) break
    livelli[c.i] = (livelli[c.i] ?? 0) + 1
  }
  return taglia(testo(), budget)
}

/** Gli allarmi: compaiono nella riga solo quando qualcosa va guardato. */
type Allarme = { breve: string; lungo: string }

async function allarmi($: Motore, u: SessionUsage): Promise<Allarme[]> {
  const out: Allarme[] = []
  const tokens = u.context.tokens ?? 0
  const b = await leggiSpaccato($, 20_000)
  if (b?.isAutoCompactEnabled && b.autoCompactThreshold) {
    const manca = Math.max(0, b.autoCompactThreshold - tokens)
    if (manca < b.autoCompactThreshold * SOGLIA_COMPACT) out.push({ lungo: `⚠ compact tra ${tk(manca)}`, breve: `⚠ ${tk(manca)}` })
  }
  for (const l of u.rateLimits) {
    if (l.percentUsed >= SOGLIA_LIMITE) {
      out.push({ lungo: `⚠ limite ${nomeLimite(l.kind)} ${Math.round(l.percentUsed)}%`, breve: `⚠ ${nomeLimite(l.kind)} ${Math.round(l.percentUsed)}%` })
    }
  }
  const ultima = (await read($, richieste)).filter(r => !r.agente).at(-1)
  if (ultima && ultima.contesto >= 50_000 && cacheHit(ultima) < SOGLIA_CACHE) {
    out.push({ lungo: `⚠ cache ${cacheHit(ultima)}%`, breve: `⚠ c${cacheHit(ultima)}%` })
  }
  return out
}

async function componi($: Motore): Promise<string> {
  const u: SessionUsage = await $.session.usage()
  const { tokens = 0, window: finestra, percent } = u.context
  const pct = percent ?? 0
  const { emoji } = livello(pct)
  const s: Segmento[] = []

  const dir = cartella.split(/[\\/]/).filter(Boolean).pop() ?? '?'
  s.push({
    pri: 3,
    forme: ramo
      ? [`${dir}  ⎇ ${ramo}`, `${taglia(dir, 16)}  ⎇ ${taglia(ramo, 14)}`, taglia(dir, 14), '']
      : [dir, taglia(dir, 14), ''],
  })
  s.push({ pri: 10, forme: [`${emoji} ${pct}%  ${tk(tokens)} / ${tk(finestra)}`, `${emoji} ${pct}%`] })
  for (const a of await allarmi($, u)) s.push({ pri: 9, forme: [a.lungo, a.breve] })
  if (u.cost) s.push({ pri: 6, forme: [`$${u.cost.usd.toFixed(2)}`, ''] })
  s.push({ pri: 4, forme: [nomeModello(await $.session.model()), ''] })

  return adatta(s, Math.max(20, colonne - 4))
}

async function aggiorna($: Motore): Promise<void> {
  try {
    $.ui.status(await componi($))
  } catch (err) {
    $.ui.status(`riga-di-stato: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Raggruppa le richieste di aggiornamento arrivate a raffica. */
function pianifica($: Motore): void {
  if (pianificato) return
  pianificato = true
  $.clock.after(400, () => {
    pianificato = false
    void aggiorna($)
  })
}

// --- registrazione -------------------------------------------------------------------------------

async function azzera($: Motore): Promise<void> {
  await update($, cronologia, () => [])
  await update($, perPorta, () => ({}))
  await update($, richieste, () => [])
  await update($, modifiche, () => ({ aggiunte: 0, rimosse: 0 }))
  await update($, avvio, () => null)
}

async function registraRiga($: Motore, riga: Omit<Riga, 'n'>): Promise<void> {
  await update($, cronologia, l => [...l, { ...riga, n: (l.at(-1)?.n ?? 0) + 1 }].slice(-MAX_RIGHE))
  if (!riga.agente) {
    await update($, perPorta, t => {
      const prec: Totale = t[riga.door] ?? { righe: 0, tokens: 0 }
      return { ...t, [riga.door]: { righe: prec.righe + 1, tokens: prec.tokens + riga.tokens } }
    })
  }
}

async function registraRichiesta($: Motore, usage: TurnUsage, agente: string | undefined): Promise<void> {
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

function riassunto(u: SessionUsage, b: SessionContextBreakdown | undefined): string {
  const c = u.context
  const righe = [`Contesto ${c.percent ?? 0}% · ${tk(c.tokens ?? 0)}/${tk(c.window)} token`]
  if (b) {
    for (const cat of b.categories.filter(x => x.tokens > 0)) righe.push(`- ${cat.name}: ${tk(cat.tokens)}`)
    if (b.autoCompactThreshold) righe.push(`Autocompact a ${tk(b.autoCompactThreshold)}`)
  }
  return righe.join('\n')
}

const SEZIONI: { id: Exclude<Vista, 'nessuna'>; nome: string; breve: string }[] = [
  { id: 'categorie', nome: 'Categorie', breve: 'Categorie' },
  { id: 'ordine', nome: 'Ordine di caricamento', breve: 'Ordine' },
  { id: 'cronologia', nome: 'Cronologia', breve: 'Cronologia' },
  { id: 'limiti', nome: 'Limiti', breve: 'Limiti' },
]

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({
      name: 'contesto',
      description: 'Apre o chiude il pannello del contesto: riepilogo, categorie, ordine di caricamento, cronologia, limiti',
      argumentHint: '[categorie|ordine|cronologia|limiti]',
    })
    await leggiRamo($)
    await aggiorna($)
    return r
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await azzera($)
    return next(e)
  })

  on('command.run', { command: 'contesto' }, async ($, e) => {
    notaColonne($, e.presentation?.columns)
    const richiesta = String(e.args ?? '').trim() as Vista
    const scelta = SEZIONI.some(x => x.id === richiesta)
    if (scelta) await update($, vista, () => richiesta)
    const aperto = (await $.ui.panes()).some(p => p.id === PANNELLO)
    if (aperto && !scelta) {
      await $.ui.close({ id: PANNELLO })
      return { text: 'Pannello del contesto chiuso.' }
    }
    const r = await $.ui.open({ id: PANNELLO, title: 'Contesto', rows: INLINE_RIGHE, columns: DOCK_COLONNE, closeOnEscape: true })
    if (r.isPlaced) return { text: 'Pannello del contesto aperto.' }
    return { text: riassunto(await $.session.usage(), await leggiSpaccato($, 0)) }
  })

  // La larghezza del terminale, letta dal disegno della banda sopra il prompt: non disegna nulla.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface === 'terminal') notaColonne($, e.viewport?.columns)
    return next(e)
  })

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
        await update($, sistema, () => s)
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
        file: file.map(f => ({
          path: f.path,
          kind: f.kind,
          tokens: daCaratteri(f.content.length),
          ...(f.parent ? { parent: f.parent } : {}),
        })),
        at: await $.clock.now(),
      }
      await update($, avvio, () => a)
    } catch { /* solo osservazione */ }
    return r
  })

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

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) {
      await leggiRamo($)
      spaccato.at = 0
      pianifica($)
    }
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && r.messages) {
      spaccato.at = 0
      pianifica($)
    }
    return r
  }).catch(($, e, next) => next(e))

  // Righe aggiunte e rimosse (stima dagli input di Edit e Write andati a buon fine).
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await update($, modifiche, m => ({ aggiunte: m.aggiunte + righeDi(e.new_string), rimosse: m.rimosse + righeDi(e.old_string) }))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await update($, modifiche, m => ({ ...m, aggiunte: m.aggiunte + righeDi(e.content) }))
    }
    return ran
  }).catch(($, e, next) => next(e))

  // --- il pannello -------------------------------------------------------------------------------
  // In alto un riepilogo arioso (pochi numeri, molto spazio); sotto, un menu di quattro sezioni di
  // dettaglio, una aperta alla volta, ciascuna in righe a due colonne che stanno nella larghezza data.

  on('ui.render', { component: 'Pane', requestId: PANNELLO }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const W = Math.min(MAX_LARGHEZZA, Math.max(24, e.props.bodyColumns))
    const M = 2
    const Wc = W - M
    if (e.surface === 'terminal' && e.props.placement === 'inline') notaColonne($, e.viewport?.columns)
    const aperta = await read($, vista)
    const sezioniChiuse = await read($, chiuse)

    const vuota = () => <Text> </Text>
    const titolo = (t: string) => <Text weight="bold" color="claude">{taglia(`${spazi(M)}${t.toUpperCase()}`, W)}</Text>
    const nota = (t: string) => <Text dimColor italic>{taglia(`${spazi(M)}${t}`, W)}</Text>

    /** Le parti che stanno in una riga, unite da un punto spaziato; quelle che non stanno restano fuori. */
    const unisci = (parti: string[], n = Wc): string => {
      let out = ''
      for (const p of parti.filter(Boolean)) {
        const prova = out ? `${out}  ·  ${p}` : p
        if (wc(prova) > n) break
        out = prova
      }
      return out || taglia(parti[0] ?? '', n)
    }

    /** Etichetta a sinistra, valore allineato a destra, entro W. */
    const riga = (
      sx: string,
      dx: string,
      o: { rientro?: number; colore?: string; dim?: boolean; dimDx?: boolean; coloreDx?: string; segno?: { testo: string; colore: string } } = {},
    ) => {
      const r = (o.rientro ?? M) + (o.segno ? wc(o.segno.testo) : 0)
      const dxT = taglia(dx, Math.max(0, W - r - 4))
      const sxT = taglia(sx, Math.max(1, W - r - wc(dxT) - 2))
      return (
        <Text dimColor={o.dim}>
          {spazi(o.rientro ?? M)}
          {o.segno ? <Text color={o.segno.colore}>{o.segno.testo}</Text> : ''}
          <Text color={o.colore} dimColor={o.dim}>{sxT}</Text>
          {spazi(W - r - wc(sxT) - wc(dxT))}
          <Text color={o.coloreDx} dimColor={o.dimDx ?? o.dim}>{dxT}</Text>
        </Text>
      )
    }

    const corpo: unknown[] = []
    const u = await $.session.usage()
    const b = await leggiSpaccato($)
    const lista = await read($, richieste)
    const principali = lista.filter(r => !r.agente)
    const ultima = principali.at(-1)
    const prima = principali.at(-2)
    const pct = u.context.percent ?? 0
    const tokens = u.context.tokens ?? 0
    const { colore } = livello(pct)
    const m = await read($, modifiche)

    // Riepilogo
    corpo.push(vuota(), titolo('Contesto'))
    const nb = Math.max(8, Math.min(40, Wc - 6))
    corpo.push(
      <Text>
        {spazi(M)}
        <Text color={colore}>{barra(pct, nb)}</Text>
        <Text weight="bold" color={colore}>{`${pct}%`.padStart(5)}</Text>
      </Text>,
    )
    const manca = b?.isAutoCompactEnabled && b.autoCompactThreshold ? Math.max(0, b.autoCompactThreshold - tokens) : undefined
    corpo.push(<Text dimColor>{spazi(M)}{unisci([`${tk(tokens)} di ${tk(u.context.window)}`, manca !== undefined ? `compact tra ${tk(manca)}` : ''])}</Text>)

    corpo.push(vuota(), titolo('Ultima richiesta'))
    if (ultima) {
      const hit = cacheHit(ultima)
      const parti = [`cache ${hit}%`, prima ? conSegno(ultima.contesto - prima.contesto) : '', `out ${tk(ultima.output)}`]
      corpo.push(
        <Text>
          {spazi(M)}
          <Text color={hit >= 80 ? 'success' : hit >= 50 ? 'warning' : 'error'}>{unisci(parti)}</Text>
        </Text>,
      )
    } else corpo.push(nota('nessuna ancora'))

    corpo.push(vuota(), titolo('Sessione'))
    corpo.push(
      <Text>
        {spazi(M)}
        {unisci([u.cost ? `$${u.cost.usd.toFixed(2)}` : '', `${principali.length} richieste`, `+${m.aggiunte} −${m.rimosse}`])}
      </Text>,
    )

    const avvisi = await allarmi($, u)
    if (avvisi.length) {
      corpo.push(vuota())
      for (const a of avvisi) corpo.push(<Text color="warning">{taglia(`${spazi(M)}${a.lungo}`, W)}</Text>)
    }

    // Menu delle sezioni: due colonne se c'è posto, altrimenti una.
    corpo.push(vuota())
    const voci = SEZIONI.map((s, i) => {
      const nome = W >= 50 ? s.nome : s.breve
      const segno = aperta === s.id ? '▾' : '▸'
      return { ...s, i, testo: `${segno} ${nome}` }
    })
    const dueColonne = W >= 56
    const colW = Math.floor(Wc / 2)
    const bottone = (x: (typeof voci)[number], larghezza?: number) => (
      <Button
        key={`sezione-${x.id}`}
        plain
        hotkey={String(x.i + 1)}
        onPress={() => update($, vista, v => (v === x.id ? 'nessuna' : x.id))}
      >
        <Text weight={aperta === x.id ? 'bold' : 'regular'} color={aperta === x.id ? 'claude' : undefined}>
          {larghezza ? x.testo.padEnd(larghezza - 3) : x.testo}
        </Text>
      </Button>
    )
    for (let i = 0; i < voci.length; i += dueColonne ? 2 : 1) {
      const a = voci[i]
      const c = dueColonne ? voci[i + 1] : undefined
      if (!a) continue
      corpo.push(
        <Box flexDirection="row">
          <Text>{spazi(M)}</Text>
          {bottone(a, c ? colW : undefined)}
          {c ? bottone(c) : null}
        </Box>,
      )
    }

    // La sezione aperta
    if (aperta !== 'nessuna') corpo.push(vuota())

    if (aperta === 'categorie') {
      const usate = b?.categories.filter(c => c.tokens > 0 && c.kind !== 'free') ?? []
      const totale = b?.rawMaxTokens ?? u.context.window
      if (!b) corpo.push(nota('in misura…'))
      for (const c of usate) {
        corpo.push(
          riga(c.name, `${tk(c.tokens)}   ${((c.tokens * 100) / totale).toFixed(1)}%`, {
            segno: { testo: c.kind === 'buffer' ? '▒ ' : '■ ', colore: c.color },
            dim: c.kind !== 'used',
          }),
        )
      }
      const libero = b?.categories.find(c => c.kind === 'free')
      if (libero) corpo.push(riga('Spazio libero', tk(libero.tokens), { segno: { testo: '░ ', colore: 'inactive' }, dim: true }))
    }

    if (aperta === 'ordine') {
      const s = await read($, sistema)
      const a = await read($, avvio)
      const porte = await read($, perPorta)
      const somma = (l: { tokens: number }[]) => l.reduce((t, x) => t + x.tokens, 0)
      const gruppo = (n: number, t: string, tot: string) => riga(`${n}  ${t}`, tot, { colore: 'text' })
      const voce = (sx: string, dx: string, dim = true) => riga(sx, dx, { rientro: M + 3, dim })

      corpo.push(gruppo(1, 'System prompt', s ? `~${tk(somma(s.sezioni))}` : ''))
      if (s) {
        s.sezioni.forEach((x, i) => {
          if (x.scope === 'session' && s.sezioni[i - 1]?.scope !== 'session') corpo.push(nota(`${spazi(3)}┄ da qui non in cache condivisa`))
          corpo.push(voce(x.id, tk(x.tokens)))
        })
      } else corpo.push(nota(`${spazi(3)}compare alla prossima richiesta`))

      const mcpCaricati = b?.mcpTools.filter(t => t.isLoaded) ?? []
      const mcpDifferiti = b?.mcpTools.filter(t => !t.isLoaded) ?? []
      const strumenti = b?.categories.find(c => /system tools/i.test(c.name))
      const totStrumenti = (strumenti?.tokens ?? 0) + somma(mcpCaricati) + somma(b?.agents ?? []) + (b?.skills?.tokens ?? 0) + (b?.slashCommands?.tokens ?? 0)
      corpo.push(vuota(), gruppo(2, 'Strumenti', b ? `~${tk(totStrumenti)}` : ''))
      corpo.push(voce(`definizioni${s ? ` (${s.strumenti})` : ''}`, strumenti ? tk(strumenti.tokens) : ''))
      if (b) {
        const mcpChiuso = sezioniChiuse.includes('mcp')
        corpo.push(
          <Button key="sezione-mcp" plain onPress={() => update($, chiuse, l => (l.includes('mcp') ? l.filter(x => x !== 'mcp') : [...l, 'mcp']))}>
            {voce(`${mcpChiuso ? '▸' : '▾'} MCP caricati (${mcpCaricati.length})`, tk(somma(mcpCaricati)))}
          </Button>,
        )
        if (!mcpChiuso) for (const t of mcpCaricati) corpo.push(riga(t.name.replace(/^mcp__/, ''), tk(t.tokens), { rientro: M + 5, dim: true }))
        corpo.push(voce(`MCP differiti (${mcpDifferiti.length})`, 'fuori'))
        if (b.agents.length) corpo.push(voce(`subagent (${b.agents.length})`, tk(somma(b.agents))))
        if (b.skills) corpo.push(voce(`skill (${b.skills.includedSkills}/${b.skills.totalSkills})`, tk(b.skills.tokens)))
        if (b.slashCommands) corpo.push(voce(`comandi (${b.slashCommands.includedCommands}/${b.slashCommands.totalCommands})`, tk(b.slashCommands.tokens)))
      }

      corpo.push(vuota(), gruppo(3, 'Primo messaggio', a ? `~${tk(somma(a.blocchi))}` : b ? `~${tk(somma(b.memoryFiles))}` : ''))
      const file = (path: string, kind: string, t: number, figlio: boolean) => {
        const r = M + (figlio ? 7 : 5)
        const dx = `${kind} ${tk(t)}`
        return riga(`${figlio ? '↳ ' : ''}${tagliaPercorso(path, W - r - wc(dx) - 4)}`, dx, { rientro: r, dim: true })
      }
      if (a) {
        for (const x of a.blocchi) {
          corpo.push(voce(x.name, tk(x.tokens), false))
          if (x.name === 'claudeMd') for (const f of a.file) corpo.push(file(f.path, f.kind, f.tokens, !!f.parent))
        }
      } else if (b?.memoryFiles.length) {
        for (const f of b.memoryFiles) corpo.push(file(f.path, f.type, f.tokens, false))
      } else corpo.push(nota(`${spazi(3)}si ricompone dopo /clear o una compattazione`))

      const conv = Object.entries(porte).sort((x, y) => y[1].tokens - x[1].tokens)
      corpo.push(vuota(), gruppo(4, 'Conversazione', conv.length ? `~${tk(conv.reduce((t, [, x]) => t + x.tokens, 0))}` : ''))
      for (const [porta, t] of conv) corpo.push(voce(`${porta} (${t.righe})`, tk(t.tokens)))
      if (!conv.length) corpo.push(nota(`${spazi(3)}nessuna riga registrata`))
      corpo.push(vuota(), nota('stime: circa 4 caratteri per token'))
    }

    if (aperta === 'cronologia') {
      const righe = await read($, cronologia)
      const pesanti = righe.filter(r => !r.agente).sort((x, y) => y.tokens - x.tokens).slice(0, 5)
      corpo.push(nota('più pesanti'))
      for (const r of pesanti) corpo.push(riga(etichetta(r), tk(r.tokens), { coloreDx: r.tokens >= 10_000 ? 'warning' : undefined }))
      if (!pesanti.length) corpo.push(nota('nessuna riga ancora'))

      type Voce = { at: number; nodo: unknown }
      const recenti: Voce[] = righe.slice(-30).map(r => ({
        at: r.at,
        nodo: riga(`${ora(r.at).slice(0, 5)}  ${r.agente ? 'sub · ' : ''}${etichetta(r)}`, tk(r.tokens), {
          dim: !!r.agente,
          coloreDx: r.tokens >= 10_000 ? 'warning' : undefined,
        }),
      }))
      for (const q of lista.slice(-15)) {
        const i = principali.indexOf(q)
        const p = i > 0 ? principali[i - 1] : undefined
        recenti.push({
          at: q.at,
          nodo: riga(`${ora(q.at).slice(0, 5)}  ⇄ ${q.agente ? 'subagent' : 'richiesta'}`, `${tk(q.contesto)}${p ? `  ${conSegno(q.contesto - p.contesto)}` : ''}`, {
            colore: q.agente ? 'inactive' : 'suggestion',
            coloreDx: q.agente ? 'inactive' : 'suggestion',
          }),
        })
      }
      recenti.sort((x, y) => y.at - x.at)
      corpo.push(vuota(), nota('recenti'))
      for (const x of recenti) corpo.push(x.nodo)
      if (!recenti.length) corpo.push(nota('le righe compaiono man mano che entrano'))
    }

    if (aperta === 'limiti') {
      if (!u.rateLimits.length) corpo.push(nota('nessun limite riportato'))
      for (const l of u.rateLimits) {
        const nbl = Math.max(6, Math.min(30, Wc - 12))
        const c = l.percentUsed >= SOGLIA_LIMITE ? 'error' : l.percentUsed >= 50 ? 'warning' : 'success'
        corpo.push(
          <Text>
            {spazi(M)}
            {nomeLimite(l.kind).padEnd(6)}
            <Text color={c}>{barra(l.percentUsed, nbl)}</Text>
            <Text weight="bold" color={c}>{`${Math.round(l.percentUsed)}%`.padStart(5)}</Text>
          </Text>,
        )
        if (l.resetsAt) corpo.push(nota(`${spazi(6)}riparte ${quando(l.resetsAt)}`))
        corpo.push(vuota())
      }
    }

    return <Box flexDirection="column">{corpo as never[]}</Box>
  })
}
