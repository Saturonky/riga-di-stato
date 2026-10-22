// In alto un riepilogo arioso (pochi numeri, molto spazio), poi gli avvisi e il menu delle sezioni.
import { SEZIONI } from '../costanti.ts'
import { cacheHit } from '../stime.ts'
import { barra, conSegno, livello, spazi, taglia, tk } from '../testo.ts'
import type { Azioni, DatiPannello } from './dati.ts'
import { M, type Elementi, type Kit } from './kit.tsx'

export function riepilogo(ui: Elementi, k: Kit, d: DatiPannello): unknown[] {
  const { Text } = ui
  const principali = d.richieste.filter(r => !r.agente)
  const ultima = principali.at(-1)
  const prima = principali.at(-2)
  const pct = d.uso.context.percent ?? 0
  const tokens = d.uso.context.tokens ?? 0
  const { colore } = livello(pct)
  const b = d.spaccato
  const nb = Math.max(8, Math.min(40, k.Wc - 6))
  const manca = b?.isAutoCompactEnabled && b.autoCompactThreshold ? Math.max(0, b.autoCompactThreshold - tokens) : undefined
  const out: unknown[] = [
    k.vuota(), k.titolo('Contesto'),
    <Text>{spazi(M)}<Text color={colore}>{barra(pct, nb)}</Text><Text weight="bold" color={colore}>{`${pct}%`.padStart(5)}</Text></Text>,
    <Text dimColor>{spazi(M)}{k.unisci([`${tk(tokens)} di ${tk(d.uso.context.window)}`, manca !== undefined ? `compact tra ${tk(manca)}` : ''])}</Text>,
    k.vuota(), k.titolo('Ultima richiesta'),
  ]
  if (ultima) {
    const hit = cacheHit(ultima)
    const parti = [`cache ${hit}%`, prima ? conSegno(ultima.contesto - prima.contesto) : '', `out ${tk(ultima.output)}`]
    out.push(<Text>{spazi(M)}<Text color={hit >= 80 ? 'success' : hit >= 50 ? 'warning' : 'error'}>{k.unisci(parti)}</Text></Text>)
  } else out.push(k.nota('nessuna: arriva col prossimo prompt'))
  out.push(k.vuota(), k.titolo('Sessione'))
  out.push(<Text>{spazi(M)}{k.unisci([d.uso.cost ? `$${d.uso.cost.usd.toFixed(2)}` : '', `${principali.length} richieste`, `+${d.modifiche.aggiunte} −${d.modifiche.rimosse}`])}</Text>)
  if (d.allarmi.length) {
    out.push(k.vuota())
    for (const a of d.allarmi) out.push(<Text color="warning">{taglia(`${spazi(M)}${a.lungo}`, k.W)}</Text>)
  }
  return out
}

/** Il menu delle sezioni: due colonne se c'è posto, altrimenti una. */
export function menu(ui: Elementi, k: Kit, d: DatiPannello, a: Azioni, focus = true): unknown[] {
  const { Box, Text, Button } = ui
  const voci = SEZIONI.map((s, i) => ({ ...s, i, testo: `${d.aperta === s.id ? '▾' : '▸'} ${k.W >= 50 ? s.nome : s.breve}` }))
  const dueColonne = k.W >= 56
  const colW = Math.floor(k.Wc / 2)
  const bottone = (x: (typeof voci)[number], larghezza?: number) => (
    <Button key={`sezione-${x.id}`} plain hotkey={String(x.i + 1)} onPress={() => a.scegli(x.id)}>
      <Text weight={d.aperta === x.id ? 'bold' : 'regular'} color={d.aperta === x.id ? 'claude' : undefined}>
        {larghezza ? x.testo.padEnd(larghezza - 3) : x.testo}
      </Text>
    </Button>
  )
  const out: unknown[] = [k.vuota()]
  for (let i = 0; i < voci.length; i += dueColonne ? 2 : 1) {
    const sx = voci[i]
    const dx = dueColonne ? voci[i + 1] : undefined
    if (!sx) continue
    out.push(<Box flexDirection="row"><Text>{spazi(M)}</Text>{bottone(sx, dx ? colW : undefined)}{dx ? bottone(dx) : null}</Box>)
  }
  // Il focus è una richiesta, non un diritto: senza, i tasti tacciono, e la riga dice come fare.
  if (!focus) out.push(k.nota(k.W >= 50 ? 'clic qui per i tasti 1-4, o /contesto <sezione>' : 'clic qui per i tasti 1-4'))
  return out
}
