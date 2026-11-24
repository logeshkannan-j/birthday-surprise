// A real walking cycle for the 2D rigs: one function per leg, so a foot is planted on the ground and slides back at exactly the
// speed the body moves, the heel strikes first, the heel rises before the toe leaves, and the swing foot clears the ground.
// Used by the man (rigs.js), Helen (rigs.js) and the people on the promenade (crowd.js).
//
//   foot(u, S, lift)   u = 0..1 (one stride, 0 = heel strike), S = how far the planted foot travels back (units),
//                      lift = swing clearance. -> { x: forward of the hip (+), y: ankle rise above standing height (+ up),
//                      p: foot pitch in rad (+ toes up), st: planted, v: 0..1 along the stance }
//   hipRise(L, dxMax)  hip height above the ankles for legs of total length L when the most extended planted foot is dxMax
//                      away from its hip (inverted pendulum with soft knees: they bend a little more at mid-stance)
//   armSwing(u, side, amp) shoulder / elbow angles for an arm that swings opposite its leg
import { clamp } from './core.js';
const ss = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => a + (b - a) * t;
export const DUTY = 0.6;

export function foot(u, S, lift, duty = DUTY) {
  u = ((u % 1) + 1) % 1;
  if (u < duty) {
    const v = u / duty, hs = Math.max(0, 1 - v / 0.2), to = ss((v - 0.6) / 0.4);
    return { x: S / 2 - S * v, y: 0.9 * to * to + 2.2 * to * ss((v - 0.78) / 0.22), p: 0.32 * hs * hs - 0.62 * to, st: true, v };
  }
  const w = (u - duty) / (1 - duty), sw = ss(Math.pow(w, 0.85));
  const p = w < 0.55 ? mix(-0.62, 0.05, ss(w / 0.55)) : mix(0.05, 0.32, ss((w - 0.55) / 0.45));
  return { x: -S / 2 + S * sw, y: 3.1 * (1 - ss(w / 0.5)) + lift * Math.sin(Math.PI * Math.pow(w, 0.72)), p, st: false, v: 1 };
}

export function hipRise(L, dxMax, soft = 0.03) { const Lc = L * (0.99 - soft); return Math.sqrt(Math.max(L * L * 0.25, Lc * Lc - dxMax * dxMax)); }

// shoulder swing (rad, + = forward) and elbow flexion (rad, 0 = straight) for the arm opposite the leg whose cycle phase is u
export function armSwing(u, amp, flex = 0.22) {
  const c = Math.cos(2 * Math.PI * u + 0.25), fw = Math.max(0, c);   // forward swing bends the elbow more
  return { sh: amp * c, el: flex + 0.5 * fw * fw + 0.08 * (1 - fw) };
}
