---
name: helen-birthday-film
description: Creative direction, character sheet, architecture and verification rules for "Light Is the Only Words He Has", the hand-painted 2D anime birthday film for Helen Darlu in d:\birthday\film (WebGL2 shaders + painted multiplane layers, opened from the birthday page's candle step). Use this skill whenever you touch the film or the birthday page in any way: a scene, shot, camera move, character, pose, expression, hair/cloth physics, the sea, sky, fireworks message, golden thread, bullet-time, audio, subtitles, timings, AI clips (Seedance / Veo), performance or phone layout. Use it even for small requests ("make her smile more", "change the last line", "he looks different here", "it's slow on my phone").
---

# Light Is the Only Words He Has

He never speaks, never approaches, and is never seen by her. Everything he feels is told through light, and the
world answers him. Judge every change against this line:

> He came only to make her birthday beautiful. He watched her smile, felt happy, and quietly walked away.

If a change makes him more visible, needier or more central than her happiness, it is the wrong change.

## Where things are (read `film/README.md` for the full map)

- `film/config.js` – name (`recipient`), every line of text, scene timings, music path, drop-in character art,
  optional AI clips, quality. Change words and timings there, never deep in code.
- `film/js/` – `space.js` (world + multiplane projection), `world.js` (painted layers), `rigs.js` (characters),
  `physics.js` (wind, Verlet), `particles.js` (fireworks, thread, petals…), `timeline.js` (scenes + camera keys),
  `film.js` (events, input, quality), `shaders.js` + `renderer-gl.js` (WebGL2), `renderer-2d.js` (fallback), `audio.js`.
- `film/js/snowki.js` + `guide.js` – Snowki, the magical teddy. ONE rig used by the page guide (every step, from the
  countdown) and by the film. Change his look there and both follow.
- `index.html` – the birthday page. Step 7 (`go(6)`) shows the film in `#film`; the film's Continue posts
  `{type:'film-done'}` and the page goes to the reveal. The album (`album/`, `update_memories.py`) is separate and
  encrypted: never weaken it, never commit `memories/`.
- `film/tools/generate-clips.mjs` + `clip-prompts.json` – optional Seedance 2.5 / Veo 3.1 clips into `film/clips/`.
  Paid APIs need the user's key and approval; never send real photos of people.

## Story (master timeline, ~100 s after the wish)

Everything happens at NIGHT (tod 1.72 → 2.0; never day or sunset). Snowki is the magical one.
0 Wish: one candle on a cupcake; Snowki sits beside it, points at the flame and shows her how to blow; tap or microphone blows it out; he cheers and flies up into the story.
1 A quiet night by the sea: moon low over the water, string lights, her jar lantern; slow dolly to Helen seated on the sea wall, Snowki in her lap, Jessi beside her on the wall.
2 Her laugh and her petting send plankton rings over the sea; Snowki winks at us; then he slips out of her lap (to her left, never across her face) and rises above her.
3 Snowki flies along the promenade to the boy under the bougainvillea; he smiles and reaches out; Snowki touches his hand; the golden thread appears between them.
4 He lights the crate while Snowki hides his eyes on top of it; rockets climb on golden trails; Snowki races after them and back to her lap.
5 The sparks spell HAPPY BIRTHDAY / HELEN DARLU ♥; "Look up…"; she and Snowki look up; bullet-time (1 → 0.05 → 1, heartbeat) on her shining eyes; lanterns, aurora, the sea mirrors it.
6 At the tree, lit by the glow, he smiles because she smiles. 7 He walks away under the lamps and looks back once; in her lap Snowki waves goodbye for her, then hugs her arm.
8 Pull up from her to the night sky; the thread becomes stars that draw a heart; the three final lines; "Watch again".

## Look

Painterly 2D anime (Shinkai / Ghibli feeling): gouache backgrounds, soft cel shading, thin warm outlines.
Palette peach #FFB88C, gold #FFD27A, pink #FF9EC4, lavender #B9A3FF, sky blue #8EC9FF, dusk #2A1B4D, navy #0B1030.
Night lighting: cool moonlight rim from the moon low over the sea (behind her), warm practical lights (her jar
lantern, lamps, string lights, tea cart), fireworks, and Snowki's own glow; painted layers get warm light pools.
Wind is one field: gusts travel
from the sea across the planter tree, Helen's hair, the big tree and his shirt, in that order.

## Characters (one rig each – identical in every scene)

- **Snowki** (the magical one): light-blue plush teddy, pink bow at the neck, embroidered pink heart on the belly,
  glossy button eyes. Always drawn by `film/js/snowki.js`. Expressive (wink, love eyes, covers his eyes, waves).
- **Helen** (seated on the sea wall, knees turned to the side over its edge): long straight black hair with a small pink bow (Verlet strands + side locks),
  big dark-brown anime eyes, pastel-blue birthday dress with puff sleeves, white collar, pink sash with ribbon tails,
  lace hem, white shoes; Snowki (light-blue teddy, pink bow) in her lap. Expressions: calm, joyful, surprised, teary-happy.
- **The boy** (never named on screen): curly black hair, white shirt with rolled sleeves, dark trousers. No teddy of
  his own: Snowki (already hers) is his presence by her side. Expressions: watching, contentment, farewell.
- **Jessi**: black Labrador sitting beside her on the wall; tail wag, ear twitch, looks up at the fireworks, closes
  her eyes when petted.

## Rules

- Strictly 2D: painted layers + shaders. No 3D models or three.js.
- Camera keys name an anchor with its depth (`gy`); `timeline.cameraAt` converts position and zoom through that
  depth. When you add a shot, give the anchor a `gy` or the subject will be off-centre.
- Close shots need a long lens (`lens: 0.8–1` on the key). With lens 0 the near sea wall slides out from under her
  and she looks like she is standing in the sea.
- Characters never overlap on screen: Snowki floats beside the boy (not in front of him), perches on the far side of
  the crate from his lighter, and leaves her lap to the side. Check every shot for this.
- Parallax comes from ground depth: billboards must be painted standing on their own `gy`; things that need to hide
  each other must be at similar depths.
- Keep it smooth on mid-range phones: quality tiers, DPR cap 2, pause when hidden, `prefers-reduced-motion`.
- Exact names and text are drawn by the film (sparks, HTML), never by AI video.

## Checking your work

Serve `d:\birthday` (`python -m http.server 8765`) and use puppeteer-core with the installed Chrome (check the page
guide too: every step at 1280×800 and 390×844, tapping and dragging Snowki):
seek with `/film/?t=<s>` or `__film.seek(t)`, screenshot key frames of every scene at 1280×800 and 390×844, check
`__film.state.timeScale` through bullet-time, try `?force2d`, and walk the page (`go(n)` for each step, then the
film's Continue). Look for blown-out white (post too strong), subjects off-centre, and holes in painted layers.
Then commit and push – Vercel deploys from GitHub and the user checks the live site.
