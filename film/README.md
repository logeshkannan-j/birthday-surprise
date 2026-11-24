# The Memories That Never Fade

A ~114-second, hand-painted-looking 2D anime short that runs in the browser: WebGL2 shaders for the sky, sea,
light and post-processing, painted multiplane layers, rigged characters with real-time hair and cloth physics,
background people on the promenade, fireworks, and a generated score. No 3D models, no three.js.

The story (nine scenes after the wish): on a moonlit sea wall after her birthday cake, Helen sits watching the sea
(seen from behind) – Snowki beside her, Jessi, her black German Shepherd puppy, beside him, the cake, presents and
balloons on the wall, people strolling far away. Jessi notices someone first (ears up, she turns to the big
bougainvillea tree); Snowki turns too – the man who gave him to Helen years ago is peeking from behind the trunk, and
Snowki recognises him (the main emotional beat: wide eyes, a hug of remembering, motes of light). The man steps out;
Snowki hops down and toddles, glides by magic and toddles again all the way to him, Jessi trotting behind. A real
animated flashback at golden hour shows the day he gave little Snowki to her: he walks in holding him, offers him with
both hands, she takes him with both hands, smiles and hugs him. He kneels, cradles Snowki, and they talk in cinematic
subtitles. He gives Snowki a gift and sets him down; Snowki and Jessi go back to her as he slips behind the tree.
From in front of him, we see him light the fuse. The shell climbs over the sea and spells her birthday in firework
stars, reflected in the moving water. Helen is surprised, then scans the shore for whoever sent it. Six of her
female friends arrive; she stands and walks away with them (Jessi hops off the wall and trots after, Snowki waves from her arms) and the
four of them fade into the night. The camera goes to him at the tree: he steps out, happy – the surprise worked – and waves. The film ends on
"Some surprises don't need you in the room. The love behind them arrives all the same."

On the birthday page, Snowki guides her through every step; on the countdown he says hi, asks "Can I call Jessi?",
and Jessi runs in, does tricks, falls asleep and dreams of Helen in a little cloud.

## 1. How it fits the existing site

| Before | Now |
|---|---|
| `index.html` – countdown → envelope → greeting → album → memories → clock → today → wishes → **candle (three.js)** → **reveal (three.js)** | Same page and flow. Step 7 hosts the film (`#film` iframe → `film/?embed=1`). The reveal keeps its text, trio and photo slot. |
| three.js r170 from a CDN + 5 GLB models (3.6 MB) + a 90 KB 3D module | Removed. The page is 74 KB again. |
| `album/`, `update_memories.py`, admin panel ✦ | Unchanged. The admin panel's "7 Film" button jumps straight to the film. |
| A plain countdown | Snowki says hi to Helen and asks "Can I call Jessi?" (OK / Not now). Jessi runs in from the left, barks, flips, spins, rolls over, play-bows, gives a high five, yawns and falls asleep; a thought cloud above her plays five little dreams of her with Helen (beach, ball, cuddle, sleeping together, with Snowki). Tap Jessi for a trick, tap the cloud for the next dream. |
| A static teddy picture on some steps | `guide.js`: Snowki, animated, on every step. He finds a free spot beside what she should look at, points, helps hold the seal, covers his eyes while she types the album password, reacts when tapped, dangles when dragged, and hides while the album or the film is open. |

The film talks to the page with one message: `postMessage({type: 'film-done'})` when Continue is pressed.

## 2. Files

