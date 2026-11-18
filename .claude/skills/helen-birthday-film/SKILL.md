---
name: helen-birthday-film
description: Creative direction, character sheet, architecture and verification rules for "The Memories That Never Fade", the hand-painted 2D anime birthday film for Helen Darlu in d:\birthday\film (WebGL2 shaders + painted multiplane layers, opened from the birthday page's candle step), and for Snowki the teddy and Jessi the dog on the birthday page. Use this skill whenever you touch the film or the birthday page in any way: a scene, shot, camera move, character, pose, expression, hair/cloth physics, the sea, sky, fireworks, the birthday message, dialogue, the flashback, audio, subtitles, timings, the countdown show, the Snowki guide, AI clips (Seedance / Veo), performance or phone layout. Use it even for small requests ("make her smile more", "change the last line", "he looks different here", "it's slow on my phone").
---

# The Memories That Never Fade

Two people have moved forward in life, but some memories stay precious. Snowki – the teddy he once gave her – is
the bridge between their past and present. Judge every change against this line:

> He does not need to come back into her life. He only wants to make her birthday special, as he used to.

Emotion comes from eyes and small gestures: no hug between them, no running, no exaggerated crying or waving.
(The user's correction brief of 2026-11-18 wins over older notes: she slowly NOTICES him before the fireworks and
smiles; he no longer walks away – the ending shows all four; dialogue is bottom subtitles; the flashback is a real
animated memory.)

## Where things are (read `film/README.md` for the full map)

- `film/config.js` – name (`recipient`), every line of text (subtitles, `dialogue` subtitles, the birthday
  message, final lines), scene timings, music path, drop-in art, optional AI clips, quality. Words live there.
- `film/js/` – `space.js` (world + positions, `PLACE`, floor plan `toXZ`/`fromXZ`), `world.js` (painted layers: tree,
  party corner, launcher `crate()`, fuse cord), `crowd.js` (background people), `rigs.js` (Helen, the man), `jessi.js`
  (the dog), `snowki.js` (the teddy), `physics.js`, `particles.js` (fireworks…), `timeline.js` (scenes + camera keys),
  `film.js` (places/paths `boyAt` `snowKeys` `jessiAt`, events, anchors, subtitles, the flashback `drawMemory`,
  quality), `shaders.js` + `renderer-gl.js`, `renderer-2d.js`, `audio.js`.
- `guide.js` + `index.html` – the birthday page. Snowki guides her through every step; on the countdown he says hi,
  asks "Can I call Jessi?" and Jessi does tricks, sleeps and dreams of Helen. Step 7 (`go(6)`) shows the film; its
  Continue posts `{type:'film-done'}`. The album (`album/`, `update_memories.py`) is encrypted: never weaken it,
  never commit `memories/`.
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
6 He gives Snowki the gift and sets him down; Snowki (glide) and Jessi (leading) go back; following them she slowly
  notices him – head (`hTurn` ramp), then shoulders (`hBody`) – over-the-shoulder with him far in the background, then
  the reverse angle: she looks toward him and gives a small gentle smile; cut to him: he smiles back.
7 He walks to `PLACE.boyLight`, kneels, lights the long fuse with a stick (the cord lies on the promenade only from
  scene 6, `FUSE_SCENE`); the spark runs ~10 m to the launcher (`PLACE.launcher`, far end of the promenade); the shell
  climbs on a golden trail (camera follows) and cracks; HAPPY BIRTHDAY / HELEN DARLU ❤️ appears with the burst (HTML),
  more bursts, reflections in the sea; Snowki hops into her arms (`lap` mode = Helen's `cradle`) while we watch the
  launcher.
8 Her face (reverse angle, Snowki in her arms): surprise → excitement (hands to her mouth) → happiness (laughing, then
  a soft smile, hand on her heart). The man walks to `END` meanwhile (off screen).
9 One composition with all four: she watches the sky with Snowki in her arms, Jessi beside her, the man at a respectful
  distance (`END`, ≈ 4.6 m away); she turns her head to him and gives one last gentle smile; insert: he smiles back; a
  slow pull back (the message back in the sky, the moon and the sea in frame); a gentle fade; the message fades and the
  final words take its place: "Happy Birthday Helen Darlu ❤️" / "Some memories never fade, and some smiles are worth
  surprising every year."; "Watch again".

## Characters (one rig each – identical everywhere)

- **Helen** (from behind facing the sea except the reverse-angle shots): South Indian, medium-brown skin, big dark-brown
  eyes, long thick black hair parted in the middle and half up with a little blue bow clip, loose locks to the waist (her
  dress, sleeves and arms stay visible from behind), tiny bindi; light-blue dress with a shirt collar and buttons, puff
  sleeves, a little white teddy print, blue belt bow, skirt to mid-calf; white sneakers. Seated with knees turned to the
  side over the wall edge; standing only in the flashback (`stand`, poses `standReceive` / `standHug`, soles at
  `Helen.STAND_GROUND`). Back view: `headTurn` / `bodyTurn` / `turnDir` / `smile`; `cradle` = Snowki in her arms.
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

## Checking your work

Serve `d:\birthday` (`python -m http.server 8765`) and use puppeteer-core with the installed Chrome. Seek with
`/film/?t=<s>` or `__film.seek(t)` (pause right after the seek for exact frames) and screenshot every scene at
1280×800 and 390×844; play the fireworks scene and the memory dissolves in real time; try `?force2d`; walk the page
(`go(n)` each step, the countdown's "Can I call Jessi?", then the film's Continue). Look for overlaps, crops,
blown-out white, off-centre subjects, holes, walkers crossing a key moment. Then commit and push – Vercel deploys
from GitHub and the user checks the live site.
