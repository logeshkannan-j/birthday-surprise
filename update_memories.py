"""Admin tool: build Helen's private, password-protected album from the photos and videos in  memories/

HOW TO USE
  1. Put photos and videos in the  memories  folder.
     - Files directly in memories/ form the first space ("Our memories").
     - Make a sub-folder for each extra space, e.g.  memories/College days/ ,  memories/Our trips/
  2. Run  update-memories.bat  (double-click). The first time it asks you to choose the album password.
  3. Each space gets a  space.txt  you can edit (title, concept, opening quote, and one quote per photo/video).
     Run update-memories.bat again after editing.
  4. Upload the page together with the  album  folder. NEVER upload the  memories  folder (it has the originals
     and your password in settings.txt).

  Concepts (themes) for a space:  golden, rose, midnight, ocean, garden, film, festival, rain, lavender
  Voice: the page reads each quote aloud. To use your own recorded voice for a photo instead, put an audio file
  next to it named like the photo plus ".voice", e.g.  IMG_001.jpg  ->  IMG_001.voice.m4a  (mp3/m4a/wav/ogg).

PRIVACY
  Every photo, video, quote and title is encrypted (AES-256-GCM, key from your password with PBKDF2-SHA256).
  Without the password the album files are unreadable, even on a public website.
"""
import base64, datetime, hashlib, hmac, io, json, os, re, secrets, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "memories")            # private originals
OUT = os.path.join(HERE, "album")               # encrypted output (upload this)
FILES = os.path.join(OUT, "files")
CACHE = os.path.join(SRC, ".cache")             # compressed videos + salt (private)
IMG = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".bmp"}
VID = {".mp4", ".mov", ".m4v", ".webm", ".3gp", ".mkv", ".avi"}
AUD = {".mp3", ".m4a", ".aac", ".wav", ".ogg", ".opus"}
CONCEPTS = ["golden", "rose", "midnight", "ocean", "garden", "film", "festival", "rain", "lavender"]
ITER = 150_000
CHUNK = 1 << 19                                 # streamed videos: 512 KiB encrypted chunks
STREAM_SIDE = 960                               # long side of streamed videos
MAX_SIDE, THUMB = 1600, 480

try:
    from PIL import Image, ImageOps
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except Exception:
        pass
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError as e:
    print("Missing a helper package:", e)
    print("Install once with:   py -3.11 -m pip install --user pillow cryptography imageio-ffmpeg")
    sys.exit(1)


