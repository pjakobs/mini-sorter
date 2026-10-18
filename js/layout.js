// Dimensions (metres) and the loop's geometry. No Three.js or DOM here, so it can be tested on its own.

export const L = 12;                       // straight length
export const R = 3.5;                      // curve radius
export const P = 2 * L + 2 * Math.PI * R;  // loop length
export const BACK0 = L + Math.PI * R;      // start of the back straight
export const N = 44;                       // number of carriers
export const PITCH = P / N;
export const TRAY_Y = 1.1, TRAY_L = 0.86, TRAY_W = 1.0;
export const K_DAMP = 2.5;                 // how fast a discharged parcel loses forward momentum
export const MERGE_DEC = 0.35;             // distance over which a merging parcel slows to rest on the tray
export const S_INDUCT = L * 0.28;          // induction point on the front straight
export const CAP = 9;                      // parcels per chute bin

export const CH = { W: 1.8, Lc: 2.2, slope: 18 * Math.PI / 180, z0: 0.56, binD: 1.8 };
CH.y0 = TRAY_Y - 0.06;
CH.tableY = CH.y0 - CH.Lc * Math.tan(CH.slope);

export const BL = 7, BW = 0.9, BY = TRAY_Y + 0.04; // infeed belt length, width, top height

export const COL = { A: 0x1f8a8a, B: 0xd9622b, bg: 0xe3e8ec, yellow: 0xf2b705 };

export const mod = (a, m = P) => ((a % m) + m) % m;
export const smooth = t => t * t * (3 - 2 * t);
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[Math.floor(Math.random() * a.length)];

// Position, heading and outward normal at distance s along the loop
export function pathAt(s, o = {}) {
  s = mod(s);
  if (s < L) { o.x = -L / 2 + s; o.z = R; o.hx = 1; o.hz = 0; }
  else if (s < BACK0) { const t = (s - L) / R; o.x = L / 2 + R * Math.sin(t); o.z = R * Math.cos(t); o.hx = Math.cos(t); o.hz = -Math.sin(t); }
  else if (s < 2 * L + Math.PI * R) { const u = s - BACK0; o.x = L / 2 - u; o.z = -R; o.hx = -1; o.hz = 0; }
  else { const t = (s - 2 * L - Math.PI * R) / R; o.x = -L / 2 - R * Math.sin(t); o.z = -R * Math.cos(t); o.hx = -Math.cos(t); o.hz = Math.sin(t); }
  o.yaw = Math.atan2(-o.hz, o.hx);
  o.ox = -o.hz; o.oz = o.hx; // outward normal
  return o;
}

// Did a point moving from prev to cur along the loop pass target?
export function crossed(prev, cur, target) {
  const d2 = mod(cur - prev), d1 = mod(target - prev);
  return d2 > 0 && d2 < P / 2 && d1 > 0 && d1 <= d2;
}

// Infeed geometry: the belt joins the front straight at 45° and its centreline meets the loop at the induction point
export const IND = pathAt(S_INDUCT);
export const BELT_DIR = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };
export const BELT_YAW = Math.atan2(-BELT_DIR.z, BELT_DIR.x);
export const INDUCT_ANGLE = BELT_YAW - IND.yaw;
