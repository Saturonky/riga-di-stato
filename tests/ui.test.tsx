// Prove della UI ai livelli A (struttura: niente sfora, chiavi e tasti unici) e B (il motore disegna
// davvero il nostro albero e i pulsanti rispondono), a 40, 80 e 140 colonne, sui due schermi.
// Il livello C (terminale vero) e D (app desktop) richiedono una persona.
import { expect, test } from 'claude-code/testing'
import { errors, lint, preview } from './ui-kit'

const PANNELLO = { plugin: 'riga-di-stato', component: 'Pane', requestId: 'contesto' } as const
const SEZIONI = ['categorie', 'ordine', 'cronologia', 'limiti'] as const

const uso = {
  startedAt: 0,
  context: {
    tokens: 120_000,
    window: 1_000_000,
    percent: 12,
    breakdown: {
      categories: [
        { name: 'System prompt', tokens: 9000, color: 'promptBorder', isDeferred: false, kind: 'used' },
        { name: 'Messages', tokens: 90_000, color: 'permission', isDeferred: false, kind: 'used' },
        { name: 'Free space', tokens: 835_000, color: 'inactive', isDeferred: false, kind: 'free' },
      ],
      totalTokens: 120_000, maxTokens: 1_000_000, rawMaxTokens: 1_000_000, autocompactSource: 'auto', percentage: 12, gridRows: [],
      model: 'claude-opus-5-5',
      memoryFiles: [{ path: 'C:/Users/utente/.claude/projects/un-progetto-dal-nome-molto-lungo/memory/MEMORY.md', type: 'AutoMem', tokens: 2500 }],
      mcpTools: [{ name: 'mcp__server__uno-strumento-dal-nome-lungo', serverName: 'server', tokens: 300, isLoaded: true }],
      agents: [{ agentType: 'revisore', source: 'plugin', tokens: 200 }],
      autoCompactThreshold: 835_000, isAutoCompactEnabled: true, apiUsage: null,
    },
  },
  rateLimits: [{ kind: 'five_hour', percentUsed: 86, resetsAt: '2026-10-20T14:00:00Z' }, { kind: 'seven_day', percentUsed: 41 }],
  cost: { usd: 1.5 },
}

const avvia = async ($: any, on: any) => {
  on('command.register', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: uso }))
  on('session.cwd', () => ({ value: 'C:/progetti/esempio' }))
  on('session.model', () => ({ value: 'Opus 5.5' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'main\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: 1_000_000 }))
  on('clock.after', () => ({ value: undefined }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

const monta = ($: any, surface: 'terminal' | 'desktop', columns: number, isFocused: boolean) =>
  $.ui.mount({ ...PANNELLO, surface, props: { title: 'Contesto', isFocused, bodyColumns: columns, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} } })

for (const surface of ['terminal', 'desktop'] as const) {
  for (const columns of [40, 80, 140]) {
    test(`A+B: ogni sezione sta in ${columns} colonne su ${surface}, e i tasti rispondono`, async ($, on) => {
      await avvia($, on)
      for (const isFocused of [true, false]) {
        const ui: any = await monta($, surface, columns, isFocused)
        expect(await ui.find({ type: 'Button', key: 'sezione-categorie' })).toBeDefined()
        for (const s of SEZIONI) {
          await ui.press({ key: `sezione-${s}` })
          const albero = await ui.drawn()
          expect(errors(lint(albero, { surface, columns }))).toEqual([])
          if (columns === 40 && surface === 'terminal' && !isFocused && s === 'ordine') console.log(preview('ordine, senza focus', albero, columns))
        }
        await ui.unmount()
      }
    })
  }
}

test('senza focus una riga dice come usare i tasti; con il focus non c\'è', async ($, on) => {
  await avvia($, on)
  for (const [columns, testo] of [[40, /clic qui per i tasti 1-4$/], [80, /\/contesto <sezione>/]] as const) {
    const senza: any = await monta($, 'terminal', columns, false)
    expect(await senza.find({ type: 'Text', text: testo })).toBeDefined()
    await senza.unmount()
    const con: any = await monta($, 'terminal', columns, true)
    expect(await con.find({ type: 'Text', text: /clic qui/ })).toBeUndefined()
    await con.unmount()
  }
})

test('lo stato vuoto dice che cosa aspettarsi', async ($, on) => {
  await avvia($, on)
  const ui: any = await monta($, 'terminal', 80, true)
  expect(await ui.find({ type: 'Text', text: /nessuna: arriva col prossimo prompt/ })).toBeDefined()
  await ui.unmount()
})

test('il kit trova davvero un albero sbagliato (visto fallire)', () => {
  const el = (type: string) => (props: any) => { const { children, ...rest } = props ?? {}; return { type, props: rest, children: children ?? [] } }
  const Box = el('Box'); const Button = el('Button'); const Text = el('Text')
  const sbagliato = Box({ children: [Button({ label: 'Vai', hotkey: '1' }), Button({ key: 'x', label: 'Vai', hotkey: '1' }), Text({ children: ['x'.repeat(200)] })] })
  const msg = errors(lint(sbagliato, { surface: 'terminal', columns: 40 })).join(' | ')
  expect(msg).toContain('no key')
  expect(msg).toContain('used 2 times')
  expect(msg).toContain('needs')
})