# ------------------------------------------------------------------ small helpers
def read_kv(path):
    """key = value lines; '#' starts a comment. Returns (settings, per-file quotes)."""
    meta, quotes = {}, {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8-sig"):
            line = line.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip()
            if k.lower() in ("title", "concept", "quote", "order", "password", "hint", "voice", "cover", "reveal"):
                meta[k.lower()] = v
            else:
                quotes[k.lower()] = v
    return meta, quotes


def media_files(folder):
    out = []
    for f in os.listdir(folder):
        p = os.path.join(folder, f)
        e = os.path.splitext(f)[1].lower()
        if os.path.isfile(p) and (e in IMG or e in VID) and ".voice." not in f.lower():
            out.append(f)
    return out


DATE_PATS = [(re.compile(r"(20\d{2})(\d{2})(\d{2})"), "ymd"), (re.compile(r"(?<!\d)(1[5-7]\d{11})(?!\d)"), "ms")]


def date_of(path, name):
    """Best guess of when a photo/video was taken: EXIF, then the file name (20211130 / 1658076659909)."""
    try:
        if os.path.splitext(name)[1].lower() in IMG:
            ex = Image.open(path).getexif()
            v = ex.get(36867) or ex.get(306) or (ex.get_ifd(0x8769).get(36867) if hasattr(ex, "get_ifd") else None)
            if v:
                return datetime.datetime.strptime(str(v)[:19], "%Y:%m:%d %H:%M:%S")
    except Exception:
        pass
    for pat, kind in DATE_PATS:
        m = pat.search(name)
        if m:
            try:
                if kind == "ymd":
                    return datetime.datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
                return datetime.datetime.fromtimestamp(int(m.group(1)) / 1000)
            except ValueError:
                pass
    return None


def write_space_template(folder, files, title_default, concept_default):
    path = os.path.join(folder, "space.txt")
    meta, quotes = read_kv(path)
    new = [f for f in files if f.lower() not in quotes]
    if os.path.exists(path) and not new:
        return
    lines = []
    if not os.path.exists(path):
        lines += ["# Settings for this space of the album. Edit, save, then run update-memories.bat again.",
                  "title = " + title_default,
                  "# concept (theme): " + ", ".join(CONCEPTS),
                  "concept = " + concept_default,
                  "quote = ",
                  "# order: date (oldest first, default) or name",
                  "order = date",
                  "",
                  "# One line per photo/video: write the memory or a quote after the = (it is shown and read aloud).",
                  "# Leave it empty for no quote."]
    for f in sorted(new, key=str.lower):
        lines.append(f + " = ")
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(("\n" if os.path.exists(path) and os.path.getsize(path) else "") + "\n".join(lines) + "\n")


def settings():
    path = os.path.join(SRC, "settings.txt")
    meta, _ = read_kv(path)
    pw = os.environ.get("ALBUM_PASSWORD") or meta.get("password", "")
    if not pw:
        print("\nChoose a password for the private album (Helen will need it to open the album).")
        import getpass
        while True:
            a = getpass.getpass("  New password: ")
            b = getpass.getpass("  Type it again: ")
            if a and a == b:
                pw = a
                break
            print("  They did not match (or were empty). Try again.")
    if not os.path.exists(path) or "password" not in meta or os.environ.get("ALBUM_PASSWORD"):
        title = meta.get("title", "Our little album")
        hint = meta.get("hint", "")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("# Private album settings. Keep this folder private: never upload it.\n"
                     "title = %s\npassword = %s\n# hint: shown under the password box (optional)\nhint = %s\n" % (title, pw, hint))
        meta = read_kv(path)[0]
    if len(pw) < 6 or pw.lower() in ("change-me", "123456", "password", "54321", "12345"):
        print("  NOTE: the album password is very simple. Choose a stronger one in memories/settings.txt before publishing.")
    return pw, meta.get("title", "Our little album"), meta.get("hint", "")


class Vault:
    def __init__(self, password):
        os.makedirs(CACHE, exist_ok=True)
        sp = os.path.join(CACHE, "salt.bin")
        if not os.path.exists(sp):
            open(sp, "wb").write(secrets.token_bytes(16))
        self.salt = open(sp, "rb").read()
        self.key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), self.salt, ITER, 32)
        self.aes = AESGCM(self.key)
        self.keep = set()

    def enc(self, data):
        iv = secrets.token_bytes(12)
        return iv + self.aes.encrypt(iv, data, None)

    def put(self, data, kind):
        fid = hmac.new(self.key, (hashlib.sha256(data).hexdigest() + kind).encode(), "sha256").hexdigest()[:24]
        path = os.path.join(FILES, fid + ".bin")
        if not os.path.exists(path):
            open(path, "wb").write(self.enc(data))
        self.keep.add(fid + ".bin")
        return fid

    def put_stream(self, data, kind, cs=CHUNK):
        """Encrypt in fixed-size chunks (each with its own IV + tag) so the page can decrypt and play while downloading."""
        fid = hmac.new(self.key, (hashlib.sha256(data).hexdigest() + kind + str(cs)).encode(), "sha256").hexdigest()[:24]
        path = os.path.join(FILES, fid + ".bin")
        if not os.path.exists(path):
            with open(path + ".part", "wb") as fh:
                for k in range(0, len(data), cs):
                    fh.write(self.enc(data[k:k + cs]))
            os.replace(path + ".part", path)
        self.keep.add(fid + ".bin")
        return fid


def jpeg(im, side, q):
    im = im.copy()
    im.thumbnail((side, side), Image.LANCZOS)
    bio = io.BytesIO()
    im.save(bio, "JPEG", quality=q, optimize=True, progressive=True)
    return bio.getvalue(), im.size


