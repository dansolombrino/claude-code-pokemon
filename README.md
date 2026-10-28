# Pokémon for your Claude Code footer

> A Claude Code port of **[vscode-pokemon](https://github.com/jakobhoeg/vscode-pokemon)** by [jakobhoeg](https://github.com/jakobhoeg) ([VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=jakobhoeg.vscode-pokemon)). All the behaviour, Pokédex data, translations and sprites come from that project. Go give it a star.

Pokémon that live in the bottom bar of [Claude Code](https://claude.com/claude-code), next to your status line. They wander, make friends and get happy when you pet them. They also notice what Claude is doing: they hurry while it works, stop and look up when it needs your approval, and celebrate when it finishes.

It is a port of [vscode-pokemon](https://github.com/jakobhoeg/vscode-pokemon) by [jakobhoeg](https://github.com/jakobhoeg), as a Claude Code mod (a `pokemon-footer` plugin with a hooks module). All 630 Pokémon with sprites in vscode-pokemon are here, from generation 1 to 5, shinies included.

## Install

At the prompt of a Claude Code session:

```
/plugin install pokemon-footer --marketplace dansolombrino/claude-code-pokemon
```

From a shell:

```
claude plugin install pokemon-footer --marketplace dansolombrino/claude-code-pokemon
```

A random Pokémon joins you on first start. Sprites download the first time each Pokémon appears (needs `curl`) and are cached under `~/.cache/claude-code-pokemon`.

Mods are an early-access part of Claude Code; this one needs a version that runs hooks modules (2.1.311 or later).

## Use

| Command | What it does |
| --- | --- |
| `/pokemon spawn pikachu` | Adds a Pokémon. Any language works: `/pokemon spawn Canarticho` |
| `/pokemon spawn charizard shiny as Blaze` | A shiny one, with a nickname |
| `/pokemon random` or `/pokemon random gen 3` | A random Pokémon (shiny odds 1 in 8192) |
| `/pokemon remove Blaze`, `/pokemon clear` | Sends one, or all, back to the Poké Ball |
| `/pokemon list`, `/pokemon roll-call` | Who is on the team; everyone says hello |
| `/pokemon pet Blaze` | Pets one (or hover the pointer over it) |
| `/pokemon find saur` | Searches the Pokédex |
| `/pokemon size nano\|small\|medium\|large` | Pokémon size |
| `/pokemon rows 7`, `/pokemon width 48` | Height and width of the strip, in terminal cells |
| `/pokemon place footer\|band` | Beside the status line, or full width above the prompt |
| `/pokemon render auto\|image\|raster` | Real pixels or coloured text cells |
| `/pokemon language en\|fr\|de\|ja` | Pokémon names in another language |
| `/pokemon shiny-odds 100` | Better luck |
| `/pokemon export team.json`, `/pokemon import team.json` | Save and share a team |

Up to 12 Pokémon at once. The team and settings persist across sessions.

## How it draws

- **Real pixels** in terminals with an image protocol: kitty, Ghostty and iTerm2 3.5+ (iTerm2 under fullscreen rendering). Inside tmux, turn on `allow-passthrough` and `focus-events`.
- **Coloured half-block cells** everywhere else, two pixels per cell. The plugin switches to these by itself when the terminal cannot show images; `/pokemon render raster` forces them.

Hovering a Pokémon pets it in terminals that report the pointer.

## Behaviour

The walking, idling, petting and friendship rules follow vscode-pokemon's state machine (`src/panel/states.ts`), stepped every 100 ms. Added for Claude Code:

| Claude is | The Pokémon |
| --- | --- |
| working on a turn | walk faster and rest less |
| waiting for your approval | stop and show `!` |
| done | cheer |

## Develop

```
git clone https://github.com/dansolombrino/claude-code-pokemon
claude --plugin-dir ./claude-code-pokemon
```

- `claude plugin validate .` checks the manifest and hooks module; `claude plugin test .` runs `tests/`.
- `tsc -p .` type-checks once Claude Code has loaded the plugin and written `.claude-plugin/types/`.
- `hooks/pokedex.ts` is generated from a vscode-pokemon checkout: `python3 scripts/build-pokedex.py <checkout> hooks/pokedex.ts`. Bump `SPRITES_COMMIT` in `hooks/sprites.ts` to the same commit.

## Credits and legal

- Behaviour, Pokédex data, translations and nicknames come from [vscode-pokemon](https://github.com/jakobhoeg/vscode-pokemon) (code under CC0).
- This repository holds code only and no artwork. Sprites are fetched at run time from vscode-pokemon, pinned to one commit.
- Pokémon and all related names and images are © Nintendo / Creatures Inc. / GAME FREAK inc. / The Pokémon Company. This is a non-commercial fan project, not affiliated with or endorsed by them.
- The code is MIT licensed; see [LICENSE](LICENSE).
