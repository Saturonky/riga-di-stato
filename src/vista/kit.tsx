// I mattoni del pannello: righe che stanno sempre nella larghezza data. Ricevono gli elementi
// (da `$.ui.resolve(e)`), mai `$`, così si provano con elementi finti a ogni larghezza.
import { spazi, taglia, wc } from '../testo.ts'

type Costruttore = (props: any) => any
export type Elementi = { Box: Costruttore; Text: Costruttore; Button: Costruttore }

/** Margine sinistro del pannello. */
export const M = 2

export type OpzRiga = { rientro?: number; colore?: string; dim?: boolean; dimDx?: boolean; coloreDx?: string; segno?: { testo: string; colore: string } }

export function kit(ui: Elementi, W: number) {
  const { Text } = ui
  const Wc = W - M
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
  const riga = (sx: string, dx: string, o: OpzRiga = {}) => {
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

  return { W, Wc, vuota, titolo, nota, unisci, riga }
}

export type Kit = ReturnType<typeof kit>
