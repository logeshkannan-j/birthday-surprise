# Light Is the Only Words He Has

A ~100-second, hand-painted-looking 2D anime short that runs in the browser: WebGL2 shaders for the sky, sea,
light and post-processing, painted multiplane layers, rigged characters with real-time hair and cloth physics,
particle fireworks that spell her name, and a generated score. No 3D models, no three.js.

Open it on its own at `/film/`, or reach it from the birthday page: the candle step ("Make a birthday wish") now
opens the film full-screen, and its **Continue** button returns to the reveal.

## 1. How it fits the existing site

| Before | Now |
|---|---|
| `index.html` – countdown → envelope → greeting → album → memories → clock → today → wishes → **candle (three.js)** → **reveal (three.js)** | Same page and flow. Step 7 hosts the film (`#film` iframe → `film/?embed=1`). The reveal keeps its text, trio and photo slot. |
| three.js r170 from a CDN + 5 GLB models (3.6 MB) + a 90 KB 3D module | Removed. The page is 74 KB again. |
| `album/`, `update_memories.py`, admin panel ✦ | Unchanged. The admin panel's "7 Film" button jumps straight to the film. |

The film talks to the page with one message: `postMessage({type: 'film-done'})` when Continue is pressed.

## 2. Files

```
film/
  index.html              the route: canvases, subtitles, tiny mute / skip, end buttons
  config.js               EVERYTHING you may want to change (name, text, timings, music, art, clips)
  js/core.js              easing, randomness, simplex + curl noise, colours
  js/space.js             world space, positions, the multiplane camera projection
  js/world.js             procedurally painted layers (gouache dabs) + sprite atlas, baked once
  js/rigs.js              Helen, the boy, Jessi, the teddies: 2D skeletal rigs, IK, Verlet hair/ribbons/hem
  js/physics.js           wind field with travelling gusts, Verlet chains, cloth hem, balloons, springs
  js/particles.js         fireworks + message sampling, golden thread, lanterns, petals, motes, heart
  js/timeline.js          the master timeline: scenes, camera grammar, bullet-time curve
  js/audio.js             generated score, waves, wind, whoosh, boom, crackle, heartbeat
  js/shaders.js           GLSL: sky, sea, layers, characters, sprites, bloom, rays, flare, grade, Kuwahara
  js/renderer-gl.js       WebGL2 renderer + post chain
  js/renderer-2d.js       Canvas2D fallback when WebGL2 is missing
  js/film.js              orchestration, scenes' events, input, quality tiers, test API
  clips/clips.json        optional AI clips per scene (written by the tool below)
  tools/generate-clips.mjs + clip-prompts.json   Seedance 2.5 / Veo 3.1 clip generator (not deployed)
```

## 3. Changing things

All in `film/config.js`:

- **Name**: `recipient: 'Helen Darlu'`. The sky spells it in capitals; the final line uses it as written.
  (The birthday page itself still uses `CONFIG.to` in `index.html` – change both if you rename.)
- **Text**: `text.subtitles` (one per scene), `text.skyMessage`, `text.finalLines`, button labels.
- **Timings**: `timings` – seconds per scene. Events inside a scene keep their positions relative to its start.
- **Music**: put an mp3 at `/assets/music.mp3` (or change `music`). It replaces the generated score; waves, wind
  and fireworks stay. The mute choice is remembered per browser.
- **Character art**: `assets.helen / boy / dog / teddy = { src, height, anchorX, anchorY }`. Your PNG/SVG then
  replaces the drawn rig (it still gets lighting, shadows, depth of field and breathing; the built-in rigs are
  the ones with hair and cloth physics).
- **Quality**: `quality: 'auto'` picks high / medium / low from the device and a frame-time test; force one with
  `'high'` etc. or `?q=low` in the URL. `?force2d` forces the Canvas2D fallback.

## 4. Optional AI clips (Seedance 2.5, Veo 3.1)

Any scene can be replaced by a generated video clip; subtitles, the sparks that spell her name, the light and the
final lines still play on top, so names and text stay exact (video models can't be trusted to write them).

```
# BytePlus ModelArk (not available in the US). Paid per second of video.
ARK_API_KEY=...     node film/tools/generate-clips.mjs --provider seedance --scenes 1,7
# Google Gemini API (billing must be enabled). Clips are 4/6/8 s; longer scenes hold the last frame.
GEMINI_API_KEY=...  node film/tools/generate-clips.mjs --provider veo --scenes all
# see the exact requests without sending anything
node film/tools/generate-clips.mjs --provider seedance --dry
```

Prompts live in `film/tools/clip-prompts.json` (shared style + character descriptions keep the cast consistent).
`--ref name=image.png` adds reference images – use drawings, never real photos of people without their consent.
Request formats follow the providers' public docs as of November 2026; if a call is rejected, check the current
API reference (model IDs can be overridden with `SEEDANCE_MODEL` / `VEO_MODEL`).
To go back to the painted version of a scene, delete its line from `film/clips/clips.json`.

HeyGen makes talking-avatar videos. The story's rule is that he never speaks, so it isn't used in the film.

## 5. What is simplified, and why

- **Particles** are simulated on the CPU in typed arrays and drawn on the GPU as instanced sprites (not GPU
  transform feedback) – identical look, and it runs on every phone that has WebGL2.
- **Ocean**: six Gerstner-style waves shaded per pixel on a perspective ground plane (normals, Fresnel sky
  reflection, glitter, foam, caustics, plankton rings); reflections mirror the emissive layer about the horizon
  rather than ray-marching the scene.
- **Character lighting** uses normals derived from each character's silhouette, not painted height maps.
  Shadows are the characters' silhouettes sheared along the ground and blurred; the tree's shadow is painted.
- **Depth of field** blends each painted layer towards a pre-blurred copy (plus spiral taps) instead of a
  per-pixel circle-of-confusion gather; mip-based blur showed artefacts on some GPUs.
- **Kuwahara painterly filter** runs once when the backgrounds are baked (high/medium quality), not every frame.
- **Cloth**: hair, side-locks, ribbons, the sash and both hems are Verlet chains; dresses are not full 2D cloth meshes.
- **Bullet-time** slows physics, particles, the sea and clips; the camera and subtitles keep real time on purpose.
- **Canvas2D fallback** keeps the whole story but has no shaders or post-processing.
- Tested in desktop Chrome at desktop and phone sizes (WebGL2 and the 2D fallback); not yet on a real iPhone.

## Test hooks

`/film/?t=55` starts at 55 s; in the console `__film.seek(t)`, `__film.skip()`, `__film.state`.
