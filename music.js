// The page's music (window.Music): a plain playlist of every song in the songs/ folder (songs/list.js is written
// automatically by update-songs.mjs, see songs/README.txt). Nothing else is ever played.
// Music.play() / Music.stop(slow) / Music.next() / Music.count / Music.title / Music.onchange = title => …
(function () {
  const M = { onchange: null, count: 0, get title() { return list[idx] ? list[idx].title : ''; } };
  let list = [], idx = -1, el = null, playing = false, fade = null;
  const clean = x => (x && x.src ? { title: x.title || x.src.split('/').pop().replace(/\.[a-z0-9]+$/i, ''), src: x.src } : null);
  function setSongs(a) { list = (Array.isArray(a) ? a : []).map(clean).filter(Boolean); M.count = list.length; }
  M.setSongs = setSongs;
  function kill() { clearInterval(fade); if (el) { el.onended = el.onerror = null; el.pause(); el.removeAttribute('src'); try { el.load(); } catch (e) {} el = null; } }
  function begin(i, bad) {
    kill(); if (!list.length) return;
    idx = ((i % list.length) + list.length) % list.length;
    if (bad >= list.length) return;                       // every file failed to load: stop trying
    el = new Audio(list[idx].src); el.preload = 'auto'; el.volume = 0.85;
    el.onended = () => { if (playing) begin(idx + 1); };
    el.onerror = () => { if (playing) begin(idx + 1, (bad || 0) + 1); };
    el.play().catch(() => {});
    if (M.onchange) M.onchange(M.title);
  }
  M.play = () => {
    if (!list.length) return;
    playing = true;
    if (!el) begin(idx < 0 ? 0 : idx);
    else { clearInterval(fade); el.volume = 0.85; if (el.paused) el.play().catch(() => {}); }
  };
  M.stop = slow => {
    if (!playing) return; playing = false;
    if (!el) return;
    const e = el; clearInterval(fade);
    if (!slow) { e.pause(); return; }
    fade = setInterval(() => { e.volume = Math.max(0, e.volume - 0.06); if (e.volume <= 0.001) { clearInterval(fade); e.pause(); } }, 90);
  };
  M.next = () => { if (playing) begin(idx + 1); };
  if (Array.isArray(window.SONGS)) setSongs(window.SONGS);
  window.Music = M;
})();
