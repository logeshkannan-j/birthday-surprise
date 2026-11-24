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
