export type PokemonSize = 'nano' | 'small' | 'medium' | 'large'
export type Placement = 'footer' | 'band'
export type RenderMode = 'auto' | 'image' | 'raster'
export type Language = 'en' | 'fr' | 'de' | 'ja'

export type PokemonSettings = {
  size: PokemonSize
  rows: number
  width: number
  place: Placement
  render: RenderMode
  shinyOdds: number
  language: Language
  hover: boolean
}

export type TeamMember = { uid: string; key: string; nickname: string; shiny: boolean }

declare module 'claude-code' {
  interface PluginState {
    'pokemon-footer': {
      settings: Shaped<PokemonSettings>
      team: Shaped<TeamMember[]>
      // Set once an image the terminal could not draw fell back to text cells.
      isRasterForced: Shaped<boolean>
    }
  }
}
