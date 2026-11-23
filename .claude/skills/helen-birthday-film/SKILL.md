---
name: helen-birthday-film
description: Creative direction, character sheet, architecture and verification rules for "The Memories That Never Fade", the hand-painted 2D anime birthday film for Helen Darlu in d:\birthday\film (WebGL2 shaders + painted multiplane layers, opened from the birthday page's candle step), and for Snowki the teddy and Jessi the dog on the birthday page. Use this skill whenever you touch the film or the birthday page in any way: a scene, shot, camera move, character, pose, expression, hair/cloth physics, the sea, sky, fireworks, the birthday message, dialogue, the flashback, audio, subtitles, timings, the countdown show, the Snowki guide, AI clips (Seedance / Veo), performance or phone layout. Use it even for small requests ("make her smile more", "change the last line", "he looks different here", "it's slow on my phone").
---

# The Memories That Never Fade

Two people have moved forward in life, but some memories stay precious. Snowki – the teddy he once gave her – is
the bridge between their past and present. Judge every change against this line:

> He wants to make her birthday special, then lets her go without asking to be seen.

Emotion comes from eyes and small gestures: no hug between them, no running, no exaggerated crying or waving.
The ending is bittersweet: Helen searches for who sent the fireworks, then leaves with six female friends; he stays
behind the tree and quietly hides his hurt. Dialogue is bottom subtitles; the flashback is a real animated memory.

## Where things are (read `film/README.md` for the full map)

- `film/config.js` – name (`recipient`), every line of text (subtitles, `dialogue` subtitles, the birthday
  message, final lines), scene timings, music path, drop-in art, optional AI clips, quality. Words live there.
- `film/js/` – `space.js` (world + positions, `PLACE`, floor plan `toXZ`/`fromXZ`), `world.js` (painted layers: tree,
  party corner, launcher `crate()`, fuse cord), `crowd.js` (background people), `rigs.js` (Helen, the man), `jessi.js`
  (the dog), `snowki.js` (the teddy), `physics.js`, `particles.js` (fireworks…), `timeline.js` (scenes + camera keys),
  `film.js` (places/paths `boyAt` `snowKeys` `jessiAt`, events, anchors, subtitles, the flashback `drawMemory`,
  quality), `shaders.js` + `renderer-gl.js`, `renderer-2d.js`, `audio.js`.
- `guide.js` + `index.html` – the birthday page. Snowki guides her through every step. Step 7 (`go(6)`) shows the film;
  its Continue posts `{type:'film-done'}`. The album (`album/`, `update_memories.py`) is encrypted: never weaken it,
  never commit `memories/`.
- The countdown is the waiting area. It follows her own clock (`todNow()` in index.html: night 19–5, morning 5–7, day
  7–17, dusk 17–19; preview with `?tod=day`): `#sky` layers + the `#cv` canvas (moon and stars / sun, clouds, birds),
  `drawGround()` in guide.js (a hill under the pair), dark ink by day (`html.tod-light`). Snowki is already there asleep,
  fades in, wakes slowly (stretch and yawn, rubs his eyes), looks around, waves (`hello()` greets by the time of day),
  then asks "Can I call Jessi?". Jessi runs in, then the two of them play: `play.js` (`makePlay`) – 52 games (`ACTS`:
  fetch, frisbee, tug of war, piggyback, hide and seek with a bush, kite, sky writing "Helen ♡", rain under an umbrella…)
  with props attached through the rigs' real transforms (`SN.*`, `JE.*`), particles and synth sound effects, and a nap with
  the dream cloud after every five; tap Jessi to skip. Test one with `Guide.play.go(i)`. Snowki moves by `G.po`
  `{x, y, r, s}`; Jessi by `J.ox` / `J.oy`, turning through side-on (`J.fx`).
- `music.js` (`window.Music`) – after she turns the sound on: her own MP3s from `CONFIG.songs` (songs/), then original
  Carnatic-style tunes played live (tanpura, veena / venu, mridangam; Mohanam, Hamsadhwani, Kalyani, Sindhu Bhairavi,
  Shuddha Dhanyasi) and a birthday song at the reveal. Copyrighted film songs are never downloaded or bundled.
- `film/tools/generate-clips.mjs` – optional Seedance 2.5 / Veo 3.1 clips. Paid: the user's key and approval only.

## Story (≈ 114 s after the wish; all at NIGHT, tod 1.72 → 1.95; timings {1:12,2:10,3:13,4:10,5:16,6:12,7:14,8:9,9:18})

She is drawn from behind (`back: true`) watching the sea, except the reverse-angle shots of her face (`rev`: scene 8,
and scene 6 local 8.4–10.2 s via `rev: [[a, b]]`).
0 Wish: candle on a cupcake; Snowki beside it shows her how to blow; she blows; he flies up into the story.
1 Opening: wide establishing from behind – Helen on the sea wall facing the sea and the moon, Snowki beside her, Jessi
  beside him; the cake, presents, balloons, jar lantern and garland on the wall; people strolling far away; the big
  bougainvillea tree on the right hides the man completely (`HIDE`). Slow push to the trio. Subtitle line.
2 Jessi notices first (ears up, turns to the tree, `alert`); Snowki turns; cut to the tree: the man slides to the trunk's
  edge and peeks (`hide` → `peek`, his gripping hand drawn again in front of the trunk); Snowki's recognition close-up
  (surprised → a hug of remembering with love eyes, glow and rising motes → happy). She keeps watching the sea.
3 He steps out (peek → walkHold with the little gift) to `PLACE.meet` and glances at her; Snowki hops down, toddles,
  glides by magic (`glide` mode) and toddles the last steps; Jessi waits, hops down and trots a dog's length behind him,
  then sits near the man wagging. Smoothed follow camera (`snowTrack`), never a whip pan.
4 The memory (`drawMemory` on `#mem`, its own camera `memCam`): golden-hour seaside (sun on the horizon between their
  hands, glitter, palm, gulls, bokeh); he walks in holding little Snowki (`walkHold`), offers him with both hands
  (`offer`), the teddy passes into her cupped hands (`standReceive`), she smiles and hugs him (`standHug`), he smiles at
  her; warm grade, vignette, letterbox, soft dissolve in/out; the night is not rendered while it covers the screen.
5 He kneels and cradles Snowki on his forearm; cinematic subtitles (`#say`): "Why are you here? Did you come to see
  her?" – "I came to wish her a happy birthday, just like every year." – "Every birthday, I wanted to make her smile
  with a little surprise. Today, I wanted to do the same." He looks at Snowki; Jessi sits nearby, wagging.
6 He gives Snowki the gift and sets him down; Snowki (glide) and Jessi (leading) go back to Helen while he slips
  behind the tree.
7 The camera faces him as he reaches the launcher and lights the long fuse with a stick; the spark runs ~10 m to
  `PLACE.launcher`; the shell climbs on a golden trail and cracks above the sea. HAPPY BIRTHDAY / HELEN DARLU ❤️
  forms from firework stars, reflected in the water; Snowki hops into her arms.
8 Her face (reverse angle, Snowki in her arms): surprise → excitement, then she looks along the shore for who sent
  the firework. The sea and moving reflections stay in the composition.
9 Six female friends arrive. Helen stands and walks away with them, carrying Snowki; the man remains hidden behind
  the tree, watching them go as his smile fades. The final words reflect the quiet ache he keeps to himself.

## Characters (one rig each – identical everywhere)

- **Helen** (from behind facing the sea except the reverse-angle shots) – after the user's character sheet (2026-11-22):
  peach skin, big brown eyes with winged liner, pink lips, stud earrings, no bindi; long wavy dark-brown hair half up in a
  twist (no bow clip), loose wavy locks to the waist (her top, sleeves and arms stay visible from behind); a cream
  long-sleeve top with a small floral print (crew neck, tucked in), high-waisted wide-leg blue jeans with gold-stitched
  back pockets, white sneakers, a brown watch on her left wrist (`HC`, `floralPrint`, `jeanPocket`, `jeanLegs` in rigs.js).
  Seated with knees turned to the side over the wall edge; standing only in the flashback (`stand`, poses `standReceive` /
  `standHug`, soles at `Helen.STAND_GROUND`) and when she leaves with her friends. Back view: `headTurn` / `bodyTurn` /
  `turnDir` / `smile`; `cradle` = Snowki in her arms.
- **The man**: dark curly hair, navy shirt with rolled sleeves, dark trousers, casual shoes; slightly taller than
  her. Hides (`hide`), peeks (`peek` + `drawGrip` overlay), walks (`walkHold`, `armsFree` swings the arms; `st.speed`
  plants the feet), offers (`offer`), kneels, cradles Snowki, talks (mouth moves), lights the fuse. `rigs.js` `Boy`.
- **Snowki**: the teddy he gave her – light-blue plush, pink bow at the neck, pink heart on the belly, glossy eyes.
  Never a dog. Toddles, glides by magic, talks (subtitles), carries the gift. `snowki.js`.
  (The user once wrote "black plush fur" for him while asking to keep his original look; he stays light blue –
  change `SNOWKI` colours in `snowki.js` if they ask again.)
- **Jessi**: an all-black German Shepherd PUPPY (the user insists on a puppy): big upright ears, round head, short muzzle,
  shiny brown eyes, round body, short legs with real joints (elbow back, knee forward, hock back), big paws with toenails,
  short fluffy tail, pink collar with a gold tag, a soft violet rim so she reads at night. Walk/run plant the paws at
  `o.vx` (the film computes it from her path); she turns round by squashing through side-on (`fl`). `jessi.js` – the
  same rig in the film, the countdown show and the reveal page's trio (guide.js draws it there).

## Rules

- 2D only (painted layers + shaders). The user declined a 3D rebuild: real 3D would need rigged GLB characters.
- Camera keys name an anchor with its depth (`gy`). Close shots need a long lens (`lens: 0.8–1`), or the sea wall
  slides out from under her and she seems to stand in the sea. A key with z < 1 at a deep `gy` gives a much smaller
  camera z – keep cam.z ≥ 0.6 (wide shots: give no `gy`, then z is the camera z).
- Frame a little wide; never crop a face, head, body or feet by accident – check 390×844 separately (anchors take
  `portrait` and a `zk` zoom factor; the same key frames differently). A character either fully in, or cleanly out.
  Lead room in the direction someone looks or moves.
- A cut = two keys 0.02 s apart. Keep screen direction (she is left/near, the man right/far, Snowki travels
  left→right to him and right→left home). Nobody teleports: every move is a continuous path.
- Characters never overlap on screen: he kneels clear of the trunk; Snowki sits between her and Jessi; Jessi trails or
  leads Snowki by a dog's length; check every shot. The crowd keeps out of key moments (`Crowd({ avoid })` zones).
- Seeking skips rocket launches: play scene 7 in real time to check the climb, the crack and the message. Seeking
  must not fire events early (the settle steps run with `S.noEv`).
- Exact names and text are HTML, never particles or AI video. Fireworks must not hide the moon. In her close-ups the
  moon's glitter path and bloom are toned down (`revNow()`), or the sea behind her blows out white.
- Keep it smooth on mid-range phones: quality tiers, DPR cap 2, pause when hidden, `prefers-reduced-motion`; no
  per-frame `ctx.filter` / `shadowBlur` in rigs; far extras redraw at half rate.
- Nothing may jitter at rest: anything that feeds a draw scale (like Snowki's `G.vis`) must settle exactly on its target,
  never overshoot and bounce back each frame (that was the "vibrating teddy").

## Checking your work

Serve `d:\birthday` (`python -m http.server 8765`) and use puppeteer-core with the installed Chrome. Seek with
`/film/?t=<s>` or `__film.seek(t)` (pause right after the seek for exact frames) and screenshot every scene at
1280×800 and 390×844; play the fireworks scene and the memory dissolves in real time; try `?force2d`; walk the page
(`go(n)` each step, the countdown's "Can I call Jessi?", then the film's Continue). Look for overlaps, crops,
blown-out white, off-centre subjects, holes, walkers crossing a key moment. Then commit and push – Vercel deploys
from GitHub and the user checks the live site.