def image_item(path):
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    full, (w, h) = jpeg(im, MAX_SIDE, 84)
    th, _ = jpeg(im, THUMB, 78)
    return full, th, w, h


def video_item(path):
    st = os.stat(path)
    tag = hashlib.sha1(("%s|%d|%d" % (os.path.abspath(path), st.st_size, int(st.st_mtime))).encode()).hexdigest()[:16]
    mp4 = os.path.join(CACHE, tag + ".mp4")
    jpg = os.path.join(CACHE, tag + ".jpg")
    if not os.path.exists(mp4):
        print("    compressing video (once)…", os.path.basename(path))
        tmp = mp4 + ".part.mp4"
        cmd = [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", path,
               "-vf", "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
               "-c:v", "libx264", "-preset", "medium", "-crf", "27", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0",
               "-c:a", "aac", "-b:a", "112k", "-ac", "2", "-movflags", "+faststart", tmp]
        subprocess.run(cmd, check=True)
        os.replace(tmp, mp4)
    if not os.path.exists(jpg):
        subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-ss", "1", "-i", mp4, "-frames:v", "1", "-q:v", "3", jpg], check=False)
        if not os.path.exists(jpg):
            subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", mp4, "-frames:v", "1", "-q:v", "3", jpg], check=False)
    fmp4 = os.path.join(CACHE, tag + ".s%dc.mp4" % STREAM_SIDE)
    if not os.path.exists(fmp4):
        print("    making a streamable copy…", os.path.basename(path))
        tmp = fmp4 + ".part.mp4"
        s = STREAM_SIDE
        cmd = [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", mp4,
               "-vf", "scale='if(gt(iw,ih),min(%d,iw),-2)':'if(gt(iw,ih),-2,min(%d,ih))'" % (s, s),
               "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0",
               "-maxrate", "1400k", "-bufsize", "2800k", "-force_key_frames", "expr:gte(t,n_forced*2)", "-c:a", "aac", "-b:a", "96k", "-ac", "2",
               "-movflags", "+frag_keyframe+empty_moov+default_base_moof", tmp]
        subprocess.run(cmd, check=True)
        os.replace(tmp, fmp4)
    mp4 = fmp4
    info = subprocess.run([FFMPEG, "-hide_banner", "-i", mp4], capture_output=True, text=True, errors="ignore").stderr
    m = re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", info)
    w, h = (int(m.group(1)), int(m.group(2))) if m else (1280, 720)
    d = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", info)
    dur = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3)) if d else 0
    th = None
    if os.path.exists(jpg):
        th, _ = jpeg(Image.open(jpg).convert("RGB"), THUMB, 78)
    codecs = "avc1.640028" + (", mp4a.40.2" if re.search(r"Stream #.*Audio:", info) else "")
    return open(mp4, "rb").read(), th, w, h, round(dur, 1), codecs


def voice_for(folder, name):
    base = os.path.splitext(name)[0].lower()
    for f in os.listdir(folder):
        fl = f.lower()
        if fl.startswith(base + ".voice.") and os.path.splitext(fl)[1] in AUD:
            return os.path.join(folder, f)
    return None


MIME = {".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav", ".ogg": "audio/ogg", ".opus": "audio/ogg"}


