# 4v4 Tactical Strike

A complete, playable **browser-based 3D tactical FPS** — Team Deathmatch, 4 maps, 5 weapons, and AI squads — built with **Three.js + TypeScript + Vite + Rapier physics**. No install, no downloads, no external assets: every model, texture and sound is generated procedurally.

> Blue team (you + 3 AI teammates) vs Red team (4 stronger AI enemies). First to **15 kills** wins.

## Play

After deploying (see below) the game lives at `https://<your-user>.github.io/<repo-name>/`.

Locally: `npm install && npm run dev` → open the printed URL (desktop Chrome, Edge or Firefox).

## Controls

| Key | Action | | Key | Action |
|---|---|---|---|---|
| W A S D | Move | | R | Reload |
| Mouse | Look (pointer lock) | | 1–5 / wheel | Pistol · Rifle · SMG · Shotgun · Sniper |
| Left click | Shoot | | Shift | Sprint |
| Right click | Aim / sniper scope | | Space | Jump |
| Tab (hold) | Scoreboard | | Esc | Pause |

## Features

- **Teams:** exactly 8 characters per match — you + 3 teammates (Blue) vs 4 enemies (Red); each with its own name, uniform, headgear and weapon. Scoreboard shows health, kills and deaths.
- **AI that plays fair:** bots only react to what they *see* (field of view + line-of-sight rays) or *hear* (gunfire/footsteps with positional error) — no wallhacks. Teams share callouts.
  - **Enemies (stronger):** faster reactions, tighter aim, strafing, cover/peek cycles, flanking routes, anchored sniper on long sightlines, coordinated pushes, retreat to cover when hurt.
  - **Friendly bots (slightly weaker):** follow and defend you, fan out around you, patrol strategic points, rush nearby contacts, never stand idle.
  - **Difficulty:** Easy / Normal / **Hard (default)** / Extreme.
- **4 maps:** Desert Fortress (wooden gates, big B bombsite), Urban City, Industrial Warehouse, Forest Outpost — all with collision, cover, spawns and AI nav graphs.
- **5 weapons:** pistol, assault rifle, SMG, shotgun, sniper — different damage, rate, recoil, reload, magazine, range. Headshots, ADS, working zoom scope, muzzle flash, tracers, impact decals/particles, explosive barrels.
- **HUD:** health, armour, weapon + ammo, crosshair that reacts to spread, rotating mini-map (enemies appear only when a teammate sees them), live scores, kill feed, hit markers, damage direction, remaining enemies/teammates, match timer.
- **Menus:** main menu, play wizard (map → difficulty → weapon), settings (sensitivity, FOV, volume, Low/Medium/High graphics), pause, scoreboard, victory/defeat with rematch. Settings and stats persist in `localStorage`.
- **Audio:** fully synthesised gunfire, reloads, footsteps, impacts, explosions, per-map ambience, with stereo panning and distance falloff.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check + production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run map-check` | Headless validation of every map: collision, spawns, nav-graph connectivity |
| `npm run sim` | Headless AI-vs-AI matches to check balance (`npx tsx scripts/sim-test.ts <matches> <maps> <difficulties>`) |
| `npm test` | Map check + a quick simulated match on every map |

## Deploying to GitHub Pages

1. Create a GitHub repository and push this project to its `main` branch.
2. In the repo go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or run the workflow manually from the **Actions** tab). `.github/workflows/deploy.yml` installs, builds and publishes `dist/`.

`vite.config.ts` uses `base: './'`, so the build works under any repository name or custom domain. All assets are bundled (no external requests, no fonts or audio files), so there are no paths that can break after deployment.

## Architecture

```
src/
  core/        Game (frame loop, orchestration), Settings (localStorage), typed event bus, shared types
  game/        Match (simulation state), Combat (hitscan, damage, explosions), modes/ (TDM + bomb-defusal hook)
  entities/    Character (shared by player and bots)
  physics/     Rapier world, kinematic character controller, raycasts
  weapons/     Weapon definitions + WeaponSystem (fire, reload, switch — used by player and bots)
  ai/          BotBrain (perception, aiming, combat, cover, retreat), TeamAI (orders, intel, flanks), NavGraph (A*), difficulty profiles
  maps/        Four map definitions built from a small DSL (boxes, rooms, stairs, ramps) → collision + nav + rendering
  characters/  Roster: names, uniforms, headgear, loadouts
  player/      PlayerController (pointer lock, movement, recoil, ADS)
  render/      GameView, instanced MapView, triplanar procedural materials, sky shader, character + weapon models, viewmodel, particles
  audio/       Procedural Web Audio engine
  ui/          HUD, minimap, menus, scoreboard, CSS
```

The simulation (`game/`, `ai/`, `physics/`, `weapons/`) has **no rendering, audio or DOM dependencies** — it talks to the rest of the app through a typed event emitter, which is what lets the AI be tested headlessly and makes new modes easy to add.

**Adding the bomb-defusal mode later:** implement the `GameMode` interface (`src/game/modes/GameMode.ts`) — see the documented skeleton in `BombDefusal.ts`. Maps already tag key locations (the Desert Fortress B site is a `key` waypoint) and `TeamAI` already issues hold/push/flank orders; plant/defuse orders and round logic are the missing pieces. It is deliberately not exposed in the menus yet.

## Performance notes

Static map geometry is **instanced** (one draw call per material), textures are small procedural canvases sampled triplanar in-shader, particles/tracers/decals are pooled, bot perception runs at ~8–10 Hz per bot, and A* runs only when orders change. **Low** quality disables shadows and renders at 70 % resolution; **High** uses 2048² shadows and up to 1.5× pixel ratio. Models and GPU resources are disposed when a match ends.

## Credits

All art, models and sounds are original and procedurally generated. Inspired by tactical shooters, but contains no copyrighted maps, characters, logos or sounds.

## Deploying to Cloudflare

- **Workers (CLI):** `npm install && npx wrangler login && npm run deploy` (builds, then uploads `dist/` using `wrangler.jsonc`).
- **Pages (dashboard):** Workers & Pages → Create → Pages → *Upload assets*, then drag in the built `dist/` contents. Or connect the Git repo with build command `npm run build` and output directory `dist`.
