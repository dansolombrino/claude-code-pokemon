import { expect, mock, test } from 'claude-code/testing'

const FOOTER = {
  plugin: 'pokemon-footer',
  component: 'SessionMode',
  requestId: 'footer',
  props: { modes: ['focus'] },
} as const

const TEAM = [{ uid: 'a', key: 'pikachu', nickname: 'Sparky', shiny: false }]

test('the footer keeps the engine’s labels and adds the Pokémon strip with its hover overlay', async ($, on) => {
  mock.store(on, { isSetUp: true, team: TEAM, settings: { render: 'raster', width: 30, rows: 5 } })
  on('command.register', () => ({ value: { command: 'pokemon' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>focus</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...FOOTER, surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /focus/ }))?.text).toBe('focus')
  expect(await ui.find({ type: 'Raster', key: 'pokemon' })).toBeDefined()
  expect(await ui.find({ type: 'Client', key: 'hover' })).toBeDefined()
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
