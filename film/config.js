/* ============================================================================
   "Light is the only words he has" – everything you may want to change lives here.
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
      1: 'A quiet night by the sea…',
      2: 'She had no idea…',
      3: '',
      4: 'Someone came to light the sky for you…',
      5: 'Look up…',
      6: 'Her smile was enough.',
      7: ''
    },
    // the sky message: two lines so it fits phones too. {name} becomes the recipient in capitals.
    skyMessage: ['HAPPY BIRTHDAY', '{NAME}'],
    skyHeart: true,                // a heart drawn after the name
    finalLines: [
      'Happy Birthday {name} ❤️',
      'Some surprises don’t need to be seen by the person who creates them.\nSeeing you smile is enough.',
      'Stay happy. Keep smiling. Always.'
    ],
    watchAgain: 'Watch again',
    continue: 'Continue',
    skip: 'Skip',
    mute: 'Sound off', unmute: 'Sound on'
  },

  // seconds per scene (scene 0 waits for the wish). Total ≈ 100 s.
  timings: { 1: 10, 2: 12, 3: 12, 4: 10, 5: 17, 6: 8, 7: 13, 8: 18 },

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
