import type { ClientModule } from 'claude-code'

// Draws nothing over the Pokémon strip; reports where the pointer is so the
// hooks module can pet whoever is under it, as vscode-pokemon's mouseover does.
const Hover: ClientModule = (_props, surface) => {
  const { Box } = surface.elements
  if (surface.state === undefined) {
    surface.setState(true)
    surface.onPointer(event => {
      if (event.type === 'move' || event.type === 'down') {
        surface.post({ x: event.fine?.x ?? event.x + 0.5 })
      }
    })
  }
  return <Box />
}

export default Hover
