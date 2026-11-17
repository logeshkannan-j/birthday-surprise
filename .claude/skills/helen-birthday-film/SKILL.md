---
name: helen-birthday-film
description: Creative direction, character sheet and build rules for "Happy Birthday Helen Darlu", the cinematic 2D anime-style birthday website in d:\birthday (index.html). Use this skill whenever you touch that site in any way: adding, changing or reviewing a scene, animation, character, background, story beat, text, music, transition, the seaside story, the fireworks sky message, converting the old 3D scenes to 2D, fixing bugs in a scene, or checking how it looks on a phone. Use it even when the request is small ("make her hair move more", "change the last line", "the boy looks different here"). The site's story, look and characters must stay consistent across sessions, and this file is where they are defined.
---

# Happy Birthday Helen Darlu: the film

The site is an interactive animated short film, not a birthday template. Everything you build serves one feeling:

> He came only to make her birthday beautiful. He watched her smile, felt happy, and quietly walked away.

Keep that sentence in mind for every decision. If a change makes the boy more visible, more needy or more central than Helen's happiness, it is the wrong change. He never approaches her, never reveals himself, never expects anything back.

## Where things are

- `index.html`: the whole page (HTML, CSS, JS in one file). `CONFIG` near the top of the main script holds names (`to: "Helensnowfia"`, `from: "Logesh"`, bear `Snowki`, dog `Jessi`), the unlock date and the texts. Change words there, not deep in scene code.
- `album/` + `update_memories.py`: the private, encrypted photo album. Never weaken its encryption, never commit `memories/` (the originals and the password).
- `models/`: the old 3D GLB models. The 3D scenes are being replaced by 2D; once nothing loads them, remove the files and the `MODEL_URLS` preload block so visitors stop downloading 3.6 MB.
- `ref/`: the reference video. To study it, extract frames with ffmpeg (from `imageio_ffmpeg`) into the scratchpad and look at them; keep them local, they are private.
- Historically the page was assembled by a build pipeline in a Claude session scratchpad (`build/template.html` + `build/build.py`). Check whether it still exists before relying on it; if it is gone, edit `index.html` directly. Before overwriting `index.html`, keep a dated backup in the scratchpad.

## The story (scene by scene)

The existing chapters stay, but they now live inside one continuous seaside world at golden hour, so the visitor never feels a "slide change". Default mapping (adjust only if the user asks):

| Existing chapter | Becomes |
|---|---|
| Countdown (before 1 Dec) | Night sea, stars, a lone lamp on the promenade; numbers glow softly. Calm, waiting. |
| Envelope (press and hold) | A letter tucked under a stone on the sea wall; holding it opens it as the sun starts to rise into golden hour. |
| Greeting | **Scene 1**: wide aerial pan over the curved promenade (waves, birds, balloons, decorations, people), camera drifting towards Helen. |
| Memories / Past (album button) | **Scene 2**: Helen on the sea wall with Jessi and Snowki, petting the dog, smiling. The album opens from here, and her happiness frames it. |
| Clock / Today / Wishes | **Scene 3**: the boy arrives quietly behind a bougainvillea tree; close-ups of him watching, smiling because she is happy. The wish lines appear as the soft lyric-style subtitles. |
| Candle (blow it out, mic optional) | Helen's small cake on the wall. When she blows the candle out, that is his cue: **Scene 4**, fireworks rise in slow motion and write **HAPPY BIRTHDAY HELEN DARLU ❤️** in sparkling light across the sky. |
| Reveal | **Scene 5**: Helen looks up, eyes shining, Jessi looks too, light reflects on the sea. **Scene 6**: close-up of him far away, gently smiling. **Scene 7**: he turns and walks away along the promenade, silhouette against the sunset, wind in his shirt, one look back, a smile, gone. **Scene 8**: night sky, stars, soft fireworks, calm ocean, the final words and a glowing heart. Then a quiet Replay. |

Final words (Scene 8), exactly:
- "Happy Birthday Helen Darlu ❤️"
- "Some surprises don't need to be seen by the person who creates them. Seeing you smile is enough."
- "Stay happy. Keep smiling. Always."

## Visual style (from the reference video)

Flat, painterly 2D like a modern animated feature: clean shapes, soft gradients, gentle grain, no outlines on backgrounds, thin dark shape-edges on characters.