```
film/
  index.html              the route: canvases, subtitles, tiny mute / skip, end buttons
  config.js               EVERYTHING you may want to change (name, text, timings, music, art, clips)
  js/core.js              easing, randomness, simplex + curl noise, colours
  js/space.js             world space, positions, the multiplane camera projection
  js/world.js             procedurally painted layers (gouache dabs) + sprite atlas, baked once
  js/rigs.js              Helen (front + back view, slow head/body turn, cradle, standing poses for the flashback) and the man
                          (hide, peek, walk, walkHold, offer, kneel, cradle, talk): 2D skeletal rigs, IK, hands, Verlet hair/hem
  js/gait.js              the shared walking cycle (planted feet that never slide, heel strike / toe-off, hip rise, arm swing) used by the man, Helen and the crowd
  js/dog.js               Jessi's voice: a model of a puppy's voice (barks that are happy / excited / indignant / sheepish / sleepy, yelps, whines, growls, yawns,
                          pants, snores), used by the page and the film; real recordings dropped in sounds/dog/ replace it (see sounds/dog/README.txt)
  js/snowki.js            Snowki, the magical teddy: one rig (26 actions, 12 expressions, springs) for the page and the film
  js/jessi.js             Jessi, her black German Shepherd puppy: one side-view rig (walk, run, alert, sit, bark, flip, …) for both
  js/physics.js           wind field with travelling gusts, Verlet chains, cloth hem, balloons, springs
  js/particles.js         fireworks (launcher, fuse, shells, bursts, sea reflections), petals, motes, heart
  js/crowd.js             background people on the promenade (couples, joggers, a family, the chai cart…), a pure function of time
  js/timeline.js          the master timeline: scenes, camera grammar, bullet-time curve
  js/audio.js             generated score, waves, wind, whoosh, boom, crackle, heartbeat
  js/shaders.js           GLSL: sky, sea, layers, characters, sprites, bloom, rays, flare, grade, Kuwahara
  js/renderer-gl.js       WebGL2 renderer + post chain
  js/renderer-2d.js       Canvas2D fallback when WebGL2 is missing
  js/film.js              orchestration: places and paths (the man, Snowki, Jessi), scenes' events, camera anchors,
                          subtitles, the golden-hour flashback (#mem canvas), quality tiers, test API
  clips/clips.json        optional AI clips per scene (written by the tool below)
  tools/generate-clips.mjs + clip-prompts.json   Seedance 2.5 / Veo 3.1 clip generator (not deployed)
../guide.js               Snowki guiding her through the birthday page (index.html calls Guide.step(n) / Guide.on(event))
```

## 3. Changing things

All in `film/config.js`:

- **Name**: `recipient: 'Helen Darlu'`. The sky spells it in capitals; the final line uses it as written.
  (The birthday page itself still uses `CONFIG.to` in `index.html` – change both if you rename.)
- **Text**: `text.subtitles` (by scene), `text.dialogue` (the conversation, shown as bottom subtitles), `text.skyMessage` (the
  birthday message formed by firework stars in the sky), `text.finalLines`, button labels.
- **Timings**: `timings` – seconds per scene. Events inside a scene keep their positions relative to its start.
- **Music**: put an mp3 at `/assets/music.mp3` (or change `music`). It replaces the generated score; waves, wind
  and fireworks stay. The mute choice is remembered per browser.
- **Character art**: `assets.helen / boy / dog / teddy = { src, height, anchorX, anchorY }`. Your PNG/SVG then
  replaces the drawn rig (it still gets lighting, shadows, depth of field and breathing; the built-in rigs are
  the ones with hair and cloth physics).
- **Snowki on the page**: what he does and says on each step is the `STEPS` / `EVENTS` table near the top of
  `guide.js`; tap reactions are `TAPS`. In the film his path is `snowKeys()` in `js/film.js` (modes side / fly /
  walk / glide / stand / held / lap) and his actions are the `sn…` events in `js/timeline.js`. The man's path is
  `boyAt()`, Jessi's `jessiAt()` (she trails Snowki in scene 3 and leads him home in scene 6); the flashback is
  `drawMemory()` with its own camera keys `memCam`.
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
- **Night light on the painted world** is baked: each painted layer carries an emissive copy of itself lit warm
  inside soft pools (lamps, string lights, her lantern) plus the moonlit edge of the sea wall. Characters get real
  point lights (her lantern, lamps, fireworks, Snowki's glow) and a cool moonlight rim in the shader.
- **Snowki** is drawn procedurally (gradient fur, fuzzy edge strokes, glossy eyes) and animated with springs, so
  every move eases and overshoots a little; there are no sprite sheets.
- **Canvas2D fallback** keeps the whole story but has no shaders or post-processing (night is a dimming filter).
- **The flashback** is drawn on its own Canvas2D layer (`#mem`) with the same rigs; the night scene is not rendered while it fully covers the screen.
- **Background people** are simple 2D figures; far ones redraw at half rate (their quads still move every frame).
- **Phone portrait** is too narrow for some landscape compositions: there the over-the-shoulder shot in scene 6 follows Snowki home instead, the sky shot of the fireworks shows the launcher end of the promenade, and the moon is out of frame in the final pull back.
- Tested in desktop Chrome at desktop and phone sizes (WebGL2 and the 2D fallback); not yet on a real iPhone.

## Test hooks

`/film/?t=55` starts at 55 s; in the console `__film.seek(t)`, `__film.skip()`, `__film.state`, `__film.boy()`,
`__film.jessiAt(t)`, `__film.snowAt(t)`, `__film.anchor(name, portrait)`.
