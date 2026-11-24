// Writes songs/list.js from whatever audio files are in the songs/ folder (the page plays them in this order).
// It runs by itself on every `git commit` (see .git/hooks/pre-commit) and by double-clicking update-songs.bat.
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'songs');
const AUDIO = /\.(mp3|m4a|aac|wav|ogg|oga|opus)$/i;
const files = readdirSync(dir).filter(f => AUDIO.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
// title = file name without extension, a leading "01 - " order number dropped; _ and - become spaces when the name has no spaces
const title = f => { let t = f.replace(AUDIO, '').replace(/^\s*\d+\s*[-_.)]\s*/, ''); if (!/\s/.test(t)) t = t.replace(/[_-]+/g, ' '); return t.trim() || f; };
const songs = files.map(f => ({ title: title(f), src: 'songs/' + encodeURIComponent(f).replace(/%2F/g, '/') }));
writeFileSync(join(dir, 'list.js'), '// written automatically by update-songs.mjs – do not edit; just drop MP3s in this folder\nwindow.SONGS = ' + JSON.stringify(songs, null, 2) + ';\n');
console.log(songs.length + ' song(s) in songs/list.js' + songs.map(s => '\n  ♪ ' + s.title).join(''));

// ---- Jessi's real recordings (optional): any audio in sounds/dog/ is used instead of the synthesised voice for that feeling.
// The feeling comes from the start of the file name: happy-1.mp3, bark.wav (= happy), excited, angry, soft, sheepish, sleepy, yelp, whine, whimper, growl, yawn, sigh, pant, howl, snore, alert, awe
import { mkdirSync, existsSync } from 'node:fs';
const ddir = join(dirname(fileURLToPath(import.meta.url)), 'sounds', 'dog'); if (!existsSync(ddir)) mkdirSync(ddir, { recursive: true });
const MOODS = ['happy', 'excited', 'angry', 'soft', 'sheepish', 'sleepy', 'yelp', 'whine', 'whimper', 'growl', 'yawn', 'sigh', 'pant', 'howl', 'snore', 'alert', 'awe'], ALIAS = { bark: 'happy', woof: 'happy', yip: 'excited', yap: 'excited', ruff: 'soft', arf: 'soft', cry: 'whine', wuff: 'soft', huff: 'sigh', breath: 'pant', panting: 'pant' };
const moodOf = f => { const w = f.toLowerCase().replace(/^[^a-z]*/, '').split(/[^a-z]+/)[0]; return MOODS.includes(w) ? w : ALIAS[w] || 'happy'; };
const dogs = readdirSync(ddir).filter(f => AUDIO.test(f)).sort().map(f => ({ mood: moodOf(f), src: 'sounds/dog/' + encodeURIComponent(f) }));
writeFileSync(join(ddir, 'list.js'), '// written automatically by update-songs.mjs – do not edit; just drop recordings in this folder\nwindow.DOGSOUNDS = ' + JSON.stringify(dogs, null, 2) + ';\n');
console.log(dogs.length + ' real dog recording(s) in sounds/dog/list.js' + dogs.map(d => '\n  🐾 ' + d.mood + ' ← ' + decodeURIComponent(d.src.split('/').pop())).join(''));
