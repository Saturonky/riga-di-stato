// Prove di caratterizzazione: fissano che cosa fa la Mod oggi (riga di stato, /contesto, registro),
// prima del taglio in file. Se una di queste cambia, il comportamento è cambiato.
import { expect, mock, test } from 'claude-code/testing'

const PANNELLO = { plugin: 'riga-di-stato', component: 'Pane', requestId: 'contesto' } as const

type Opz = { tokens?: number; soglia?: number; limite5h?: number; usoRotto?: boolean; aperto?: boolean; posto?: boolean }
type Mondo = { stato: () => string; aperture: unknown[]; chiusure: unknown[]; clock: ReturnType<typeof mock.clock> }

const uso = (o: Opz) => ({
  startedAt: 0,
  context: {
    tokens: o.tokens ?? 120_000,
    window: 1_000_000,
    percent: Math.round(((o.tokens ?? 120_000) * 100) / 1_000_000),
    breakdown: {
      categories: [
        { name: 'System prompt', tokens: 9000, color: 'promptBorder', isDeferred: false, kind: 'used' },
        { name: 'Messages', tokens: 90_000, color: 'permission', isDeferred: false, kind: 'used' },
        { name: 'Free space', tokens: 835_000, color: 'inactive', isDeferred: false, kind: 'free' },
      ],
      totalTokens: o.tokens ?? 120_000,
      maxTokens: 1_000_000,
      rawMaxTokens: 1_000_000,
      autocompactSource: 'auto',
      percentage: 12,
      gridRows: [],
      model: 'claude-opus-5-5',
      memoryFiles: [],
      mcpTools: [],
      agents: [],
      autoCompactThreshold: o.soglia ?? 835_000,
      isAutoCompactEnabled: true,
      apiUsage: null,
    },
  },
  rateLimits: [{ kind: 'five_hour', percentUsed: o.limite5h ?? 20, resetsAt: '2026-10-20T14:00:00Z' }],
  cost: { usd: 1.5 },
})

function mondo(on: any, o: Opz = {}): Mondo {
  let stato = ''
  const m: Mondo = { stato: () => stato, aperture: [], chiusure: [], clock: mock.clock(on, { now: 1_000_000 }) }
  on('command.register', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => (o.usoRotto ? { deny: 'usage non disponibile' } : { value: uso(o) }))
  on('session.cwd', () => ({ value: 'C:/progetti/esempio' }))
  on('session.model', () => ({ value: 'Opus 5.5 (1M context)' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'main\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.status', (_: unknown, e: any) => { stato = e?.text ?? ''; return { value: undefined } })
  on('ui.open', (_: unknown, e: any) => { m.aperture.push(e); return { value: { isPlaced: o.posto ?? true } } })
  on('ui.close', (_: unknown, e: any) => { m.chiusure.push(e); return { value: undefined } })
  on('ui.panes', () => ({ value: o.aperto ? [{ id: 'contesto' }] : [] }))
  return m
}

const passo = async ($: any) => { const g = $.turn.step({ model: 'claude-opus-5-5', messages: [] }); let x; do x = await g.next(); while (!x.done) }
const avvia = ($: any) => $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
const testi = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text ?? '').join('\n')
const props = (bodyColumns: number) => ({ title: 'Contesto', isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} })

test('riga di stato: a 120 colonne tutti i segmenti, nell\'ordine', async ($, on) => {
  const m = mondo(on)
  await avvia($)
  expect(m.stato()).toBe('esempio  ⎇ main    🟢 12%  120k / 1M    $1.50    Opus 5.5')
})

test('riga di stato: stretta, toglie prima il ramo, poi cartella, modello e costo', async ($, on) => {
  const m = mondo(on)
  await avvia($)
  for (const [colonne, atteso] of [
    [60, 'esempio    🟢 12%  120k / 1M    $1.50    Opus 5.5'],
    [40, '🟢 12%  120k / 1M    $1.50'],
    [24, '🟢 12%  120k / 1M'],
  ] as const) {
    await $.command.run({ command: 'contesto', args: '', presentation: { columns: colonne, isFullscreen: true } } as never)
    await m.clock.advance(500)
    expect(m.stato()).toBe(atteso)
  }
})

