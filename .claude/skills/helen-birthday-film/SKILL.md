---
name: helen-birthday-film
description: Creative direction, character sheet, architecture and verification rules for "The Memories That Never Fade", the hand-painted 2D anime birthday film for Helen Darlu in d:\birthday\film (WebGL2 shaders + painted multiplane layers, opened from the birthday page's candle step), and for Snowki the teddy and Jessi the dog on the birthday page. Use this skill whenever you touch the film or the birthday page in any way: a scene, shot, camera move, character, pose, expression, hair/cloth physics, the sea, sky, fireworks, the birthday message, dialogue, the flashback, audio, subtitles, timings, the countdown show, the Snowki guide, AI clips (Seedance / Veo), performance or phone layout. Use it even for small requests ("make her smile more", "change the last line", "he looks different here", "it's slow on my phone").
---

# The Memories That Never Fade

Two people have moved forward in life, but some memories stay precious. Snowki – the teddy he once gave her – is
the bridge between their past and present. Judge every change against this line:

> He does not need to come back into her life. He only wants to make her birthday special, as he used to.

Emotion comes from eyes and small gestures: no hug, no forced reunion, no exaggerated crying or waving.
(The user chose this story on 2026-11-17, replacing "Light Is the Only Words He Has", where she never saw him.)

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

## Story (≈ 92 s after the wish; all at NIGHT, tod 1.72 → 1.95)

0 Wish: candle on a cupcake; Snowki beside it shows her how to blow; she blows; he flies up into the story.
1 After the cake: moonlit sea wall; Helen sits looking at the sea, Snowki in her lap, Jessi (black Labrador) beside her; wide shot → her side.
2 Snowki notices someone behind the bougainvillea tree: close-up on his eyes, he comes alive (a little glow), rack focus to the tree.
3 Snowki slips off her lap and toddles along the promenade to the tree; the man (one hand on the trunk, a small gift in the other) looks down and smiles.
4 Flashback, warm and golden: years ago he hands Snowki to her; she receives him with both hands, happy.
5 He steps out, kneels, picks Snowki up. Snowki: "Why are you here? Did you come to see her?" He: "I came to wish her a happy birthday, just like every year." Then, looking at her: "Some memories never really leave us, Snowki."
6 He stands. Helen notices: eyes first, then her head; a pause; a small natural smile. His gentle smile. Two-shot.
7 He gives Snowki the gift and sets him down; Snowki carries it back to her; he signals; rockets rise from far along the beach and burst over the sea; HAPPY BIRTHDAY / HELEN DARLU ❤️ writes itself in glowing script (HTML, never particles).
8 Her reaction: she looks up, firework light in her eyes, a slow smile, hand on her heart; Snowki back in her lap with the gift.
9 Slow pull back: Helen, Snowki, Jessi, the man by the tree, fireworks still sparkling; "Happy Birthday Helen Darlu ❤️" and "Some surprises are not about coming back… They're about remembering."; fade; "Watch again".

## Characters (one rig each – identical everywhere)

- **Helen**: South Indian, medium-brown skin, big dark-brown eyes, long thick black hair parted in the middle and
  partly tied back with loose strands, tiny bindi; light-blue dress with a shirt collar and buttons, puff sleeves,
  a little white teddy print, blue belt bow, skirt to mid-calf; white sneakers. Seated with knees turned to the
  side over the wall edge; standing only in the flashback. `rigs.js` `Helen` (turn, gaze, smile, hand to chest).
- **The man**: dark curly hair, navy shirt with rolled sleeves, dark trousers, casual shoes; slightly taller than
  her. Hides, kneels, holds Snowki, talks (mouth moves), stands, signals. `rigs.js` `Boy`.
- **Snowki**: the teddy he gave her – light-blue plush, pink bow at the neck, pink heart on the belly, glossy eyes.
  Never a dog. Walks with a little toddle, talks in bubbles, carries the gift. `snowki.js`.
  (The user once wrote "black plush fur" for him while asking to keep his original look; he stays light blue –
  change `SNOWKI` colours in `snowki.js` if they ask again.)
- **Jessi**: black Labrador, floppy ears, pink collar with a gold tag, kind brown eyes, soft light rim so she reads
  at night. `jessi.js` (also the countdown show).

## Rules

- 2D only (painted layers + shaders). The user declined a 3D rebuild: real 3D would need rigged GLB characters.
- Camera keys name an anchor with its depth (`gy`). Close shots need a long lens (`lens: 0.8–1`), or the sea wall
  slides out from under her and she seems to stand in the sea.
- Characters never overlap on screen: he kneels clear of the trunk; Snowki leaves her lap to the side; check every shot.
- Exact names and text are HTML, never particles or AI video. Fireworks must not hide the moon.
- Keep it smooth on mid-range phones: quality tiers, DPR cap 2, pause when hidden, `prefers-reduced-motion`.

## Checking your work

Serve `d:\birthday` (`python -m http.server 8765`) and use puppeteer-core with the installed Chrome. Seek with
`/film/?t=<s>` or `__film.seek(t)` and screenshot every scene at 1280×800 and 390×844; play the fireworks scene in
real time (seeking skips launches); try `?force2d`; walk the page (`go(n)` each step, the countdown's
"Can I call Jessi?", then the film's Continue). Look for overlaps, blown-out white, off-centre subjects, holes.
Then commit and push – Vercel deploys from GitHub and the user checks the live site.
