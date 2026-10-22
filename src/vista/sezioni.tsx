// Le sezioni di dettaglio brevi: categorie, cronologia, limiti. Una aperta alla volta.
import { SOGLIA_LIMITE } from '../riga.ts'
import { etichetta } from '../stime.ts'
import { barra, conSegno, nomeLimite, ora, quando, spazi, tk } from '../testo.ts'
import type { DatiPannello } from './dati.ts'
import { M, type Elementi, type Kit } from './kit.tsx'

export function categorie(_ui: Elementi, k: Kit, d: DatiPannello): unknown[] {
  const b = d.spaccato
  const usate = b?.categories.filter(c => c.tokens > 0 && c.kind !== 'free') ?? []
  const totale = b?.rawMaxTokens ?? d.uso.context.window
  const out: unknown[] = b ? [] : [k.nota('in misura…')]
  for (const c of usate) {
    out.push(k.riga(c.name, `${tk(c.tokens)}   ${((c.tokens * 100) / totale).toFixed(1)}%`, {
      segno: { testo: c.kind === 'buffer' ? '▒ ' : '■ ', colore: c.color },
      dim: c.kind !== 'used',
    }))
  }
  const libero = b?.categories.find(c => c.kind === 'free')
  if (libero) out.push(k.riga('Spazio libero', tk(libero.tokens), { segno: { testo: '░ ', colore: 'inactive' }, dim: true }))
  return out
}

export function cronologia(_ui: Elementi, k: Kit, d: DatiPannello): unknown[] {
  const righe = d.cronologia
  const principali = d.richieste.filter(r => !r.agente)
  const pesanti = righe.filter(r => !r.agente).sort((x, y) => y.tokens - x.tokens).slice(0, 5)
  const out: unknown[] = [k.nota('più pesanti')]
  for (const r of pesanti) out.push(k.riga(etichetta(r), tk(r.tokens), { coloreDx: r.tokens >= 10_000 ? 'warning' : undefined }))
  if (!pesanti.length) out.push(k.nota('nessuna riga ancora'))

  type Voce = { at: number; nodo: unknown }
  const recenti: Voce[] = righe.slice(-30).map(r => ({
    at: r.at,
    nodo: k.riga(`${ora(r.at).slice(0, 5)}  ${r.agente ? 'sub · ' : ''}${etichetta(r)}`, tk(r.tokens), {
      dim: !!r.agente,
      coloreDx: r.tokens >= 10_000 ? 'warning' : undefined,
    }),
  }))
  for (const q of d.richieste.slice(-15)) {
    const i = principali.indexOf(q)
    const p = i > 0 ? principali[i - 1] : undefined
    recenti.push({
      at: q.at,
      nodo: k.riga(`${ora(q.at).slice(0, 5)}  ⇄ ${q.agente ? 'subagent' : 'richiesta'}`, `${tk(q.contesto)}${p ? `  ${conSegno(q.contesto - p.contesto)}` : ''}`, {
        colore: q.agente ? 'inactive' : 'suggestion',
        coloreDx: q.agente ? 'inactive' : 'suggestion',
      }),
    })
  }
  recenti.sort((x, y) => y.at - x.at)
  out.push(k.vuota(), k.nota('recenti'))
  for (const x of recenti) out.push(x.nodo)
  if (!recenti.length) out.push(k.nota('le righe compaiono man mano che entrano'))
  return out
}

export function limiti(ui: Elementi, k: Kit, d: DatiPannello): unknown[] {
  const { Text } = ui
  const out: unknown[] = d.uso.rateLimits.length ? [] : [k.nota('nessun limite riportato')]
  for (const l of d.uso.rateLimits) {
    const nbl = Math.max(6, Math.min(30, k.Wc - 12))
    const c = l.percentUsed >= SOGLIA_LIMITE ? 'error' : l.percentUsed >= 50 ? 'warning' : 'success'
    out.push(
      <Text>
        {spazi(M)}
        {nomeLimite(l.kind).padEnd(6)}
        <Text color={c}>{barra(l.percentUsed, nbl)}</Text>
        <Text weight="bold" color={c}>{`${Math.round(l.percentUsed)}%`.padStart(5)}</Text>
      </Text>,
    )
    if (l.resetsAt) out.push(k.nota(`${spazi(6)}riparte ${quando(l.resetsAt)}`))
    out.push(k.vuota())
  }
  return out
}
