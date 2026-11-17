---
name: helen-birthday-film
description: Creative direction, character sheet, architecture and verification rules for "The Memories That Never Fade", the hand-painted 2D anime birthday film for Helen Darlu in d:\birthday\film (WebGL2 shaders + painted multiplane layers, opened from the birthday page's candle step), and for Snowki the teddy and Jessi the dog on the birthday page. Use this skill whenever you touch the film or the birthday page in any way: a scene, shot, camera move, character, pose, expression, hair/cloth physics, the sea, sky, fireworks, the birthday message, dialogue, the flashback, audio, subtitles, timings, the countdown show, the Snowki guide, AI clips (Seedance / Veo), performance or phone layout. Use it even for small requests ("make her smile more", "change the last line", "he looks different here", "it's slow on my phone").
---

# The Memories That Never Fade

Two people have moved forward in life, but some memories stay precious. Snowki – the teddy he once gave her – is
the bridge between their past and present. Judge every change against this line:

> He does not need to come back into her life. He only wants to make her birthday special, as he used to.

Emotion comes from eyes and small gestures: no hug, no forced reunion, no exaggerated crying or waving.
(Chosen by the user on 2026-11-17 and refined the same day: she only watches the sea, he lights the cracker himself and leaves after seeing her happy face.)

## Where things are (read `film/README.md` for the full map)

- `film/config.js` – name (`recipient`), every line of text (subtitles, `dialogue` speech bubbles, the birthday
  message, final lines), scene timings, music path, drop-in art, optional AI clips, quality. Words live there.
- `film/js/` – `space.js` (world + positions), `world.js` (painted layers), `rigs.js` (Helen, the man), `jessi.js`
  (the dog), `snowki.js` (the teddy), `physics.js`, `particles.js` (fireworks…), `timeline.js` (scenes + camera keys),
  `film.js` (events, Snowki's path, bubbles, message, flashback, quality), `shaders.js` + `renderer-gl.js`, `renderer-2d.js`, `audio.js`.
- `guide.js` + `index.html` – the birthday page. Snowki guides her through every step; on the countdown he says hi,
  asks "Can I call Jessi?" and Jessi does tricks, sleeps and dreams of Helen. Step 7 (`go(6)`) shows the film; its
  Continue posts `{type:'film-done'}`. The album (`album/`, `update_memories.py`) is encrypted: never weaken it,
  never commit `memories/`.
- `film/tools/generate-clips.mjs` – optional Seedance 2.5 / Veo 3.1 clips. Paid: the user's key and approval only.

## Story (≈ 97 s after the wish; all at NIGHT, tod 1.72 → 1.95)

She watches the SEA the whole time (drawn from behind, `back: true`); only her reaction close-up (scene 8, `rev: true`)
shows her face – the reverse angle. She never turns to him; he sees her happy face and leaves.
0 Wish: candle on a cupcake; Snowki beside it shows her how to blow; she blows; he flies up into the story.
1 After the cake: from behind, Helen on the sea wall facing the sea and the moon; Snowki beside her, Jessi beside him.
2 Snowki turns around: someone is behind the big bougainvillea tree; he comes alive; rack focus to the tree.
3 Snowki hops down and toddles all the way along the promenade to the tree; the man looks down and smiles.
4 Flashback, warm and golden: years ago he hands Snowki to her.
5 He kneels on one knee and lifts Snowki into his arms (one forearm under him, a hand at his side). Speech bubbles: "Why are you here? Did you come to see her?" – "I came to wish her a happy birthday, just like every year." – "Some memories never really leave us, Snowki."
6 He gives Snowki the gift and sets him down; looks at her far away – she is watching the sea; goes to his crate by the tree.
7 He lights the fuse himself; one rocket climbs high on a golden trail and cracks; HAPPY BIRTHDAY / HELEN DARLU ❤️ appears suddenly with the burst (HTML), more bursts around it; Snowki is back beside her.
8 Her face: surprise (wide eyes) → excitement (hands to her mouth) → happiness (laughing, then a soft smile, hand on her heart).
9 He sees her happy face, smiles, and walks away along the promenade (looks back once).
10 Pull back: Helen, Snowki and Jessi watching the sky; he is gone; "Happy Birthday Helen Darlu ❤️" and "Some surprises are not about coming back… They're about remembering."; "Watch again".

## Characters (one rig each – identical everywhere)

- **Helen** (seen from behind facing the sea except in her reaction close-up): South Indian, medium-brown skin, big dark-brown eyes, long thick black hair parted in the middle and
  partly tied back with loose strands, tiny bindi; light-blue dress with a shirt collar and buttons, puff sleeves,
  a little white teddy print, blue belt bow, skirt to mid-calf; white sneakers. Seated with knees turned to the
  side over the wall edge; standing only in the flashback. `rigs.js` `Helen` (turn, gaze, smile, hand to chest).
- **The man**: dark curly hair, navy shirt with rolled sleeves, dark trousers, casual shoes; slightly taller than
  her. Hides, kneels, holds Snowki, talks (mouth moves), stands, signals. `rigs.js` `Boy`.
- **Snowki**: the teddy he gave her – light-blue plush, pink bow at the neck, pink heart on the belly, glossy eyes.
  Never a dog. Walks with a little toddle, talks in bubbles, carries the gift. `snowki.js`.
  (The user once wrote "black plush fur" for him while asking to keep his original look; he stays light blue –
  change `SNOWKI` colours in `snowki.js` if they ask again.)
- **Jessi**: an all-black German Shepherd (the user's photo): tall pointed ears, long muzzle, thick neck ruff, long
  bushy tail, brown eyes, pink collar with a gold tag, a soft light rim so she reads at night. `jessi.js` – the same
  rig in the film, the countdown show and the reveal page's trio (guide.js draws it there).

## Rules

- 2D only (painted layers + shaders). The user declined a 3D rebuild: real 3D would need rigged GLB characters.
- Camera keys name an anchor with its depth (`gy`). Close shots need a long lens (`lens: 0.8–1`), or the sea wall
  slides out from under her and she seems to stand in the sea.
- Characters never overlap on screen: he kneels clear of the trunk; Snowki sits between her and Jessi; check every shot.
- Seeking skips rocket launches: play scene 7 in real time to check the climb, the crack and the message.
- Exact names and text are HTML, never particles or AI video. Fireworks must not hide the moon.
- Keep it smooth on mid-range phones: quality tiers, DPR cap 2, pause when hidden, `prefers-reduced-motion`.

## Checking your work

Serve `d:\birthday` (`python -m http.server 8765`) and use puppeteer-core with the installed Chrome. Seek with
`/film/?t=<s>` or `__film.seek(t)` and screenshot every scene at 1280×800 and 390×844; play the fireworks scene in
real time (seeking skips launches); try `?force2d`; walk the page (`go(n)` each step, the countdown's
"Can I call Jessi?", then the film's Continue). Look for overlaps, blown-out white, off-centre subjects, holes.
Then commit and push – Vercel deploys from GitHub and the user checks the live site.
