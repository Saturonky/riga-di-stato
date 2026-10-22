// La sezione «Ordine di caricamento»: system prompt, strumenti, primo messaggio, conversazione.
import { spazi, tagliaPercorso, tk, wc } from '../testo.ts'
import type { Azioni, DatiPannello } from './dati.ts'
import { M, type Elementi, type Kit } from './kit.tsx'

const somma = (l: { tokens: number }[]) => l.reduce((t, x) => t + x.tokens, 0)

export function ordine(ui: Elementi, k: Kit, d: DatiPannello, a: Azioni): unknown[] {
  const gruppo = (n: number, t: string, tot: string) => k.riga(`${n}  ${t}`, tot, { colore: 'text' })
  const voce = (sx: string, dx: string, dim = true) => k.riga(sx, dx, { rientro: M + 3, dim })
  return [
    ...systemPrompt(k, d, gruppo, voce),
    ...strumenti(ui, k, d, a, gruppo, voce),
    ...primoMessaggio(k, d, gruppo, voce),
    ...conversazione(k, d, gruppo, voce),
    k.vuota(), k.nota('stime: circa 4 caratteri per token'),
  ]
}

type Gruppo = (n: number, t: string, tot: string) => unknown
type Voce = (sx: string, dx: string, dim?: boolean) => unknown

function systemPrompt(k: Kit, d: DatiPannello, gruppo: Gruppo, voce: Voce): unknown[] {
  const s = d.sistema
  const out: unknown[] = [gruppo(1, 'System prompt', s ? `~${tk(somma(s.sezioni))}` : '')]
  if (!s) return [...out, k.nota(`${spazi(3)}compare alla prossima richiesta`)]
  s.sezioni.forEach((x, i) => {
    if (x.scope === 'session' && s.sezioni[i - 1]?.scope !== 'session') out.push(k.nota(`${spazi(3)}┄ da qui non in cache condivisa`))
    out.push(voce(x.id, tk(x.tokens)))
  })
  return out
}

function strumenti(ui: Elementi, k: Kit, d: DatiPannello, a: Azioni, gruppo: Gruppo, voce: Voce): unknown[] {
  const { Button } = ui
  const b = d.spaccato
  const mcpCaricati = b?.mcpTools.filter(t => t.isLoaded) ?? []
  const mcpDifferiti = b?.mcpTools.filter(t => !t.isLoaded) ?? []
  const def = b?.categories.find(c => /system tools/i.test(c.name))
  const tot = (def?.tokens ?? 0) + somma(mcpCaricati) + somma(b?.agents ?? []) + (b?.skills?.tokens ?? 0) + (b?.slashCommands?.tokens ?? 0)
  const out: unknown[] = [k.vuota(), gruppo(2, 'Strumenti', b ? `~${tk(tot)}` : '')]
  out.push(voce(`definizioni${d.sistema ? ` (${d.sistema.strumenti})` : ''}`, def ? tk(def.tokens) : ''))
  if (!b) return out
  const mcpChiuso = d.chiuse.includes('mcp')
  out.push(<Button key="sezione-mcp" plain onPress={a.alternaMcp}>{voce(`${mcpChiuso ? '▸' : '▾'} MCP caricati (${mcpCaricati.length})`, tk(somma(mcpCaricati)))}</Button>)
  if (!mcpChiuso) for (const t of mcpCaricati) out.push(k.riga(t.name.replace(/^mcp__/, ''), tk(t.tokens), { rientro: M + 5, dim: true }))
  out.push(voce(`MCP differiti (${mcpDifferiti.length})`, 'fuori'))
  if (b.agents.length) out.push(voce(`subagent (${b.agents.length})`, tk(somma(b.agents))))
  if (b.skills) out.push(voce(`skill (${b.skills.includedSkills}/${b.skills.totalSkills})`, tk(b.skills.tokens)))
  if (b.slashCommands) out.push(voce(`comandi (${b.slashCommands.includedCommands}/${b.slashCommands.totalCommands})`, tk(b.slashCommands.tokens)))
  return out
}

function primoMessaggio(k: Kit, d: DatiPannello, gruppo: Gruppo, voce: Voce): unknown[] {
  const a = d.avvio
  const b = d.spaccato
  const out: unknown[] = [k.vuota(), gruppo(3, 'Primo messaggio', a ? `~${tk(somma(a.blocchi))}` : b ? `~${tk(somma(b.memoryFiles))}` : '')]
  const file = (path: string, kind: string, t: number, figlio: boolean) => {
    const r = M + (figlio ? 7 : 5)
    const dx = `${kind} ${tk(t)}`
    return k.riga(`${figlio ? '↳ ' : ''}${tagliaPercorso(path, k.W - r - wc(dx) - 4)}`, dx, { rientro: r, dim: true })
  }
  if (a) {
    for (const x of a.blocchi) {
      out.push(voce(x.name, tk(x.tokens), false))
      if (x.name === 'claudeMd') for (const f of a.file) out.push(file(f.path, f.kind, f.tokens, !!f.parent))
    }
  } else if (b?.memoryFiles.length) {
    for (const f of b.memoryFiles) out.push(file(f.path, f.type, f.tokens, false))
  } else out.push(k.nota(`${spazi(3)}si ricompone dopo /clear o una compattazione`))
  return out
}

function conversazione(k: Kit, d: DatiPannello, gruppo: Gruppo, voce: Voce): unknown[] {
  const conv = Object.entries(d.perPorta).sort((x, y) => y[1].tokens - x[1].tokens)
  const out: unknown[] = [k.vuota(), gruppo(4, 'Conversazione', conv.length ? `~${tk(conv.reduce((t, [, x]) => t + x.tokens, 0))}` : '')]
  for (const [porta, t] of conv) out.push(voce(`${porta} (${t.righe})`, tk(t.tokens)))
  if (!conv.length) out.push(k.nota(`${spazi(3)}nessuna riga registrata`))
  return out
}