test('riga di stato: gli allarmi compaiono solo sopra soglia', async ($, on) => {
  const m = mondo(on, { tokens: 800_000, soglia: 835_000, limite5h: 86 })
  await avvia($)
  expect(m.stato()).toContain('⚠ compact tra 35.0k')
  expect(m.stato()).toContain('⚠ limite 5h 86%')
})

test('riga di stato: se l\'uso non si legge, la riga dice l\'errore', async ($, on) => {
  const m = mondo(on, { usoRotto: true })
  await avvia($)
  expect(m.stato()).toContain('usage non disponibile')
})

test('/contesto apre il pannello di fianco, e chiede ciò che manca per il dock', async ($, on) => {
  const m = mondo(on)
  await avvia($)
  const r: any = await $.command.run({ command: 'contesto', args: '' } as never)
  expect(r.text).toBe('Pannello del contesto aperto.')
  expect(m.aperture[0]).toMatchObject({ id: 'contesto', title: 'Contesto', columns: 46, closeOnEscape: true })
  const stretto: any = await $.command.run({ command: 'contesto', args: '', presentation: { columns: 90, isFullscreen: false } } as never)
  expect(stretto.text).toContain('sopra il prompt')
  expect(stretto.text).toContain('fullscreen')
  expect(stretto.text).toContain('almeno 110 colonne (ora 90)')
})

test('/contesto senza argomento chiude il pannello aperto; con una sezione la apre', async ($, on) => {
  const m = mondo(on, { aperto: true })
  await avvia($)
  const r: any = await $.command.run({ command: 'contesto', args: '' } as never)
  expect(r.text).toBe('Pannello del contesto chiuso.')
  expect(m.chiusure).toHaveLength(1)
  await $.command.run({ command: 'contesto', args: 'limiti' } as never)
  expect(m.chiusure).toHaveLength(1)
  const ui = await $.ui.mount({ ...PANNELLO, props: props(60), surface: 'terminal' } as never)
  expect(await testi(ui)).toContain('riparte')
  await ui.unmount()
})

test('/contesto senza posto per il pannello risponde con il riepilogo in testo', async ($, on) => {
  mondo(on, { posto: false })
  await avvia($)
  const r: any = await $.command.run({ command: 'contesto', args: '' } as never)
  expect(r.text).toBe('Contesto 12% · 120k/1M token\n- System prompt: 9.0k\n- Messages: 90.0k\n- Free space: 835k\nAutocompact a 835k')
})

test('registro: righe, richieste e modifiche entrano nel pannello; /clear le azzera', async ($, on) => {
  const m = mondo(on)
  on('tool.call', () => ({ result: 'ran' }))
  on('session.append', (_: unknown, e: any, next: any) => next(e))
  on('turn.step', async function* () { return { answer: '', toolUses: [], usage: { model: 'claude-opus-5-5', input_tokens: 1000, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0, output_tokens: 300 } } })
  on('session.end', (_: unknown, e: any) => ({ sessionId: e.sessionId ?? 'sessione' }))
  await avvia($)
  await $.session.append({ door: 'user', message: { role: 'user', type: 'user', content: [{ type: 'text', text: 'ciao '.repeat(10_000) }] }, origin: { kind: 'user' } } as never)
  await passo($)
  await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'a\nb', new_string: 'x' } as never)
  await $.tool.call({ tool: 'Write', file_path: 'b.ts', content: 'uno\ndue\ntre' } as never)
  await m.clock.advance(500)

  let ui = await $.ui.mount({ ...PANNELLO, props: props(60), surface: 'terminal' } as never)
  const riepilogo = await testi(ui)

  expect(riepilogo).toContain('$1.50  ·  1 richieste  ·  +4 −2')
  expect(riepilogo).toContain('cache 90%  ·  out 300')
  await ui.press({ key: 'sezione-cronologia' })
  const cron = await testi(ui)
  expect(cron).toContain('più pesanti')
  expect(cron).toMatch(/user\s+12\.5k/)
  await ui.unmount()

  await $.session.end({ reason: 'clear' } as never)
  ui = await $.ui.mount({ ...PANNELLO, props: props(60), surface: 'terminal' } as never)
  const azzerato = await testi(ui)
  expect(azzerato).toContain('0 richieste  ·  +0 −0')
  expect(azzerato).toContain('nessuna: arriva col prossimo prompt')
  await ui.unmount()
})
