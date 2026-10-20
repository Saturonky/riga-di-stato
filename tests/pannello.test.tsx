import { expect, test } from 'claude-code/testing'

const PANNELLO = {
  plugin: 'riga-di-stato',
  component: 'Pane',
  requestId: 'contesto',
} as const

const props = (bodyColumns: number) => ({
  title: 'Contesto',
  isFocused: false,
  bodyColumns,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}) as const

const uso = (limite5h: number) => ({
  startedAt: 0,
  context: {
    tokens: 120_000,
    window: 1_000_000,
    percent: 12,
    breakdown: {
      categories: [
        { name: 'System prompt', tokens: 9000, color: 'promptBorder', isDeferred: false, kind: 'used' },
        { name: 'System tools', tokens: 21_000, color: 'inactive', isDeferred: false, kind: 'used' },
        { name: 'Messages', tokens: 90_000, color: 'permission', isDeferred: false, kind: 'used' },
        { name: 'Free space', tokens: 835_000, color: 'inactive', isDeferred: false, kind: 'free' },
        { name: 'Autocompact buffer', tokens: 45_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
      ],
      totalTokens: 120_000,
      maxTokens: 1_000_000,
      rawMaxTokens: 1_000_000,
      autocompactSource: 'auto',
      percentage: 12,
      gridRows: [],
      model: 'claude-opus-5-5',
      memoryFiles: [{ path: 'C:/Users/utente/.claude/projects/C--progetti-esempio/memory/MEMORY.md', type: 'AutoMem', tokens: 2500 }],
      mcpTools: [{ name: 'mcp__server__strumento', serverName: 'server', tokens: 300, isLoaded: true }],
      agents: [{ agentType: 'revisore', source: 'plugin', tokens: 200 }],
      autoCompactThreshold: 835_000,
      isAutoCompactEnabled: true,
      apiUsage: null,
    },
  },
  rateLimits: [
    { kind: 'five_hour', percentUsed: limite5h, resetsAt: '2026-10-20T14:00:00Z' },
    { kind: 'seven_day', percentUsed: 41 },
  ],
  cost: { usd: 1.5 },
})

const MOSTRA: string = ''
const larghezza = (s: string) => [...s].reduce((n, ch) => n + ((ch.codePointAt(0) ?? 0) >= 0x1f300 || ch === '⚡' ? 2 : 1), 0)

test('riga di stato essenziale, allarmi solo quando servono, pannello entro la larghezza', async ($, on) => {
  let stato = ''
  let limite5h = 23.5
  on('command.register', () => ({ value: { command: 'contesto' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: uso(limite5h) }))
  on('session.cwd', () => ({ value: 'C:/progetti/esempio' }))
  on('session.model', () => ({ value: 'Opus 5.5 (1M context)' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'main\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.status', (_, e) => { stato = (e as { text?: string }).text ?? ''; return { value: undefined } })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: 1_000_000 }))
  on('clock.after', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  if (MOSTRA) console.log(`riga: ${stato}`)
  expect(stato).toContain('esempio')
  expect(stato).toContain('main')
  expect(stato).toContain('12%')
  expect(stato).toContain('Opus 5.5')
  expect(stato).not.toContain('⚠')
  expect(larghezza(stato)).toBeLessThanOrEqual(116)

  for (const colonne of [34, 46, 60, 90]) {
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANNELLO, props: props(colonne), surface })
      expect(await ui.find({ type: 'Text', text: /CONTESTO/ })).toBeDefined()
      for (const sezione of ['nessuna', 'categorie', 'ordine', 'cronologia', 'limiti']) {
        if (sezione !== 'nessuna') await ui.press({ key: `sezione-${sezione}` })
        const testi = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '')
        if (surface === 'terminal' && String(colonne) === MOSTRA) console.log(`=== ${sezione} @${colonne}\n${testi.join('\n')}`)
        for (const t of testi) expect(larghezza(t)).toBeLessThanOrEqual(colonne)
      }
      expect(await ui.find({ type: 'Text', text: /5h/ })).toBeDefined()
      await ui.press({ key: 'sezione-limiti' })
      await ui.unmount()
    }
  }

  // Sopra il prompt, con poco spazio: l'ultima riga visibile dice che sotto c'è altro.
  const ridotto = await $.ui.mount({
    ...PANNELLO,
    props: { ...props(80), placement: 'inline', scroll: { offset: 0, bodyRows: 10 } },
    surface: 'terminal',
  })
  expect(await ridotto.find({ type: 'Text', text: /↓ altre \d+ righe/ })).toBeDefined()
  await ridotto.unmount()

  limite5h = 86
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  if (MOSTRA) console.log(`riga con allarme: ${stato}`)
  expect(stato).toContain('⚠ limite 5h 86%')
})