# ------------------------------------------------------------------ build
def main():
    if not os.path.isdir(SRC):
        os.makedirs(SRC)
        print("Created", SRC, "- put photos and videos there and run this again.")
        return
    password, album_title, hint = settings()
    os.makedirs(FILES, exist_ok=True)
    V = Vault(password)
    # spaces: files directly in memories/ first, then each sub-folder
    spaces = []
    root_files = media_files(SRC)
    folders = sorted([d for d in os.listdir(SRC) if os.path.isdir(os.path.join(SRC, d)) and not d.startswith(".") and d.lower() not in ("web",)], key=str.lower)
    plan = ([(SRC, root_files, "Our memories", "golden")] if root_files else []) + \
           [(os.path.join(SRC, d), media_files(os.path.join(SRC, d)), d, CONCEPTS[(i + 1) % len(CONCEPTS)]) for i, d in enumerate(folders)]
    n_img = n_vid = 0
    for folder, files, title_def, concept_def in plan:
        if not files:
            continue
        write_space_template(folder, files, title_def, concept_def)
        meta, quotes = read_kv(os.path.join(folder, "space.txt"))
        concept = meta.get("concept", concept_def).strip().lower()
        if concept not in CONCEPTS:
            print("  (unknown concept '%s' in %s; using %s)" % (concept, folder, concept_def)); concept = concept_def
        print("Space:", meta.get("title") or title_def, "(%s)" % concept, "-", len(files), "files")
        items = []
        dated = [(date_of(os.path.join(folder, f), f), f) for f in files]
        if meta.get("order", "date").lower() == "name":
            dated.sort(key=lambda x: x[1].lower())
        else:
            dated.sort(key=lambda x: (x[0] or datetime.datetime(2100, 1, 1), x[1].lower()))
        for dt, f in dated:
            p = os.path.join(folder, f)
            e = os.path.splitext(f)[1].lower()
            try:
                if e in IMG:
                    full, th, w, h = image_item(p)
                    it = {"t": "i", "id": V.put(full, "i"), "th": V.put(th, "t"), "w": w, "h": h}
                    n_img += 1
                else:
                    data, th, w, h, dur, codecs = video_item(p)
                    it = {"t": "v", "id": V.put_stream(data, "vs"), "cs": CHUNK, "mc": codecs,
                          "th": V.put(th, "t") if th else None, "w": w, "h": h, "du": dur}
                    n_vid += 1
            except Exception as ex:
                print("    skipped", f, "-", ex); continue
            q = quotes.get(f.lower(), "")
            if q:
                it["q"] = q
            if meta.get("reveal", "").lower() == f.lower():
                it["rv"] = 1   # the photo on the last page of the site ("A moment worth remembering")
            if dt:
                it["d"] = dt.strftime("%d %b %Y").lstrip("0")
            vp = voice_for(folder, f)
            if vp:
                it["vo"] = V.put(open(vp, "rb").read(), "a"); it["vm"] = MIME.get(os.path.splitext(vp)[1].lower(), "audio/mpeg")
            items.append(it)
            print("    added", f)
        if items:
            spaces.append({"title": meta.get("title") or title_def, "concept": concept, "quote": meta.get("quote", ""), "items": items})
    manifest = {"title": album_title, "spaces": spaces}
    blob = json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    pub = {"v": 2, "iter": ITER, "salt": base64.b64encode(V.salt).decode(), "check": base64.b64encode(V.enc(b"helen-album-ok")).decode(),
           "data": base64.b64encode(V.enc(blob)).decode(), "hint": hint, "files": "album/files/",
           "n": {"s": len(spaces), "i": n_img, "v": n_vid}}
    with open(os.path.join(OUT, "list.js"), "w", encoding="utf-8") as fh:
        fh.write("// generated by update_memories.py - the album itself is encrypted; do not edit by hand\nwindow.ALBUM=" + json.dumps(pub) + ";\n")
    removed = 0
    for f in os.listdir(FILES):
        if f not in V.keep:
            os.remove(os.path.join(FILES, f)); removed += 1
    # the old unencrypted wall (version 1) is no longer used
    for old in (os.path.join(SRC, "web"), os.path.join(SRC, "list.js")):
        if os.path.isdir(old):
            shutil.rmtree(old)
        elif os.path.exists(old):
            os.remove(old)
    size = sum(os.path.getsize(os.path.join(FILES, f)) for f in os.listdir(FILES)) / 1e6
    print("\nAlbum ready: %d space(s), %d photo(s), %d video(s)  ->  album/  (%.0f MB, encrypted)%s" %
          (len(spaces), n_img, n_vid, size, "; removed %d old file(s)" % removed if removed else ""))
    print("Upload the page with the 'album' folder. Keep the 'memories' folder private.")


if __name__ == "__main__":
    main()