- **Light**: low golden sun, warm rim light on hair and shoulders, long soft shadows, sun glints sparkling on the water, light rays and bloom near the sun.
- **Palette**: sky peach `#FBD3B0` → pink `#F6B7C6` → lavender `#C9B6E4`; sun `#FFF1C9`; sea turquoise `#3FB8C2` / deep `#1F7E9A`; promenade stone `#E8C7B5` with violet shadows `#9C7BA8`; bougainvillea magenta `#E2447C`; leaves `#3E8E5A`/`#8CC56B`; night `#1B1236` → `#3A2363`.
- **World details**: curved seaside promenade with a low stone sea wall, bougainvillea trees, string lights, a colourful tea cart and a balloon seller, kites, gulls, small fishing boats, pastel city buildings in the distance, kids playing. Background people are simple and soft, never sharper than Helen.
- **Depth**: 3–5 parallax layers per scene (sky, far city/sea, mid promenade, near foliage); foreground leaves or blurred passers-by frame shots, as the reference does.
- **Camera**: slow pans, push-ins, close-ups of eyes and hands, rack-focus (blur the layer that isn't the subject). Never jump-cut harshly; cross-fade, wipe with foliage, or move the camera.
- **Motion**: wind always present (hair, saree pallu, shirt, leaves, kite tails), waves rolling, floating particles and sparkles, balloons bobbing.
- **Text**: lyric-style subtitles, centred in the lower third, a soft serif (the page already loads Instrument Serif), white with a faint shadow and a thin underline that draws in. No buttons or UI in the frame unless they are needed to continue.

Take inspiration from the reference; don't copy its frames, lyrics or song.

## Characters: keep them identical in every scene

Consistency is the thing most likely to break, so each character is drawn by exactly one function (one module, e.g. `chars.js` or one section of the script), and every scene calls it with parameters such as `{view: 'front'|'side'|'back'|'closeup', pose, expression, wind, scale}`. Never redraw a character's parts inline in a scene. If a scene needs a new pose, add it to the character function so every scene benefits.

**Helen** (the heart of the film)
- Warm medium-brown skin; soft oval face; large dark-brown eyes with lashes; small nose; gentle smile.
- Very long, straight, glossy black hair to the waist, loose, moving in the wind, with a warm rim light.
- Royal-blue saree `#2F3FB8` with a thin gold border `#D9A441`, pallu flowing behind in the wind; matching blouse.
- Gold jhumka earrings, gold bangles on her right wrist, a small brown sling bag `#8A5A36`.
- Expressions: content smile, laughing, eyes closed in the breeze, looking up in wonder (Scene 5), eyes glistening.
- She never sees the boy.

**The boy** (Logesh, never named on screen)
- Warm brown skin; curly, voluminous black hair; thick brows; expressive eyes.
- White shirt `#F4F1EA` with sleeves rolled to the elbow, dark trousers `#2B2F3A`, dark shoes.
- Carries Snowki and the firework box only while preparing; empty-handed when he leaves.
- Expressions: quiet, soft smile, eyes a little emotional but peaceful. Never sad-dramatic.

**Jessi** (Helen's dog): black Labrador-like dog, glossy coat, friendly face, wagging tail, sits beside Helen and looks where she looks.

**Snowki** (teddy): light-blue teddy bear with a pink bow, soft round shapes.

## Build rules

- **Keep everything that works**: countdown and unlock date, envelope, greeting, the private album (password, streaming videos, quotes, voice), memories wall, clock, wishes, candle blowing (button and optional microphone), reveal, background music with the Sound on/off toggle, admin panel ✦, replay. Moving them into the new world is fine; deleting them is not.
- **2D only, drawn in code**: SVG or Canvas 2D with gradients, blur and grain. No 3D for new work; the old three.js scenes are being retired. No external image downloads of characters.
- **Performance**: smooth on a mid-range phone. One `requestAnimationFrame` loop for the active scene only; pause scenes that are off screen; cap particles (around 150 on phones); pre-render static layers to offscreen canvases; respect `prefers-reduced-motion` with gentle fades instead of motion. Keep the first screen fast (the page is small now, so keep heavy work after first paint).
- **Responsive**: design every shot for both landscape (1280×800) and portrait phone (390×844). In portrait, re-frame (zoom on the subject, move text) rather than squashing.
- **Fewer controls**: avoid extra buttons. Scenes advance by timing, tap/scroll, or the story's own action (holding the letter, blowing the candle).
- **Music**: keep the existing music system and its mute toggle; fade it with the scene mood (swell for the fireworks, soft for the goodbye).

## Don'ts

- Don't make it look like a birthday template (no confetti-and-card layouts, no static slides with text).
- Don't change how a character looks between scenes.
- Don't let the boy approach, touch, speak to or be noticed by Helen.
- Don't put her photos or the album anywhere outside the encrypted album, and don't send them to outside services.

## Checking your work

Before saying a change is done:
1. Serve `d:\birthday` locally (`python -m http.server`) and walk the whole story in headless Chrome (puppeteer-core with the installed Chrome), screenshotting every scene at 1280×800 and 390×844.
2. Put the character close-ups from different scenes side by side and check they really match (hair, saree colour and border, jewellery, shirt).
3. Watch the frame rate during the fireworks and the busiest pans; fix anything that stutters.
4. Confirm the album still opens with its password and plays a video, and that the Sound toggle and Replay work.
5. Then commit and push: the live site (Vercel, auto-deploys from GitHub) is where the user looks.
