# Ember Ridge — a three.js tactical FPS

A round-based tactical first-person shooter on a hillside shrine at dusk,
built for make.fun's "Make the best three.js tactical FPS" bounty
(`threejs-fps-01`). Original map, art, sounds and names — Counter-Strike
in style, never a copy.

**You (Ember)** attack with the Ember Core. **Moon (bots)** defend two
shrines: Moon Gate (A) and Ember Shrine (B). Plant the core at A or B and
let it burn for 35 seconds — or eliminate the Moon team. Moon wins by
running the clock out, eliminating Ember, or defusing a planted core.
First to 5 rounds takes the match.

- Money between rounds, buy menu (B): Kestrel Rifle, Lantern SMG, Heron
  Long Rifle, Kite Pistol, Stoneweave Armour, Ember Burst grenade.
- Gunplay that rewards accuracy: headshots, recoil and spread that punish
  firing on the move, crouching and standing still pay.
- Bots that follow lanes, hold corners, react to what they see, plant and
  defuse. A minimap, kill feed, round timer, health/armour/ammo HUD.
- Runs offline from static files: no build step, no network request.
  three.js 0.187.0 is vendored under `game/vendor/three/`.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

WASD move · mouse look · click fire · R reload · B buy · G grenade ·
Ctrl crouch · Space jump · 1–5 quick buy · M mute.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to `/output` and writes `/output/dossier.json` with the
vendored make.fun library.

## License

MIT — see `LICENSE`.
