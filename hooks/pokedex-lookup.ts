import { POKEDEX_ROWS } from './pokedex'

export type Language = 'en' | 'fr' | 'de' | 'ja'
export const LANGUAGES: readonly Language[] = ['en', 'fr', 'de', 'ja']

export type PokedexEntry = {
  key: string
  name: string
  generation: number
  hasShiny: boolean
  hasLeftWalk: boolean
  names: Readonly<Record<string, string>>
}

export const POKEDEX: readonly PokedexEntry[] = POKEDEX_ROWS.map(
  ([key, name, generation, hasShiny, hasLeftWalk, names]) => ({
    key,
    name,
    generation,
    hasShiny: hasShiny === 1,
    hasLeftWalk: hasLeftWalk === 1,
    names,
  }),
)

const BY_KEY = new Map(POKEDEX.map(entry => [entry.key, entry]))

function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9぀-ヿ一-鿿]+/g, '')
}

export function pokedexEntry(key: string): PokedexEntry | undefined {
  return BY_KEY.get(key)
}

export function localName(entry: PokedexEntry, language: Language): string {
  return language === 'en' ? entry.name : (entry.names[language] ?? entry.name)
}

// Matches a key, or a name in any language, ignoring case, accents and punctuation.
export function findPokemon(query: string): PokedexEntry | undefined {
  const wanted = normalize(query)
  if (wanted === '') {
    return undefined
  }
  const exact = POKEDEX.find(
    entry =>
      normalize(entry.key) === wanted ||
      normalize(entry.name) === wanted ||
      Object.values(entry.names).some(name => normalize(name) === wanted),
  )
  return exact ?? POKEDEX.find(entry => normalize(entry.key).startsWith(wanted))
}

export function randomPokemon(random: () => number, generation?: number): PokedexEntry {
  const pool = generation ? POKEDEX.filter(entry => entry.generation === generation) : POKEDEX
  return pool[Math.floor(random() * pool.length)] ?? POKEDEX[0]!
}

// vscode-pokemon's default nicknames (src/panel/pokemon.ts).
export const NICKNAMES: readonly string[] = [
  'Bella', 'Charlie', 'Molly', 'Coco', 'Ruby', 'Oscar', 'Lucy', 'Bailey', 'Milo', 'Daisy',
  'Archie', 'Ollie', 'Rosie', 'Lola', 'Frankie', 'Roxy', 'Poppy', 'Luna', 'Jack', 'Millie',
  'Teddy', 'Cooper', 'Bear', 'Rocky', 'Alfie', 'Hugo', 'Bonnie', 'Pepper', 'Lily', 'Tilly',
  'Leo', 'Maggie', 'George', 'Mia', 'Marley', 'Harley', 'Chloe', 'Lulu', 'Missy', 'Jasper',
  'Billy', 'Nala', 'Monty', 'Ziggy', 'Winston', 'Zeus', 'Zoe', 'Stella', 'Sasha', 'Rusty',
  'Gus', 'Baxter', 'Dexter', 'Willow', 'Barney', 'Bruno', 'Penny', 'Honey', 'Milly', 'Murphy',
  'Simba', 'Holly', 'Benji', 'Henry', 'Lilly', 'Pippa', 'Shadow', 'Sam', 'Lucky', 'Ellie',
  'Duke', 'Jessie', 'Cookie', 'Harvey', 'Bruce', 'Jax', 'Rex', 'Louie', 'Jet', 'Banjo',
]
