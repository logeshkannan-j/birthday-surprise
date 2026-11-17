/* ============================================================================
   "The Memories That Never Fade" – everything you may want to change lives here.
   Names, date, every line of text, timings, music and optional character art.
   ========================================================================== */
export default {
  recipient: 'Helen Darlu',        // the name in the sky and in the final lines
  date: '2026-12-01',              // her birthday (shown nowhere by default; kept here for reference)

  text: {
    wishTitle: 'Make a wish…',
    wishHint: 'Tap the candle to blow it out',
    micButton: 'or blow into your microphone',
    micListening: 'Listening… blow gently',
    micUnavailable: 'Microphone unavailable – just tap the candle',
    // one subtitle per scene (empty = no subtitle). Scene 0 is the candle.
    subtitles: {
      1: 'After the cake and the candles… a quiet night by the sea.',
      4: 'A long time ago, he gave her Snowki…'
    },
    // what Snowki and he say (cinematic subtitles at the bottom). dur = seconds on screen
    dialogue: {
      snowki1: { who: 'snowki', text: 'Why are you here? Did you come to see her?', dur: 3.5 },
      man1: { who: 'man', text: 'I came to wish her a happy birthday, just like every year.', dur: 3.6 },
      man2: { who: 'man', text: 'Every birthday, I wanted to make her smile with a little surprise. Today, I wanted to do the same.', dur: 4.8 }
    },
    // the birthday message over the fireworks (HTML script lettering). {NAME} becomes the recipient in capitals.
    skyMessage: ['HAPPY BIRTHDAY', '{NAME}'],
    skyHeart: true,                // ❤️ after the name
    finalLines: [
      'Happy Birthday {name} ❤️',
      'Some surprises are not about coming back…\nThey’re about remembering.'
    ],
    watchAgain: 'Watch again',
    continue: 'Continue',
    skip: 'Skip',
    mute: 'Sound off', unmute: 'Sound on'
  },

  // seconds per scene (scene 0 waits for the wish). Total ≈ 100 s.
  timings: { 1: 10, 2: 7, 3: 9, 4: 7, 5: 16, 6: 8, 7: 12, 8: 9, 9: 8, 10: 14 },

  // drop an mp3 here to replace the generated score (waves, wind and firework sounds stay)
  music: '/assets/music.mp3',

  // Optional: your own character art. Set e.g. helen: { src: '/assets/helen.png', height: 75, anchorX: 0.5, anchorY: 1 }
  // height is in character units (Helen seated ≈ 75, the boy standing ≈ 104, the dog sitting ≈ 41).
  // Drawn images get breathing, lighting, shadows and depth of field; the built-in rigs also get hair/cloth physics.
  assets: { helen: null, boy: null, dog: null, teddy: null },

  // Optional AI-generated video per scene (made with tools/generate-clips.mjs using Seedance 2.5 or Veo 3.1).
  // e.g. clips: { 1: 'clips/s1.mp4', 7: 'clips/s7.mp4' }. A clip replaces the painted world for that scene;
  // subtitles, the sky message sparks, light and the final lines still play on top. clips/clips.json (written by
  // the tool) is picked up automatically, so you normally leave this empty.
  clips: {},

  quality: 'auto'                  // 'auto' | 'high' | 'medium' | 'low'
};
