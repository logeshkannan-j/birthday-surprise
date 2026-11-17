#!/usr/bin/env node
// Generate optional AI clips for the film with Seedance 2.5 (BytePlus ModelArk) or Veo 3.1 (Gemini API).
// Clips are saved to film/clips/s<N>.mp4 and listed in film/clips/clips.json, which the film picks up automatically.
//
//   ARK_API_KEY=...    node film/tools/generate-clips.mjs --provider seedance --scenes 1,2,3
//   GEMINI_API_KEY=... node film/tools/generate-clips.mjs --provider veo --scenes all
//
// Options:
//   --provider seedance|veo     which model to use (default seedance)
//   --scenes 1,2,5|all          which scenes (default all)
//   --resolution 720p|1080p     (default 720p)
//   --ref name=path.png         optional reference image(s), e.g. a character sheet you drew. Repeatable.
//                               Privacy: never pass real photos of people without their consent.
//   --dry                       print the requests without sending anything
// Model IDs can be overridden with SEEDANCE_MODEL / VEO_MODEL. Paid APIs: each second of video is billed.
// The request formats follow the providers' public docs as of Nov 2026 – check them if a call is rejected.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(HERE, '..', 'clips');
// keys can live in film/tools/.env (KEY=value lines; ignored by git and never deployed)
try { for (const line of fs.readFileSync(path.join(HERE, '.env'), 'utf8').split('\n')) { const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch (e) {}
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const provider = opt('provider', 'seedance'), resolution = opt('resolution', '720p'), dry = args.includes('--dry');
const refs = []; args.forEach((a, i) => { if (a === '--ref') { const [name, p] = args[i + 1].split('='); refs.push({ name, path: p }); } });
const P = JSON.parse(fs.readFileSync(path.join(HERE, 'clip-prompts.json'), 'utf8'));
const which = opt('scenes', 'all'), scenes = which === 'all' ? Object.keys(P.scenes) : which.split(',').map(s => s.trim());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const full = s => `${s.prompt}\n\nStyle: ${P.style}\n\nCharacters: ${P.characters}`;
const mime = p => (/\.png$/i.test(p) ? 'image/png' : /\.webp$/i.test(p) ? 'image/webp' : 'image/jpeg');
const b64 = p => fs.readFileSync(p).toString('base64');

// ---------------------------------------------------------------- Seedance 2.5 (BytePlus ModelArk)
async function seedance(n, s) {
  const key = process.env.ARK_API_KEY, base = process.env.ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3';
  const model = process.env.SEEDANCE_MODEL || 'dreamina-seedance-2-5-260628';
  const content = [{ type: 'text', text: full(s) + `\nAvoid: ${P.negative}` }];
  for (const r of refs) content.push({ type: 'image_url', image_url: { url: `data:${mime(r.path)};base64,${b64(r.path)}` }, role: 'reference_image' });
  const body = { model, content, duration: Math.max(4, Math.min(30, Math.round(s.seconds))), resolution, ratio: '16:9', generate_audio: false, watermark: false };
  if (dry) return console.log(`[seedance] scene ${n}`, JSON.stringify({ ...body, content: content.map(c => (c.type === 'text' ? c : { ...c, image_url: '<image>' })) }, null, 1));
  if (!key) throw new Error('Set ARK_API_KEY (BytePlus ModelArk API key).');
  const h = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const r = await fetch(`${base}/contents/generations/tasks`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok || !j.id) throw new Error(`create failed ${r.status}: ${JSON.stringify(j)}`);
  console.log(`  task ${j.id}`);
  for (;;) {
    await sleep(8000);
    const q = await (await fetch(`${base}/contents/generations/tasks/${j.id}`, { headers: h })).json();
    if (q.status === 'succeeded') return q.content && q.content.video_url;
    if (['failed', 'cancelled', 'expired'].includes(q.status)) throw new Error(`task ${q.status}: ${JSON.stringify(q.error || q)}`);
    process.stdout.write(`  ${q.status || 'waiting'}…\r`);
  }
}

// ---------------------------------------------------------------- Veo 3.1 (Gemini API)
async function veo(n, s) {
  const key = process.env.GEMINI_API_KEY, base = 'https://generativelanguage.googleapis.com/v1beta', model = process.env.VEO_MODEL || 'veo-3.1-generate-preview';
  const inst = { prompt: full(s) };
  if (refs.length) inst.referenceImages = refs.slice(0, 3).map(r => ({ image: { bytesBase64Encoded: b64(r.path), mimeType: mime(r.path) }, referenceType: 'asset' }));
  // Veo makes 4, 6 or 8 second clips (8 when reference images are used); the film holds the last frame for longer scenes
  const secs = refs.length ? 8 : s.seconds >= 7 ? 8 : s.seconds >= 5 ? 6 : 4;
  const body = { instances: [inst], parameters: { aspectRatio: '16:9', resolution, durationSeconds: secs, negativePrompt: P.negative, personGeneration: 'allow_adult' } };
  if (dry) return console.log(`[veo] scene ${n}`, JSON.stringify({ ...body, instances: [{ prompt: inst.prompt, referenceImages: inst.referenceImages ? `${inst.referenceImages.length} image(s)` : undefined }] }, null, 1));
  if (!key) throw new Error('Set GEMINI_API_KEY (Google AI Studio key with billing enabled).');
  const h = { 'x-goog-api-key': key, 'Content-Type': 'application/json' };
  const r = await fetch(`${base}/models/${model}:predictLongRunning`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok || !j.name) throw new Error(`create failed ${r.status}: ${JSON.stringify(j)}`);
  console.log(`  operation ${j.name}`);
  for (;;) {
    await sleep(10000);
    const q = await (await fetch(`${base}/${j.name}`, { headers: h })).json();
    if (q.error) throw new Error(JSON.stringify(q.error));
    if (q.done) { const v = q.response?.generateVideoResponse?.generatedSamples?.[0]?.video; if (!v?.uri) throw new Error('no video in response: ' + JSON.stringify(q.response)); return { url: v.uri, headers: { 'x-goog-api-key': key } }; }
    process.stdout.write('  generating…\r');
  }
}

// ---------------------------------------------------------------- run
fs.mkdirSync(OUT, { recursive: true });
const manifestPath = path.join(OUT, 'clips.json'), manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
for (const n of scenes) {
  const s = P.scenes[n]; if (!s) { console.warn(`no prompt for scene ${n}`); continue; }
  console.log(`scene ${n} (${provider})`);
  try {
    const res = provider === 'veo' ? await veo(n, s) : await seedance(n, s);
    if (dry || !res) continue;
    const { url, headers } = typeof res === 'string' ? { url: res, headers: {} } : res;
    const v = await fetch(url, { headers, redirect: 'follow' }); if (!v.ok) throw new Error(`download failed ${v.status}`);
    const file = path.join(OUT, `s${n}.mp4`); fs.writeFileSync(file, Buffer.from(await v.arrayBuffer()));
    manifest[n] = `clips/s${n}.mp4`; fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`  saved ${path.relative(process.cwd(), file)}`);
  } catch (e) { console.error(`  scene ${n} failed: ${e.message}`); }
}
console.log('done. Remove a scene from clips/clips.json to go back to the painted version of that scene.');
