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

// The promenade as a floor plan: X = metres-ish sideways (0 = the camera axis, the sea wall's inner face is X ≈ -5.5,
// + is towards the town side), Z = depth from the camera. 1 unit ≈ 0.55 m (the man is ≈ 3.3 units tall); one character
// unit is CU units everywhere. A ground point (x, gy) and (X, Z) convert exactly (the same mapping the sea ripples use).
export const ZK = 2400, XK = 900, CU = 6.8 * ZK / (530 * XK);
export const toXZ = (x, gy) => { const Z = ZK / Math.max(gy - HZ, 0.5); return [(x - 800) * Z / XK, Z]; };
export const fromXZ = (X, Z) => [800 + X * XK / Z, HZ + ZK / Z];

// the big bougainvillea tree, in character units around its trunk base (shared by world.js and the man's hiding pose)
export const TREE = { x: 1360, gy: 578, h: 318, trunkW: 40, chestW: 38, canopy: [-160, -318, 240, -110] };
const tu = unitScale(TREE.gy), tw = (lx, ly) => [TREE.x + lx * tu, TREE.gy + ly * tu];

// where everyone is. Helen on the wall (X -5.5, Z 10.5); the man ≈ 12 m away along the promenade behind his tree
// (X 13.8, Z 22); the launcher ≈ 11 m from him and 13 m from her, at the far end of the promenade by the sea wall
// (X -3.5, Z 34), so rockets go up over the water. See scratchpad plan/world_layout.md.
export const PLACE = {
  helen: { x: 330, seat: capY(330) - 9, gy: baseY(330) },             // sitting on top of the sea wall
  jessi: { x: 444, seat: capY(444) - 1, gy: baseY(444) },              // sitting beside her on the wall, within reach of her hand
  tree: { x: TREE.x, y: TREE.gy,                                       // trunk base (ground contact) of the big bougainvillea
    hand: tw(-20.3, -75),                                              // on the painted trunk's left edge (TRUNK in world.js) at his shoulder height: his fingers come round it
    trunk: [tw(-TREE.chestW / 2, -70)[0], tw(TREE.chestW / 2, -70)[0]], // trunk edges (world x) at chest height
    canopy: [tw(TREE.canopy[0], 0)[0], tw(0, TREE.canopy[1])[1], tw(TREE.canopy[2], 0)[0], tw(0, TREE.canopy[3])[1]] },  // world box petals fall from
  boy: { x: TREE.x - 8 * tu, y: TREE.gy - 4 },                         // hidden right behind the trunk (deeper than it), leaning out on its left
  meet: { x: 1288, y: 592 },                                           // stepped out, kneeling for Snowki in front-left of the tree, clear of the trunk
  boyLight: { x: 1250, y: 586 },                                       // kneeling at the end of the long fuse, by his tree
  launcher: { x: 706, y: 541 },                                        // the firework launcher: far end of the promenade, inside the sea wall
  fuse: [[1236, 587], [1130, 578], [1010, 566], [890, 555], [790, 547], [722, 542]],   // ground points (x, gy) of a fuse cord from his hand to the launcher
  stay: { x: 1296, y: 590 },                                           // where he can stand at a respectful distance for the ending
  away: { x: 1155, y: 533 },                                           // if he walks away: deeper along the promenade, left of the tree
  planter: { x: -70, y: 900 },
  sun: { x: 470 },
  moon: { x: 205, y: HZ - 230 },                                      // upper left, over the sea
  jar: { x: 262 },                                                     // her little jar lantern on the wall
  party: { cake: 206, gift: 156 },                                     // on the wall left of her: the cake by her jar lantern, the presents with the balloons by the lamp
  walkFrom: { x: 1250, y: 586 }, walkTo: { x: 1155, y: 533 }
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
