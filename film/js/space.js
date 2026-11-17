// World space and the multiplane camera projection, shared by every renderer, rig and particle system.
// World is 1600 x 1000 units, horizon at y = HZ. An element's parallax comes from its ground-contact y ("gy"):
// screen parallax of a ground point is proportional to (gy - HZ), so f is linear in gy (true perspective for a
// translating camera). Far things (gy -> HZ) barely move; the near promenade moves fully; foreground (gy > 1000) more.
export const W0 = 1600, H0 = 1000, HZ = 470, FH = 0.12;
export const VP = [760, 482];
export const WALL = { cap: [[-300, 830], [740, 478]], base: [[-300, 1010], [745, 494]] };
const lineY = (L, x) => L[0][1] + (L[1][1] - L[0][1]) * (x - L[0][0]) / (L[1][0] - L[0][0]);
export const capY = x => lineY(WALL.cap, x), baseY = x => lineY(WALL.base, x);
export const fOf = gy => FH + (1 - FH) * (gy - HZ) / (H0 - HZ);
export const unitScale = gy => 6.8 * Math.max(gy - HZ, 1) / 530;     // world units per character unit at ground y

// where everyone is
export const PLACE = {
  helen: { x: 330, seat: capY(330) - 9, gy: baseY(330) },             // sitting on top of the sea wall
  jessi: { x: 404, seat: capY(404) - 1, gy: baseY(404) },              // sitting beside her on the wall, within reach of her hand
  boy: { x: 778, y: 628 },                                             // hidden behind the bougainvillea tree, leaning out
  boyLight: { x: 1268, y: 828 },                                       // standing by the firework crate
  launcher: { x: 1395, y: 834 },
  tree: { x: 760, y: 640 },                                           // just in front of where he hides
  planter: { x: -70, y: 900 },
  sun: { x: 470 },
  moon: { x: 205, y: HZ - 230 },                                      // upper left, over the sea
  jar: { x: 262 },                                                     // her little jar lantern on the wall
  walkFrom: { x: 1196, y: 800 }, walkTo: { x: 1050, y: 556 }
};

export class View {
  constructor() { this.cam = { x: 800, y: 500, z: 1, roll: 0, lens: 0 }; this.W = 1; this.H = 1; this.S = 1; }
  set(W, H, cam) { this.W = W; this.H = H; this.S = Math.max(W / W0, H / H0); if (cam) Object.assign(this.cam, cam); return this; }
  pf(gy) { let f = fOf(gy); if (f < 1) f = 1 - (1 - f) * (1 - 0.82 * this.cam.lens); return f; }
  zf(f) { return 1 + (this.cam.z - 1) * Math.min(f, 1.3); }
  // world point (x,y) belonging to an element standing at ground y=gy -> CSS pixels
  toScreen(x, y, gy, out = [0, 0]) {
    const f = this.pf(gy), z = this.zf(f), c = this.cam, s = this.S * z;
    let sx = (x - (800 + (c.x - 800) * f)) * s, sy = (y - (500 + (c.y - 500) * f)) * s;
    if (c.roll) { const cs = Math.cos(c.roll), sn = Math.sin(c.roll), t = sx * cs - sy * sn; sy = sx * sn + sy * cs; sx = t; }
    out[0] = sx + this.W / 2; out[1] = sy + this.H / 2; return out;
  }
  scaleAt(gy) { return this.S * this.zf(this.pf(gy)); }           // CSS px per world unit
  // inverse for a fixed gy
  toWorld(sx, sy, gy, out = [0, 0]) {
    const f = this.pf(gy), z = this.zf(f), c = this.cam, s = this.S * z;
    let dx = sx - this.W / 2, dy = sy - this.H / 2;
    if (c.roll) { const cs = Math.cos(-c.roll), sn = Math.sin(-c.roll), t = dx * cs - dy * sn; dy = dx * sn + dy * cs; dx = t; }
    out[0] = dx / s + 800 + (c.x - 800) * f; out[1] = dy / s + 500 + (c.y - 500) * f; return out;
  }
}
