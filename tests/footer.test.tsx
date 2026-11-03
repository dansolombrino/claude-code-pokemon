import { expect, mock, test } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

const FOOTER = {
  plugin: 'pokemon-footer',
  component: 'SessionMode',
  requestId: 'footer',
  props: { modes: ['focus'] },
} as const

const TEAM = [{ uid: 'a', key: 'pikachu', nickname: 'Sparky', shiny: false }]

const USAGE = { startedAt: 0, context: { window: 200000 }, rateLimits: [] }

// The answers a footer needs beneath the plugin: settings, the session's figures,
// the clock, and the status line command's output when one is configured.
function engine(on: On, statusLine?: string, agents: AgentInfo[] = []): void {
  on('agent.list', () => ({ value: agents }))
  on('command.register', () => ({ value: { command: 'pokemon' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.every', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.blit', () => ({ value: {} }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.id', () => ({ value: 'session' }))
  on('settings.read', () => ({
    value: statusLine === undefined ? {} : { statusLine: { type: 'command', command: 'status' } },
  }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: statusLine ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>focus</Text>
  })
}

test('the footer keeps the engine’s labels and adds the Pokémon strip with its hover overlay', async ($, on) => {
  mock.store(on, { isSetUp: true, team: TEAM, settings: { render: 'raster', width: 30, rows: 5 } })
  engine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /focus/ }))?.text).toBe('focus')
  expect(await ui.find({ type: 'Raster', key: 'pokemon' })).toBeDefined()
  expect(await ui.find({ type: 'Client', key: 'hover' })).toBeDefined()
  await ui.unmount()
})

test('beside a status line the strip takes only the columns and rows it leaves free', async ($, on) => {
  mock.store(on, { isSetUp: true, team: TEAM, settings: { render: 'raster', width: 48, rows: 7 } })
  // Four lines, the widest 60 cells: colours take none, the emoji two.
  const line = `\u001b[36m${'x'.repeat(58)}\u001b[0m🕒`
  engine(on, ['cwd', line, 'model', 'cost'].join('\n') + '\n')

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal', viewport: { columns: 100, rows: 40 } })
  await ui.redraw()

  // 100 columns less 2 + 2 of padding, the 60-cell status line and a gap of 2.
  const raster = await ui.find({ type: 'Raster', key: 'pokemon' })
  expect(raster?.props).toMatchObject({ columns: 34, rows: 4 })
  expect((await ui.find({ type: 'Text', text: /focus/ }))?.text).toBe('focus')
  await ui.unmount()
})

test('beside a status line the strip hides while the tasks list shows agents under it', async ($, on) => {
  mock.store(on, { isSetUp: true, team: TEAM, settings: { render: 'raster', width: 48, rows: 7 } })
  const agent: AgentInfo = { id: 'a1', description: 'Probing config', type: 'general-purpose', status: 'running' }
  engine(on, ['cwd', 'x'.repeat(40), 'model', 'cost'].join('\n') + '\n', [agent])

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal', viewport: { columns: 100, rows: 40 } })
  await ui.redraw()

  expect(await ui.find({ type: 'Raster', key: 'pokemon' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /focus/ }))?.text).toBe('focus')
  await ui.unmount()
})

test('beside a status line the strip stays once every agent has ended', async ($, on) => {
  mock.store(on, { isSetUp: true, team: TEAM, settings: { render: 'raster', width: 48, rows: 7 } })
  const agent: AgentInfo = { id: 'a1', description: 'Probing config', type: 'general-purpose', status: 'completed' }
  engine(on, ['cwd', 'x'.repeat(40), 'model', 'cost'].join('\n') + '\n', [agent])

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal', viewport: { columns: 100, rows: 40 } })
  await ui.redraw()

  expect(await ui.find({ type: 'Raster', key: 'pokemon' })).toBeDefined()
  await ui.unmount()
})

test('/pokemon spawn finds a Pokémon by its name in another language', async ($, on) => {
  mock.store(on, { isSetUp: true, team: [] })
  on('command.register', () => ({ value: { command: 'pokemon' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const result = await $.command.run({
    command: 'pokemon',
    args: 'spawn Canarticho as Leek',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })

  expect(result.text).toBe("Leek (Farfetch'd) joined the team!")
})
