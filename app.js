import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

// ===== Геометрическое ядро (координаты: x, y — основание, z — вверх) =====
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
};
const EPS = 1e-6;
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const sub = (s) => s.replace(/\d/g, (d) => SUBS[d]);

const H3 = Math.sqrt(3) / 2;
const hexVerts = (r, z, suf) => Object.fromEntries('ABCDEF'.split('').map((n, i) => {
  const a = (240 + 60 * i) * Math.PI / 180;
  return [n + suf, [+(r * Math.cos(a)).toFixed(6), +(r * Math.sin(a)).toFixed(6), z]];
}));
const hexFaces = (top) => {
  const L = 'ABCDEF'.split('');
  const f = [L, top ? L.map((n) => n + '1') : null].filter(Boolean);
  L.forEach((n, i) => { const m = L[(i + 1) % 6]; f.push(top ? [n, m, m + '1', n + '1'] : ['S', n, m]); });
  return f;
};
// base — первая грань (основание); apex — вершина пирамиды; lat — боковое ребро призмы (направление проектирования)
// calc — масштаб k для задач на вычисление и условие с «красивыми» длинами
const POLY_DEFS = {
  cube: {
    title: 'Куб', full: 'куба', name: 'ABCDA1B1C1D1', lat: ['A', 'A1'],
    verts: { A: [-1, -1, -1], B: [1, -1, -1], C: [1, 1, -1], D: [-1, 1, -1], A1: [-1, -1, 1], B1: [1, -1, 1], C1: [1, 1, 1], D1: [-1, 1, 1] },
    faces: [['A', 'B', 'C', 'D'], ['A1', 'B1', 'C1', 'D1'], ['A', 'B', 'B1', 'A1'], ['B', 'C', 'C1', 'B1'], ['C', 'D', 'D1', 'C1'], ['D', 'A', 'A1', 'D1']],
    calc: { k: 3, cond: 'Ребро куба равно 6.' },
  },
  paral: {
    title: 'Параллелепипед', full: 'параллелепипеда', name: 'ABCDA1B1C1D1', lat: ['A', 'A1'],
    verts: { A: [-1.3, -0.95, -1], B: [0.95, -0.95, -1], C: [1.35, 0.95, -1], D: [-0.9, 0.95, -1], A1: [-0.95, -0.75, 1], B1: [1.3, -0.75, 1], C1: [1.7, 1.15, 1], D1: [-0.55, 1.15, 1] },
    faces: [['A', 'B', 'C', 'D'], ['A1', 'B1', 'C1', 'D1'], ['A', 'B', 'B1', 'A1'], ['B', 'C', 'C1', 'B1'], ['C', 'D', 'D1', 'C1'], ['D', 'A', 'A1', 'D1']],
  },
  tetra: {
    title: 'Тетраэдр', full: 'тетраэдра', name: 'SABC', apex: 'S',
    verts: { A: [-1.25, -1.25 / 3 * H3 * 2, -0.85], B: [1.25, -1.25 / 3 * H3 * 2, -0.85], C: [0, 2.5 * H3 * 2 / 3, -0.85], S: [0, 0, -0.85 + 2.5 * Math.sqrt(2 / 3)] },
    faces: [['A', 'B', 'C'], ['S', 'A', 'B'], ['S', 'B', 'C'], ['S', 'C', 'A']],
    calc: { k: 2, cond: 'Все рёбра тетраэдра равны 5.' },
  },
  pyr4: {
    title: 'Четырёхугольная пирамида', full: 'пирамиды', name: 'SABCD', apex: 'S',
    verts: { A: [-1.15, -1.15, -0.85], B: [1.15, -1.15, -0.85], C: [1.15, 1.15, -0.85], D: [-1.15, 1.15, -0.85], S: [0, 0, -0.85 + 2.3 / Math.SQRT2] },
    faces: [['A', 'B', 'C', 'D'], ['S', 'A', 'B'], ['S', 'B', 'C'], ['S', 'C', 'D'], ['S', 'D', 'A']],
    calc: { k: 6 / 2.3, cond: 'Пирамида правильная, все её рёбра равны 6.' },
  },
  prism: {
    title: 'Треугольная призма', full: 'призмы', name: 'ABCA1B1C1', lat: ['A', 'A1'],
    verts: { A: [-1.25, -2.5 * H3 / 3, -1], B: [1.25, -2.5 * H3 / 3, -1], C: [0, 2.5 * H3 * 2 / 3, -1], A1: [-1.25, -2.5 * H3 / 3, 1], B1: [1.25, -2.5 * H3 / 3, 1], C1: [0, 2.5 * H3 * 2 / 3, 1] },
    faces: [['A', 'B', 'C'], ['A1', 'B1', 'C1'], ['A', 'B', 'B1', 'A1'], ['B', 'C', 'C1', 'B1'], ['C', 'A', 'A1', 'C1']],
    calc: { k: 2, cond: 'Призма правильная, сторона основания равна 5, боковое ребро равно 4.' },
  },
  hexprism: {
    title: 'Шестиугольная призма', full: 'призмы', name: 'ABCDEFA1B1C1D1E1F1', lat: ['A', 'A1'],
    verts: { ...hexVerts(1.2, -1, ''), ...hexVerts(1.2, 1, '1') },
    faces: hexFaces(true),
    calc: { k: 5, cond: 'Призма правильная, сторона основания равна 6, боковое ребро равно 10.' },
  },
  hexpyr: {
    title: 'Шестиугольная пирамида', full: 'пирамиды', name: 'SABCDEF', apex: 'S',
    verts: { ...hexVerts(1.2, -0.85, ''), S: [0, 0, 1.15] },
    faces: hexFaces(false),
    calc: { k: 5, cond: 'Пирамида правильная, сторона основания равна 6, высота равна 10.' },
  },
};

function buildPoly(key) {
  const def = POLY_DEFS[key];
  const names = Object.keys(def.verts);
  const center = V.mul(names.reduce((s, n) => V.add(s, def.verts[n]), [0, 0, 0]), 1 / names.length);
  const faces = def.faces.map((vs) => {
    const pts = vs.map((n) => def.verts[n]);
    const c = V.mul(pts.reduce((s, p) => V.add(s, p), [0, 0, 0]), 1 / pts.length);
    let n = V.norm(V.cross(V.sub(pts[1], pts[0]), V.sub(pts[2], pts[0])));
    if (V.dot(n, V.sub(c, center)) < 0) n = V.mul(n, -1);
    return { verts: vs, normal: n, center: c, d: V.dot(n, c), label: sub(vs.join('')) };
  });
  const edges = [];
  const ekey = (a, b) => [a, b].sort().join('|');
  const emap = {};
  faces.forEach((f, fi) => {
    f.verts.forEach((a, i) => {
      const b = f.verts[(i + 1) % f.verts.length];
      const k = ekey(a, b);
      if (!(k in emap)) { emap[k] = edges.length; edges.push({ a, b, faces: [] }); }
      edges[emap[k]].faces.push(fi);
    });
  });
  edges.forEach((e) => {
    // подпись ребра в привычном порядке: S раньше, «без индекса» раньше
    const order = (n) => (n === 'S' ? -1 : 0) + n.length * 0.1;
    const [p, q] = order(e.a) <= order(e.b) ? [e.a, e.b] : [e.b, e.a];
    e.label = sub(p + q); e.la = p; e.lb = q;
    e.pa = def.verts[e.a]; e.pb = def.verts[e.b];
  });
  const findEdge = (a, b) => emap[ekey(a, b)];
  const vertFaces = (n) => faces.map((f, i) => (f.verts.includes(n) ? i : -1)).filter((i) => i >= 0);
  return { key, def, names, verts: def.verts, center, faces, edges, findEdge, vertFaces, label: sub(def.name) };
}

function planeFrom3(p, q, r) {
  const n = V.cross(V.sub(q, p), V.sub(r, p));
  if (V.len(n) < 1e-9) return null;
  const nn = V.norm(n);
  return { n: nn, d: V.dot(nn, p) };
}

// Многоугольник сечения выпуклого многогранника плоскостью
function sectionOf(poly, plane) {
  const s = (p) => V.dot(plane.n, p) - plane.d;
  const pts = [];
  const push = (pos, info) => { if (!pts.some((q) => V.dist(q.pos, pos) < 1e-6)) pts.push({ pos, ...info }); };
  poly.names.forEach((n) => { if (Math.abs(s(poly.verts[n])) < 1e-7) push(poly.verts[n], { vertex: n }); });
  poly.edges.forEach((e, i) => {
    const su = s(e.pa), sv = s(e.pb);
    if (Math.abs(su) < 1e-7 || Math.abs(sv) < 1e-7) return;
    if (su * sv < 0) push(V.lerp(e.pa, e.pb, su / (su - sv)), { edge: i });
  });
  if (pts.length < 3) return pts;
  const c = V.mul(pts.reduce((a, p) => V.add(a, p.pos), [0, 0, 0]), 1 / pts.length);
  const e1 = V.norm(V.sub(pts[0].pos, c));
  const e2 = V.cross(plane.n, e1);
  pts.forEach((p) => { const v = V.sub(p.pos, c); p.ang = Math.atan2(V.dot(v, e2), V.dot(v, e1)); });
  pts.sort((a, b) => a.ang - b.ang);
  return pts;
}

function polyArea(pts) {
  let a = [0, 0, 0];
  for (let i = 1; i + 1 < pts.length; i++) a = V.add(a, V.cross(V.sub(pts[i].pos, pts[0].pos), V.sub(pts[i + 1].pos, pts[0].pos)));
  return V.len(a) / 2;
}

// Пересечение прямых p1 + s·d1 и p2 + t·d2
function lineLine(p1, d1, p2, d2) {
  const w = V.sub(p1, p2);
  const a = V.dot(d1, d1), b = V.dot(d1, d2), c = V.dot(d2, d2), d = V.dot(d1, w), e = V.dot(d2, w);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-10 * a * c) {
    const off = V.len(V.cross(w, d1)) / Math.sqrt(a);
    return { kind: off < 1e-6 ? 'same' : 'parallel' };
  }
  const s = (b * e - c * d) / den, t = (a * e - b * d) / den;
  const q1 = V.add(p1, V.mul(d1, s)), q2 = V.add(p2, V.mul(d2, t));
  if (V.dist(q1, q2) > 1e-5) return { kind: 'skew', gap: V.dist(q1, q2) };
  return { kind: 'point', pos: q1, s, t };
}

function ratioText(t) {
  for (let q = 2; q <= 12; q++) {
    const p = Math.round(t * q);
    if (Math.abs(t * q - p) < 1e-6) {
      const g = (x, y) => (y ? g(y, x % y) : x);
      const k = g(p, q - p);
      return `${p / k} : ${(q - p) / k}`;
    }
  }
  return t.toFixed(2);
}

// Точка задачи → координаты и грани, в которых она лежит
function resolvePoint(poly, spec) {
  if (spec.v) return { name: spec.v, pos: poly.verts[spec.v], faces: poly.vertFaces(spec.v), vertex: spec.v, given: true };
  if (spec.face) {
    const pos = spec.face.reduce((a, n, i) => V.add(a, V.mul(poly.verts[n], spec.w[i])), [0, 0, 0]);
    const fi = poly.faces.findIndex((f) => spec.face.every((n) => f.verts.includes(n)));
    return { name: spec.n, pos, faces: [fi], face: fi, given: true, spec };
  }
  const ei = poly.findEdge(spec.on[0], spec.on[1]);
  const pos = V.lerp(poly.verts[spec.on[0]], poly.verts[spec.on[1]], spec.t);
  return { name: spec.n, pos, faces: poly.edges[ei].faces.slice(), edge: ei, given: true, spec };
}

function describePoint(spec) {
  if (spec.v) return null;
  if (spec.face) return `${spec.n} — точка внутри грани ${sub(spec.face.join(''))}`;
  const [a, b] = spec.on;
  if (Math.abs(spec.t - 0.5) < 1e-9) return `${spec.n} — середина ${sub(a + b)}`;
  return `${spec.n} ∈ ${sub(a + b)}, ${sub(a + spec.n)} : ${sub(spec.n + b)} = ${ratioText(spec.t)}`;
}

// ===== Решатель методом следов: строит последовательность шагов-подсказок =====
function solveSteps(poly, given, plane, target) {
  const fname = (fi) => poly.faces[fi].label;
  const known = poly.faces.map(() => []);
  const all = [];
  const used = new Set([...given.map((g) => g.name), ...poly.names]);
  const letters = ['P', 'Q', 'R', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'E', 'F', 'G', 'H'];
  let li = 0;
  const nextName = () => { while (used.has(letters[li % letters.length] + (li >= letters.length ? '′' : ''))) li++; const n = letters[li % letters.length] + (li >= letters.length ? '′' : ''); used.add(n); li++; return n; };
  const findKnown = (pos) => all.find((p) => V.dist(p.pos, pos) < 1e-6);
  const addTo = (fi, pt) => { if (!known[fi].some((q) => V.dist(q.pos, pt.pos) < 1e-6)) known[fi].push(pt); };
  given.forEach((g) => { all.push(g); g.faces.forEach((fi) => addTo(fi, g)); });

  const processed = new Set();
  const lines = {};
  const steps = [];
  const stats = { ext: 0, par: 0, proj: 0 };
  // --- метод внутреннего проектирования ---
  const def = poly.def, base = poly.faces[0];
  const onSeg = (e, pos) => { const d = V.sub(e.pb, e.pa), t = V.dot(V.sub(pos, e.pa), d) / V.dot(d, d); return t > -1e-7 && t < 1 + 1e-7 && V.dist(pos, V.lerp(e.pa, e.pb, t)) < 1e-6; };
  const inBase = (pos) => Math.abs(V.dot(base.normal, pos) - base.d) < 1e-6;
  function projOf(pos) {
    const n = base.normal;
    if (def.apex) {
      const S = poly.verts[def.apex], d = V.sub(pos, S), den = V.dot(n, d);
      return Math.abs(den) < 1e-9 ? null : V.add(S, V.mul(d, (base.d - V.dot(n, S)) / den));
    }
    if (!def.lat) return null;
    const dir = V.sub(poly.verts[def.lat[1]], poly.verts[def.lat[0]]);
    return V.sub(pos, V.mul(dir, (V.dot(n, pos) - base.d) / V.dot(n, dir)));
  }
  function projInfo(pt) {
    const pos = projOf(pt.pos); if (!pos) return null;
    const vn = base.verts.find((n) => V.dist(poly.verts[n], pos) < 1e-6);
    if (vn) return { pos, vertex: vn };
    const e = poly.edges.find((x) => base.verts.includes(x.a) && base.verts.includes(x.b) && onSeg(x, pos));
    return e ? { pos, edge: e } : null;
  }
  const usedPairs = new Set();
  const projNames = {};
  function projectionStep() {
    if (!def.apex && !def.lat) return false;
    const cand = all.filter((p) => !p.outside && !p.proj && !inBase(p.pos) && projInfo(p));
    for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) {
      const X = cand[i], Y = cand[j], key = X.name + '|' + Y.name;
      if (usedPairs.has(key)) continue;
      const px = projInfo(X), py = projInfo(Y);
      if (V.dist(px.pos, py.pos) < 1e-6) continue;
      const r = lineLine(X.pos, V.sub(Y.pos, X.pos), px.pos, V.sub(py.pos, px.pos));
      if (r.kind !== 'point' || findKnown(r.pos)) continue;
      usedPairs.add(key);
      const nm = (p, info) => info.vertex || (projNames[p.name] = projNames[p.name] || nextName());
      const how = (p, info) => info.vertex
        ? `проекция точки ${sub(p.name)} — вершина ${sub(info.vertex)}`
        : def.apex ? `${sub(nm(p, info))} = ${sub(def.apex + p.name)} ∩ ${info.edge.label}`
          : `через ${sub(p.name)} проведите прямую, параллельную ${sub(def.lat.join(''))}; ${sub(nm(p, info))} — её пересечение с ${info.edge.label}`;
      const tx = how(X, px), ty = how(Y, py);
      const Xp = nm(X, px), Yp = nm(Y, py);
      const T = { name: nextName(), pos: r.pos, faces: [0], outside: true };
      all.push(T); addTo(0, T);
      stats.proj++;
      steps.push({ kind: 'proj', text: `Метод внутреннего проектирования. Спроецируйте точки ${sub(X.name)} и ${sub(Y.name)} на плоскость основания ${base.label} ${def.apex ? 'из вершины ' + def.apex : 'параллельно боковому ребру ' + sub(def.lat.join(''))}: ${tx}; ${ty}.` });
      steps.push({ kind: 'proj', text: `Прямые ${sub(X.name + Y.name)} и ${sub(Xp + Yp)} лежат в одной плоскости ${def.apex ? '(она проходит через ' + def.apex + ')' : '(она параллельна боковым рёбрам)'}. Их пересечение ${sub(T.name)} лежит и в секущей плоскости, и в плоскости основания.` });
      return true;
    }
    return false;
  }
  const done = () => target.every((t) => findKnown(t.pos));

  function process(fi, p, d, label, intro) {
    processed.add(fi);
    lines[fi] = { p, d, label };
    const found = [];
    poly.faces[fi].verts.forEach((a, i) => {
      const b = poly.faces[fi].verts[(i + 1) % poly.faces[fi].verts.length];
      const ei = poly.findEdge(a, b), e = poly.edges[ei];
      const r = lineLine(p, d, e.pa, V.sub(e.pb, e.pa));
      if (r.kind !== 'point' || r.t < -1e-7 || r.t > 1 + 1e-7) return;
      let pt = findKnown(r.pos);
      if (!pt) {
        if (r.t < 1e-7 || r.t > 1 - 1e-7) {
          const vn = r.t < 0.5 ? e.a : e.b;
          pt = { name: vn, pos: poly.verts[vn], faces: poly.vertFaces(vn), vertex: vn };
        } else {
          pt = { name: nextName(), pos: r.pos, faces: e.faces.slice(), edge: ei };
        }
        all.push(pt);
        found.push(`${sub(pt.name)} = ${label} ∩ ${e.label}`);
      }
      pt.faces.forEach((f) => addTo(f, pt));
    });
    if (intro === null) return;
    let text = intro;
    if (found.length) text += ` Отметьте точки пересечения с рёбрами грани: ${found.join(', ')}.`;
    steps.push({ text, kind: 'face', face: fi });
  }

  for (let guard = 0; guard < 60 && !done(); guard++) {
    // 1) в грани есть две точки секущей плоскости
    let fi = poly.faces.findIndex((_, i) => !processed.has(i) && known[i].length >= 2);
    if (fi >= 0) {
      const [P, Q] = known[fi];
      const label = sub(P.name + Q.name);
      const d = V.sub(Q.pos, P.pos);
      const sameLine = Object.values(lines).some((L) => V.len(V.cross(V.norm(L.d), V.norm(d))) < 1e-7 && V.len(V.cross(V.sub(P.pos, L.p), V.norm(L.d))) < 1e-7);
      const onEdge = poly.edges.find((e) => [P.pos, Q.pos].every((x) => V.len(V.cross(V.sub(x, e.pa), V.norm(V.sub(e.pb, e.pa)))) < 1e-7));
      const intro = sameLine ? null
        : onEdge ? `Точки ${sub(P.name)} и ${sub(Q.name)} лежат на ребре ${onEdge.label}, значит это ребро целиком лежит в секущей плоскости.`
          : `Точки ${sub(P.name)} и ${sub(Q.name)} лежат в плоскости грани ${fname(fi)} — проведите прямую ${label}.`;
      process(fi, P.pos, d, onEdge ? onEdge.label : label, intro);
      continue;
    }
    // 2) параллельность: прямая сечения в грани F параллельна плоскости грани F2
    let acted = false;
    for (const f of processed) {
      const L = lines[f];
      for (let f2 = 0; f2 < poly.faces.length && !acted; f2++) {
        if (processed.has(f2) || known[f2].length < 1) continue;
        if (Math.abs(V.dot(V.norm(L.d), poly.faces[f2].normal)) > 1e-7) continue;
        const P = known[f2][0];
        const pe = poly.faces[f2].verts.map((a, i) => poly.edges[poly.findEdge(a, poly.faces[f2].verts[(i + 1) % poly.faces[f2].verts.length])])
          .find((e) => V.len(V.cross(V.norm(V.sub(e.pb, e.pa)), V.norm(L.d))) < 1e-7);
        const why = Math.abs(Math.abs(V.dot(poly.faces[f].normal, poly.faces[f2].normal)) - 1) < 1e-7
          ? `Грани ${fname(f)} и ${fname(f2)} параллельны, поэтому секущая плоскость пересекает их по параллельным прямым.`
          : pe ? `Прямая ${L.label} параллельна ребру ${pe.label}, лежащему в грани ${fname(f2)}, значит секущая плоскость пересекает эту грань по прямой, параллельной ${pe.label}.`
            : `Прямая ${L.label} параллельна плоскости грани ${fname(f2)}, значит секущая плоскость пересекает её по прямой, параллельной ${L.label}.`;
        stats.par++;
        const lname = 'ℓ' + sub(String(stats.par));
        process(f2, P.pos, L.d, lname, `${why} Инструментом «Параллель» проведите через ${sub(P.name)} прямую ${lname}, параллельную ${pe ? pe.label : L.label}.`);
        acted = true;
      }
      if (acted) break;
    }
    if (acted) continue;
    // 3) след: продолжаем прямую сечения до пересечения с прямой ребра
    let best = null;
    for (const f of processed) {
      const L = lines[f];
      poly.faces[f].verts.forEach((a, i) => {
        const b = poly.faces[f].verts[(i + 1) % poly.faces[f].verts.length];
        const ei = poly.findEdge(a, b), e = poly.edges[ei];
        const f2 = e.faces.find((x) => x !== f);
        if (f2 === undefined || processed.has(f2)) return;
        const r = lineLine(L.p, L.d, e.pa, V.sub(e.pb, e.pa));
        if (r.kind !== 'point' || findKnown(r.pos)) return;
        const score = known[f2].length >= 1 ? 2 : 1;
        if (!best || score > best.score) best = { score, f, f2, e, pos: r.pos, L };
      });
    }
    if (best) {
      const pt = { name: nextName(), pos: best.pos, faces: [best.f, best.f2], outside: true };
      all.push(pt);
      addTo(best.f2, pt); addTo(best.f, pt);
      stats.ext++;
      steps.push({
        kind: 'trace',
        text: `Продлите прямую ${best.L.label} и ребро ${best.e.label} (они лежат в одной плоскости ${fname(best.f)}) до пересечения в точке ${sub(pt.name)}. Точка ${sub(pt.name)} лежит и в плоскости грани ${fname(best.f2)}.`,
      });
      continue;
    }
    // 4) внутреннее проектирование
    if (projectionStep()) continue;
    break;
  }
  const ok = done();
  if (ok) steps.push({ kind: 'final', text: 'Соедините найденные на рёбрах точки по граням — получится многоугольник сечения. Выберите инструмент «Сечение» и отметьте его вершины.' });
  return { ok, steps, stats };
}

// ===== Задачи =====
const TASKS = [
  // Базовый уровень: все точки попарно в общих гранях
  { id: 'b1', level: 1, poly: 'cube', pts: [{ n: 'K', on: ['A', 'A1'], t: 0.5 }, { n: 'L', on: ['A', 'B'], t: 0.5 }, { n: 'M', on: ['A', 'D'], t: 0.5 }] },
  { id: 'b2', level: 1, poly: 'tetra', pts: [{ n: 'K', on: ['S', 'A'], t: 0.4 }, { n: 'L', on: ['S', 'B'], t: 0.6 }, { n: 'M', on: ['S', 'C'], t: 0.5 }] },
  { id: 'b3', level: 1, poly: 'cube', pts: [{ n: 'K', on: ['A1', 'B1'], t: 0.5 }, { n: 'L', on: ['B1', 'C1'], t: 0.5 }, { v: 'B' }] },
  { id: 'b4', level: 1, poly: 'prism', pts: [{ n: 'K', on: ['A', 'A1'], t: 0.5 }, { n: 'L', on: ['B', 'B1'], t: 1 / 3 }, { v: 'C' }] },
  { id: 'b5', level: 1, poly: 'pyr4', pts: [{ v: 'A' }, { v: 'C' }, { n: 'K', on: ['S', 'B'], t: 0.5 }] },
  { id: 'b6', level: 1, poly: 'hexprism', pts: [{ n: 'K', on: ['A', 'A1'], t: 0.5 }, { n: 'L', on: ['A', 'B'], t: 0.5 }, { n: 'M', on: ['A', 'F'], t: 0.5 }] },
  // Средний уровень: один след или параллельность
  { id: 'm1', level: 2, poly: 'cube', pts: [{ n: 'K', on: ['A', 'A1'], t: 0.75 }, { n: 'L', on: ['B', 'B1'], t: 0.25 }, { n: 'M', on: ['C', 'C1'], t: 0.5 }] },
  { id: 'm2', level: 2, poly: 'tetra', pts: [{ n: 'K', on: ['S', 'A'], t: 0.25 }, { n: 'L', on: ['S', 'B'], t: 0.6 }, { n: 'M', on: ['B', 'C'], t: 0.5 }] },
  { id: 'm3', level: 2, poly: 'pyr4', pts: [{ v: 'A' }, { v: 'B' }, { n: 'M', on: ['S', 'C'], t: 0.5 }] },
  { id: 'm4', level: 2, poly: 'prism', pts: [{ n: 'K', on: ['A', 'B'], t: 0.5 }, { n: 'L', on: ['A', 'C'], t: 0.5 }, { v: 'B1' }] },
  { id: 'm6', level: 2, poly: 'paral', pts: [{ n: 'K', on: ['A', 'A1'], t: 0.75 }, { n: 'L', on: ['B', 'B1'], t: 0.25 }, { n: 'M', on: ['C', 'C1'], t: 0.5 }] },
  { id: 'm5', level: 2, poly: 'tetra', pts: [{ n: 'K', on: ['S', 'A'], t: 0.25 }, { n: 'L', on: ['B', 'C'], t: 1 / 3 }, { n: 'M', on: ['A', 'B'], t: 0.5 }] },
  // Сложный уровень: несколько следов, пяти- и шестиугольники
  { id: 'h1', level: 3, poly: 'cube', pts: [{ n: 'K', on: ['A', 'B'], t: 0.5 }, { n: 'L', on: ['A', 'D'], t: 0.5 }, { n: 'M', on: ['C', 'C1'], t: 0.5 }] },
  { id: 'h2', level: 3, poly: 'cube', pts: [{ n: 'K', on: ['A', 'B'], t: 0.5 }, { n: 'L', on: ['B', 'C'], t: 0.5 }, { n: 'M', on: ['C', 'C1'], t: 0.5 }] },
  { id: 'h3', level: 3, poly: 'pyr4', pts: [{ n: 'K', on: ['A', 'B'], t: 0.5 }, { n: 'L', on: ['A', 'D'], t: 0.5 }, { n: 'M', on: ['S', 'C'], t: 0.5 }] },
  { id: 'h4', level: 3, poly: 'cube', pts: [{ n: 'K', on: ['A', 'B'], t: 0.5 }, { n: 'L', on: ['B', 'C'], t: 0.5 }, { v: 'D1' }] },
  { id: 'h6', level: 3, poly: 'cube', pts: [{ n: 'K', on: ['B1', 'C1'], t: 0.5 }, { n: 'L', on: ['C1', 'D1'], t: 0.5 }, { n: 'M', on: ['A', 'A1'], t: 1 / 3 }] },
  { id: 'h5', level: 3, poly: 'prism', pts: [{ n: 'K', on: ['A', 'A1'], t: 0.5 }, { n: 'L', on: ['B1', 'C1'], t: 0.5 }, { n: 'M', on: ['B', 'C'], t: 0.25 }] },
  { id: 'h8', level: 3, poly: 'paral', pts: [{ n: 'K', on: ['A', 'B'], t: 0.5 }, { n: 'L', on: ['A', 'D'], t: 0.5 }, { n: 'M', on: ['C', 'C1'], t: 0.5 }] },
  { id: 'h9', level: 3, poly: 'hexpyr', pts: [{ n: 'K', on: ['S', 'A'], t: 0.5 }, { n: 'L', on: ['S', 'B'], t: 0.5 }, { n: 'M', on: ['C', 'D'], t: 0.5 }] },
  // Проектирование: точки внутри граней, нет двух точек в одной грани
  { id: 'p1', level: 4, poly: 'tetra', pts: [{ n: 'K', on: ['S', 'A'], t: 0.4 }, { n: 'L', face: ['S', 'B', 'C'], w: [0.3, 0.35, 0.35] }, { n: 'M', face: ['A', 'B', 'C'], w: [0.2, 0.5, 0.3] }] },
  { id: 'p2', level: 4, poly: 'pyr4', pts: [{ n: 'K', face: ['S', 'A', 'B'], w: [0.3, 0.4, 0.3] }, { n: 'L', face: ['S', 'B', 'C'], w: [0.5, 0.25, 0.25] }, { n: 'M', on: ['S', 'D'], t: 0.75 }] },
  { id: 'p3', level: 4, poly: 'prism', pts: [{ n: 'K', face: ['A', 'B', 'B1', 'A1'], w: [0.3, 0.3, 0.2, 0.2] }, { n: 'L', face: ['B', 'C', 'C1', 'B1'], w: [0.15, 0.15, 0.35, 0.35] }, { n: 'M', on: ['A1', 'C1'], t: 0.5 }] },
  { id: 'p4', level: 4, poly: 'cube', pts: [{ n: 'K', face: ['A', 'B', 'B1', 'A1'], w: [0.35, 0.15, 0.15, 0.35] }, { n: 'L', face: ['B', 'C', 'C1', 'B1'], w: [0.1, 0.3, 0.3, 0.3] }, { n: 'M', on: ['D', 'D1'], t: 0.25 }] },
  { id: 'p5', level: 4, poly: 'hexprism', pts: [{ n: 'K', on: ['A', 'B'], t: 0.5 }, { n: 'L', on: ['C', 'C1'], t: 0.5 }, { n: 'M', on: ['E1', 'F1'], t: 0.5 }] },
  { id: 'p6', level: 4, poly: 'hexpyr', pts: [{ n: 'K', face: ['S', 'A', 'B'], w: [0.4, 0.3, 0.3] }, { n: 'L', face: ['S', 'C', 'D'], w: [0.2, 0.4, 0.4] }, { n: 'M', face: ['S', 'E', 'F'], w: [0.3, 0.35, 0.35] }] },
];

function prepareTask(task) {
  const poly = buildPoly(task.poly);
  const given = task.pts.map((s) => resolvePoint(poly, s));
  const plane = planeFrom3(given[0].pos, given[1].pos, given[2].pos);
  const target = plane ? sectionOf(poly, plane) : [];
  const sol = plane && target.length >= 3 ? solveSteps(poly, given, plane, target) : { ok: false, steps: [], stats: {} };
  return { task, poly, given, plane, target, sol };
}

function classify(p) {
  if (p.sol.stats.proj) return 4;
  const n = p.target.length, x = (p.sol.stats.ext || 0) + (p.sol.stats.par || 0);
  if (n === 3 && x === 0) return 1;
  if (n <= 4 && x <= 2) return 2;
  return 3;
}

// Случайная задача нужного уровня
function randomTask(level, polyKey, rnd = Math.random) {
  const keys = polyKey ? [polyKey] : Object.keys(POLY_DEFS);
  const ts = [0.25, 1 / 3, 0.5, 2 / 3, 0.75];
  for (let tries = 0; tries < 3000; tries++) {
    const pk = keys[Math.floor(rnd() * keys.length)];
    const poly = buildPoly(pk);
    const names = ['K', 'L', 'M'];
    const pts = [];
    const usedEdges = new Set();
    for (let i = 0; i < 3; i++) {
      if (level === 4 && rnd() < 0.6) {
        const lat = poly.faces.map((f, fi) => fi).filter((fi) => fi > 0 && !(poly.def.lat && fi === 1));
        const f = poly.faces[lat[Math.floor(rnd() * lat.length)]];
        const w = f.verts.map(() => 1 + Math.floor(rnd() * 3)), sw = w.reduce((a, b) => a + b, 0);
        pts.push({ n: names[i], face: f.verts.slice(), w: w.map((x) => x / sw) });
        continue;
      }
      if (rnd() < 0.15) { const v = poly.names[Math.floor(rnd() * poly.names.length)]; pts.push({ v }); continue; }
      let ei; do { ei = Math.floor(rnd() * poly.edges.length); } while (usedEdges.has(ei));
      usedEdges.add(ei);
      const e = poly.edges[ei];
      const [a, b] = e.label.length && sub(e.a + e.b) === e.label ? [e.a, e.b] : [e.b, e.a];
      pts.push({ n: names[i], on: [a, b], t: ts[Math.floor(rnd() * ts.length)] });
    }
    if (new Set(pts.filter((p) => p.v).map((p) => p.v)).size !== pts.filter((p) => p.v).length) continue;
    // переименуем точки на рёбрах по порядку K, L, M
    let k = 0; pts.forEach((p) => { if (!p.v) p.n = names[k++]; });
    if (level === 4 && !pts.some((p) => p.face)) continue;
    const task = { id: 'r' + Date.now() + tries, level, poly: pk, pts, random: true };
    const p = prepareTask(task);
    if (!p.plane || p.target.length < 3 || !p.sol.ok) continue;
    if (polyArea(p.target) < 0.35) continue;
    if (p.poly.faces.some((f) => Math.abs(Math.abs(V.dot(f.normal, p.plane.n)) - 1) < 1e-6 && Math.abs(Math.abs(p.plane.d) - Math.abs(f.d)) < 1e-6)) continue;
    // все данные точки — на поверхности, но сечение не должно совпадать с гранью
    if (classify(p) === level) return task;
  }
  return null;
}

// ===== Разборы задач из презентации «Задачи на построение сечений» =====
const DEMOS = [
  { id: 'd1', title: 'Задача 1', poly: 'tetra',
    pts: [{ n: 'D', on: ['A', 'B'], t: 0.5 }, { n: 'E', on: ['S', 'A'], t: 0.55 }, { n: 'K', on: ['S', 'C'], t: 0.8 }],
    steps: [
      { do: 'line', p: ['D', 'E'], text: 'Точки D и E лежат в одной грани SAB — соединяем их.' },
      { do: 'line', p: ['E', 'K'], text: 'Точки E и K лежат в одной грани SAC — соединяем их.' },
      { do: 'meet', a: 'EK', b: 'AC', name: 'F', text: 'Прямые EK и AC лежат в одной плоскости SAC. Продолжаем их до пересечения в точке F.' },
      { do: 'line', p: ['F', 'D'], text: 'Точка F лежит на прямой AC, значит, в плоскости основания ABC, как и точка D. Проводим прямую FD.' },
      { do: 'meet', a: 'FD', b: 'BC', name: 'M', text: 'Прямая FD пересекает ребро BC в точке M.' },
      { do: 'line', p: ['K', 'M'], text: 'Точки K и M лежат в одной грани SBC — соединяем их.' },
      { do: 'section', p: ['D', 'E', 'K', 'M'], text: 'DEKM — искомое сечение.' },
    ] },
  { id: 'd2', title: 'Задача 2', poly: 'cube', note: 'В презентации — параллелепипед; здесь его частный случай, куб.',
    pts: [{ n: 'E', on: ['A', 'A1'], t: 0.5 }, { n: 'F', on: ['A1', 'B1'], t: 0.25 }, { n: 'K', on: ['B1', 'C1'], t: 0.5 }],
    steps: [
      { do: 'line', p: ['K', 'F'], text: 'Соединяем точки K и F, принадлежащие одной плоскости A₁B₁C₁D₁.' },
      { do: 'line', p: ['F', 'E'], text: 'Соединяем точки F и E, принадлежащие одной плоскости AA₁B₁B.' },
      { do: 'meet', a: 'FE', b: 'AB', name: 'L', text: 'Прямые FE и AB, лежащие в одной плоскости AA₁B₁B, пересекаются в точке L.' },
      { do: 'par', through: 'L', like: 'FK', name: 'LN', text: 'Проводим прямую LN параллельно FK: если секущая плоскость пересекает противоположные грани, то по параллельным отрезкам.' },
      { do: 'meet', a: 'LN', b: 'AD', name: 'M', text: 'Прямая LN пересекает ребро AD в точке M…' },
      { do: 'meet', a: 'LN', b: 'BC', name: 'N', text: '…и ребро BC в точке N.' },
      { do: 'line', p: ['E', 'M'], text: 'Соединяем точки E и M, принадлежащие одной плоскости AA₁D₁D.' },
      { do: 'line', p: ['K', 'N'], text: 'Соединяем точки K и N, принадлежащие одной плоскости BCC₁B₁.' },
      { do: 'section', p: ['E', 'F', 'K', 'N', 'M'], text: 'EFKNM — искомое сечение.' },
    ] },
  { id: 'd3', title: 'Задача 3', poly: 'cube',
    pts: [{ n: 'K', on: ['B1', 'C1'], t: 0.5 }, { n: 'L', on: ['A', 'A1'], t: 0.6 }, { n: 'M', on: ['A', 'D'], t: 0.6 }],
    steps: [
      { do: 'line', p: ['M', 'L'], text: 'Точки M и L лежат в одной грани AA₁D₁D — проводим прямую ML.' },
      { do: 'meet', a: 'ML', b: 'D1A1', name: 'E', text: 'Прямые ML и D₁A₁ лежат в плоскости AA₁D₁D и пересекаются в точке E.' },
      { do: 'line', p: ['E', 'K'], text: 'Точка E лежит на прямой D₁A₁, то есть в плоскости верхней грани, как и K. Проводим EK.' },
      { do: 'meet', a: 'EK', b: 'A1B1', name: 'F', text: 'Прямая EK пересекает ребро A₁B₁ в точке F.' },
      { do: 'line', p: ['L', 'F'], text: 'Точки L и F лежат в одной грани AA₁B₁B — соединяем их.' },
      { do: 'meet', a: 'LM', b: 'D1D', name: 'N', text: 'Прямая LM пересекает прямую D₁D в точке N.' },
      { do: 'meet', a: 'EK', b: 'D1C1', name: 'T', text: 'Прямая EK пересекает прямую D₁C₁ в точке T.' },
      { do: 'line', p: ['N', 'T'], text: 'Точки N и T лежат в плоскости грани DD₁C₁C — проводим прямую NT.' },
      { do: 'meet', a: 'NT', b: 'DC', name: 'G', text: 'NT пересекает ребро DC в точке G…' },
      { do: 'meet', a: 'NT', b: 'CC1', name: 'P', text: '…и ребро CC₁ в точке P.' },
      { do: 'line', p: ['M', 'G'], text: 'Соединяем точки M и G, лежащие в основании ABCD.' },
      { do: 'line', p: ['P', 'K'], text: 'Соединяем точки P и K, лежащие в грани BCC₁B₁.' },
      { do: 'section', p: ['M', 'L', 'F', 'K', 'P', 'G'], text: 'MLFKPG — искомое сечение, шестиугольник.' },
    ] },
  { id: 'd4', title: 'Задача 4', poly: 'cube',
    pts: [{ n: 'H', on: ['D', 'D1'], t: 0.75 }, { n: 'T', on: ['C', 'C1'], t: 0.4 }, { n: 'M', on: ['A', 'B'], t: 0.5 }],
    steps: [
      { do: 'line', p: ['H', 'T'], text: 'Точки H и T лежат в одной грани DD₁C₁C — проводим HT. (Соединять H с M или M с T нельзя: они в разных гранях!)' },
      { do: 'meet', a: 'HT', b: 'DC', name: 'E', text: 'HT и DC лежат в одной плоскости — их пересечение E. (HT и BC скрещиваются и пересечься не могут!)' },
      { do: 'line', p: ['M', 'E'], text: 'Точки M и E лежат в плоскости основания ABCD — проводим ME.' },
      { do: 'meet', a: 'ME', b: 'BC', name: 'F', text: 'ME пересекает ребро BC в точке F.' },
      { do: 'line', p: ['T', 'F'], text: 'Точки T и F лежат в одной грани BCC₁B₁ — соединяем их.' },
      { do: 'meet', a: 'TF', b: 'B1B', name: 'K', text: 'Прямые TF и B₁B лежат в плоскости BCC₁B₁ — продолжаем до пересечения в точке K.' },
      { do: 'line', p: ['M', 'K'], text: 'Точки M и K лежат в плоскости грани AA₁B₁B — проводим MK.' },
      { do: 'meet', a: 'MK', b: 'AA1', name: 'L', text: 'MK пересекает ребро AA₁ в точке L.' },
      { do: 'line', p: ['L', 'H'], text: 'Точки L и H лежат в одной грани AA₁D₁D — соединяем их.' },
      { do: 'section', p: ['H', 'T', 'F', 'M', 'L'], text: 'HTFML — искомое сечение.' },
    ] },
  { id: 'd5', title: 'Задача 5', poly: 'tetra',
    pts: [{ n: 'K', on: ['S', 'C'], t: 0.45 }, { n: 'M', on: ['S', 'A'], t: 0.7 }, { n: 'P', face: ['A', 'B', 'C'], w: [0.3, 0.5, 0.2] }],
    steps: [
      { do: 'line', p: ['K', 'M'], text: 'Точки K и M лежат в одной грани SAC — проводим KM.' },
      { do: 'meet', a: 'KM', b: 'CA', name: 'E', text: 'Прямые KM и CA лежат в плоскости SAC и пересекаются в точке E.' },
      { do: 'line', p: ['E', 'P'], text: 'Точки E и P лежат в плоскости основания ABC — проводим EP.' },
      { do: 'meet', a: 'EP', b: 'AB', name: 'F', text: 'EP пересекает ребро AB в точке F…' },
      { do: 'meet', a: 'EP', b: 'BC', name: 'N', text: '…и ребро BC в точке N.' },
      { do: 'line', p: ['M', 'F'], text: 'Соединяем точки M и F, лежащие в грани SAB.' },
      { do: 'line', p: ['N', 'K'], text: 'Соединяем точки N и K, лежащие в грани SBC.' },
      { do: 'section', p: ['K', 'M', 'F', 'N'], text: 'KMFN — искомое сечение.' },
    ] },
];
const splitNames = (s) => s.match(/[A-Z]\d?/g) || [];


const perimeterOf = (pts) => pts.reduce((a, p, i) => a + V.dist(p.pos, pts[(i + 1) % pts.length].pos), 0);
// ===== Интерфейс =====
const $ = (id) => document.getElementById(id);
const LEVELS = {
  0: { name: 'Разбор', note: 'Задачи из презентации «Задачи на построение сечений». Листайте построение по шагам кнопками «Далее» и «Назад», вращайте фигуру мышью.', cost: 0 },
  1: { name: 'Базовый', note: 'Данные точки попарно лежат в общих гранях: соедините их отрезками. Число вершин сечения известно, подсказки бесплатны.', cost: 0 },
  2: { name: 'Средний', note: 'Понадобится один след на прямой ребра или параллельность граней. Каждая подсказка снимает звезду.', cost: 1 },
  3: { name: 'Сложный', note: 'Несколько следов подряд, пяти- и шестиугольные сечения. Число вершин не сообщается.', cost: 1 },
  4: { name: 'Проектирование', note: 'Точки внутри граней, и никакие две не лежат в одной грани. Нужен метод внутреннего проектирования: спроецируйте точки на основание.', cost: 1 },
};
const NGON = { 3: 'треугольник', 4: 'четырёхугольник', 5: 'пятиугольник', 6: 'шестиугольник', 7: 'семиугольник', 8: 'восьмиугольник' };
const MAXLV = 4;

let progress = {};
try {
  const raw = JSON.parse(localStorage.getItem('sec-lab-progress') || '{}');
  // берём только известные задачи и целые оценки 0–3
  if (raw && typeof raw === 'object') TASKS.forEach((t) => { const v = raw[t.id]; if (Number.isInteger(v) && v >= 0 && v <= 3) progress[t.id] = v; });
} catch (e) { progress = {}; }
const saveProgress = () => { try { localStorage.setItem('sec-lab-progress', JSON.stringify(progress)); } catch (e) { /* нет хранилища */ } };
let curLevel = 1;
try { const lv = +localStorage.getItem('sec-lab-level'); if (Number.isInteger(lv) && lv >= 0 && lv <= MAXLV) curLevel = lv; } catch (e) { /* нет хранилища */ }
let randomTasks = { 1: null, 2: null, 3: null, 4: null };
let calcDone = {};
try {
  const raw = JSON.parse(localStorage.getItem('sec-lab-calc') || '[]');
  if (Array.isArray(raw)) raw.forEach((id) => { if (TASKS.some((t) => t.id === id)) calcDone[id] = true; });
} catch (e) { calcDone = {}; }
const saveCalc = () => { try { localStorage.setItem('sec-lab-calc', JSON.stringify(Object.keys(calcDone))); } catch (e) { /* нет хранилища */ } };

// ----- Three.js -----
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const controls = new OrbitControls(camera, renderer.domElement);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
controls.enableDamping = !reduceMotion;
controls.minDistance = 4; controls.maxDistance = 18;
const T3 = (p) => [p[0], p[2], -p[1]];
const TV = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
const fromTV = (v) => [v.x, -v.z, v.y];
function resetView() { camera.position.copy(TV([4.4, -7.4, 3.6])); controls.target.set(0, 0, 0); controls.update(); }
resetView();

const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const allMats = [];
function lmat(o) { const m = new LineMaterial({ linewidth: 2, ...o }); allMats.push(m); return m; }
const M = {
  edge: lmat({ linewidth: 2.4 }),
  hidden: lmat({ linewidth: 1.4, dashed: true, dashSize: 0.08, gapSize: 0.07 }),
  ext: lmat({ linewidth: 1.3, dashed: true, dashSize: 0.06, gapSize: 0.06 }),
  user: lmat({ linewidth: 1.9 }),
  sel: lmat({ linewidth: 3.6 }),
  hover: lmat({ linewidth: 3.2 }),
  secLine: lmat({ linewidth: 3.2 }),
  secPrev: lmat({ linewidth: 2.4, dashed: true, dashSize: 0.1, gapSize: 0.06 }),
  solLine: lmat({ linewidth: 2.4, dashed: true, dashSize: 0.12, gapSize: 0.06 }),
};
const faceMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false });
const faceHi = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false });
const faceBad = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
const secMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.33, side: THREE.DoubleSide, depthWrite: false });
const ptGeo = new THREE.SphereGeometry(0.052, 18, 12);
const PM = {
  vertex: new THREE.MeshBasicMaterial({ depthTest: false }),
  given: new THREE.MeshBasicMaterial({ depthTest: false }),
  built: new THREE.MeshBasicMaterial({ depthTest: false }),
  sel: new THREE.MeshBasicMaterial({ depthTest: false }),
};
function applyColors() {
  const ink = tok('--ink'), acc = tok('--accent'), sec = tok('--section'), sel = tok('--sel'), muted = tok('--muted');
  M.edge.color.set(ink); M.hidden.color.set(ink); M.ext.color.set(muted); M.user.color.set(acc);
  M.sel.color.set(sel); M.hover.color.set(acc); M.secLine.color.set(sec); M.secPrev.color.set(sec); M.solLine.color.set(sec);
  faceMat.color.set(tok('--face')); secMat.color.set(sec); faceHi.color.set(acc); faceBad.color.set(sec);
  PM.vertex.color.set(ink); PM.given.color.set(sec); PM.built.color.set(acc); PM.sel.color.set(sel);
}
applyColors();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyColors);
new MutationObserver(applyColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

let W = 1, H = 1;
function resize() {
  const r = stage.getBoundingClientRect();
  W = Math.max(1, r.width); H = Math.max(1, r.height);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.fov = W < H ? 42 : 30;
  camera.updateProjectionMatrix();
  allMats.forEach((m) => m.resolution.set(W, H));
}
new ResizeObserver(resize).observe(stage);
resize();

let world = new THREE.Group();
scene.add(world);
function seg(a, b, mat, order = 2) {
  const g = new LineGeometry();
  g.setPositions([...T3(a), ...T3(b)]);
  const l = new Line2(g, mat);
  l.computeLineDistances(); l.frustumCulled = false; l.renderOrder = order;
  world.add(l);
  return l;
}
function setSeg(l, a, b) { l.geometry.setPositions([...T3(a), ...T3(b)]); l.computeLineDistances(); }
function polyline(pts, mat, closed, order = 4) {
  const arr = []; pts.forEach((p) => arr.push(...T3(p))); if (closed) arr.push(...T3(pts[0]));
  const g = new LineGeometry(); g.setPositions(arr);
  const l = new Line2(g, mat); l.computeLineDistances(); l.frustumCulled = false; l.renderOrder = order;
  world.add(l); return l;
}
function fan(pts, mat) {
  const pos = [];
  for (let i = 1; i + 1 < pts.length; i++) pos.push(...T3(pts[0]), ...T3(pts[i]), ...T3(pts[i + 1]));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(g, mat); m.renderOrder = 1; world.add(m); return m;
}
function removeObj(o) { if (!o) return; world.remove(o); o.geometry && o.geometry !== ptGeo && o.geometry.dispose(); }

// ----- Состояние задачи -----
let S = null;
const NAMES = ['P', 'Q', 'R', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'E', 'F', 'G', 'H', 'N', 'O'];
const labelsEl = $('labels');

function addPoint(name, pos, kind, extra = {}) {
  const mesh = new THREE.Mesh(ptGeo, PM[kind]);
  mesh.position.copy(TV(pos)); mesh.renderOrder = 6; world.add(mesh);
  const el = document.createElement('div');
  el.className = 'lbl ' + kind; el.textContent = sub(name);
  labelsEl.appendChild(el);
  const pt = { id: ++S.uid, name, pos, kind, mesh, el, ...extra };
  S.points.push(pt);
  return pt;
}
function removePoint(pt) { removeObj(pt.mesh); pt.el.remove(); S.points = S.points.filter((p) => p !== pt); }
function nextName() {
  const used = new Set(S.points.map((p) => p.name));
  for (let k = 0; ; k++) for (const n of NAMES) { const c = k ? n + k : n; if (!used.has(c)) return c; }
}
let lineNo = 0;
function addLine(p, d, t0, t1, name, extra = {}) {
  const ln = { id: ++S.uid, kind: 'user', p, d, t0, t1, name, ...extra };
  ln.obj = seg(V.add(p, V.mul(d, t0)), V.add(p, V.mul(d, t1)), M.user, 3);
  S.lines.push(ln); return ln;
}
function lineRange(ln) { return ln.kind === 'edge' ? [Math.min(0, ln.t0), Math.max(1, ln.t1)] : [ln.t0, ln.t1]; }
function redrawLine(ln) {
  if (ln.kind === 'user') { setSeg(ln.obj, V.add(ln.p, V.mul(ln.d, ln.t0)), V.add(ln.p, V.mul(ln.d, ln.t1))); return; }
  // ребро: продолжения рисуем отдельно пунктиром
  [['extA', ln.t0, 0], ['extB', 1, ln.t1]].forEach(([k, a, b]) => {
    if (b - a > 1e-6) {
      const pa = V.add(ln.p, V.mul(ln.d, a)), pb = V.add(ln.p, V.mul(ln.d, b));
      if (ln[k]) setSeg(ln[k], pa, pb); else ln[k] = seg(pa, pb, M.ext, 2);
    } else if (ln[k]) { removeObj(ln[k]); ln[k] = null; }
  });
}
function paramOn(ln, pos) { return V.dot(V.sub(pos, ln.p), ln.d) / V.dot(ln.d, ln.d); }
function onLine(ln, pos) { return V.len(V.cross(V.sub(pos, ln.p), ln.d)) / V.len(ln.d) < 1e-6; }
function extendTo(ln, pos) {
  const t = paramOn(ln, pos);
  const m = ln.kind === 'edge' ? 0.08 : 0.3 / V.len(ln.d);
  const t0 = ln.kind === 'edge' && t >= 0 && t <= 1 ? ln.t0 : Math.min(ln.t0, t - m);
  const t1 = ln.kind === 'edge' && t >= 0 && t <= 1 ? ln.t1 : Math.max(ln.t1, t + m);
  if (t0 !== ln.t0 || t1 !== ln.t1) { ln.t0 = t0; ln.t1 = t1; redrawLine(ln); }
}

function loadTask(task, demoStep = 0) {
  if (S) { while (world.children.length) removeObj(world.children[0]); }
  labelsEl.innerHTML = '';
  const prep = prepareTask(task);
  S = { task, prep, poly: prep.poly, points: [], lines: [], uid: 0, sel: [], secSel: [], history: [], hints: 0, solved: false, revealed: false, secObjs: [], prevObj: null, hover: null };
  lineNo = 0;
  const poly = prep.poly;
  poly.faces.forEach((f) => { f.mesh = fan(f.verts.map((n) => poly.verts[n]), faceMat); });
  poly.edges.forEach((e, i) => {
    const ln = { id: ++S.uid, kind: 'edge', ei: i, p: e.pa, d: V.sub(e.pb, e.pa), t0: 0, t1: 1, name: e.label };
    ln.obj = seg(e.pa, e.pb, M.edge, 2);
    S.lines.push(ln);
  });
  poly.names.forEach((n) => addPoint(n, poly.verts[n], prep.given.some((g) => g.vertex === n) ? 'given' : 'vertex', { vertex: n }));
  prep.given.filter((g) => !g.vertex).forEach((g) => addPoint(g.name, g.pos, 'given', { edge: g.edge }));
  document.body.classList.toggle('demo-mode', !!task.demo);
  document.body.classList.toggle('teacher-mode', !!task.preview);
  setTool(S.tool || 'line', true);
  if (!task.preview) setHash(task.demo ? 'demo-' + task.id : TASKS.includes(task) ? 'task-' + task.id : 'c=' + encodeTask(task));
  if (task.demo) { runDemo(demoStep); return; }
  if (task.preview) { renderTeacherInfo(); renderTaskList(); return; }
  renderPanel();
  say(`Начните с инструмента «Прямая»: соедините точки, лежащие в одной грани.`);
  renderTaskList();
}

// ----- Пошаговый разбор -----
const ptByName = (n) => S.points.find((p) => p.name === n);
function lineByName(nm) {
  const byName = S.lines.find((l) => l.name === sub(nm));
  if (byName) return byName;
  const [a, b] = splitNames(nm).map(ptByName);
  return a && b ? S.lines.find((l) => onLine(l, a.pos) && onLine(l, b.pos)) : null;
}
function runDemo(k) {
  const steps = S.task.steps;
  S.demoStep = k;
  let last = [];
  steps.slice(0, k).forEach((st) => {
    if (st.do === 'line') { const ln = makeLineThrough(ptByName(st.p[0]), ptByName(st.p[1])); last = ln ? [ln] : []; }
    if (st.do === 'par') { const ln = makeParallel(ptByName(st.through), lineByName(st.like), st.name); last = ln ? [ln] : []; }
    if (st.do === 'meet') { const pt = intersect(lineByName(st.a), lineByName(st.b), st.name); last = pt ? [pt] : []; }
    if (st.do === 'section') { const pts = S.prep.target.map((t) => t.pos); S.secObjs.push(fan(pts, secMat), polyline(pts, M.secLine, true, 5)); last = []; }
  });
  S.sel = last;
  renderPanel();
  renderTaskList();
  say(k ? `<b>Шаг ${k}.</b> ${steps[k - 1].text}` : 'Даны точки на рёбрах (и в гранях). Нажмите «Далее», чтобы начать построение.', k === steps.length ? 'ok' : '');
}
function renderDemo() {
  const steps = S.task.steps, k = S.demoStep;
  $('demoNote').textContent = S.task.note || '';
  $('demoNote').hidden = !S.task.note;
  const shown = quizOn ? steps.slice(0, k) : steps;
  $('demoSteps').innerHTML = shown.map((st, i) => `<li class="${i < k - 1 ? 'done' : i === k - 1 ? 'cur' : 'todo'}"><button data-step="${i + 1}">${st.text}</button></li>`).join('');
  $('demoPrev').disabled = k === 0;
  $('demoNext').disabled = k === steps.length || quizOn;
  renderQuiz();
  $('demoNext').textContent = k === 0 ? 'Начать построение' : k === steps.length ? 'Построение завершено' : 'Далее';
  $('demoCount').textContent = `${k} из ${steps.length}`;
  const cur = $('demoSteps').querySelector('.cur');
  if (cur && !document.body.classList.contains('theory-mode')) {
    const box = $('demoSteps').closest('.panel'), r = cur.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (box.scrollHeight > box.clientHeight && (r.top < b.top || r.bottom > b.bottom)) box.scrollTop += r.top - b.top - b.height / 3;
  }
}

// ----- Тест по шагам разбора -----
let quizOn = false;
let quiz = { id: null, mistakes: 0 };
const stepLabel = (st) => st.do === 'line' ? sub(st.p.join(''))
  : st.do === 'meet' ? `${sub(st.a)} ∩ ${sub(st.b)} = ${st.name}`
    : st.do === 'par' ? `${sub(st.name)} ∥ ${sub(st.like)}`
      : `${st.p.join('')} — искомое сечение`;
const facesOfPos = (pos) => S.poly.faces.map((f, i) => (Math.abs(V.dot(f.normal, pos) - f.d) < 1e-6 ? i : -1)).filter((i) => i >= 0);
const facesOfLine = (l) => facesOfPos(l.p).filter((i) => facesOfPos(V.add(l.p, l.d)).includes(i));
function quizOptions(k) {
  const st = S.task.steps[k];
  const opts = [{ label: stepLabel(st), ok: true }];
  const named = S.points.filter((p) => p.kind !== 'vertex');
  if (st.do === 'line' || st.do === 'par') {
    for (let i = 0; i < named.length && opts.length < 3; i++) for (let j = i + 1; j < named.length && opts.length < 3; j++) {
      const X = named[i], Y = named[j];
      const lbl = sub(X.name + Y.name);
      if (opts.some((o) => o.label === lbl) || S.lines.some((l) => onLine(l, X.pos) && onLine(l, Y.pos))) continue;
      if (facesOfPos(X.pos).some((f) => facesOfPos(Y.pos).includes(f))) continue;
      opts.push({ label: lbl, why: `Точки ${sub(X.name)} и ${sub(Y.name)} лежат в разных гранях! Соединять можно только точки одной грани.` });
    }
  }
  if (st.do === 'meet' || st.do === 'par') {
    const a = st.do === 'meet' ? lineByName(st.a) : lineByName(st.like);
    S.lines.filter((l) => l.kind === 'edge' && a && l !== a).forEach((l) => {
      if (opts.length >= 3) return;
      const r = lineLine(a.p, a.d, l.p, l.d);
      if (r.kind !== 'skew') return;
      const nm = st.do === 'meet' ? st.name : 'X';
      opts.push({ label: `${a.name} ∩ ${l.name} = ${nm}`, why: `Прямые ${a.name} и ${l.name} скрещиваются — пересекаться не могут!` });
    });
  }
  if (st.do === 'section') {
    opts.push({ label: `${st.p.slice(0, -1).join('')} — искомое сечение`, why: `Не хватает вершины ${st.p.at(-1)}: секущая плоскость пересекает ещё одну грань.` });
  }
  // устойчивое перемешивание: позиция верного ответа зависит от номера шага
  const rot = (k * 7 + 3) % opts.length;
  return opts.slice(rot).concat(opts.slice(0, rot));
}
function renderQuiz() {
  const box = $('quizBox');
  const steps = S.task.steps, k = S.demoStep;
  if (!quizOn) { box.hidden = true; return; }
  box.hidden = false;
  if (quiz.id !== S.task.id || k === 0) quiz = { id: S.task.id, mistakes: k === 0 ? 0 : quiz.mistakes };
  if (k === steps.length) {
    box.innerHTML = `<p class="quiz-q"><b>Тест пройден.</b> Ошибок: ${quiz.mistakes}.</p>`;
    return;
  }
  const opts = quizOptions(k);
  box.innerHTML = `<p class="quiz-q">Шаг ${k + 1}. Выберите верное действие:</p><div class="quiz-opts">${opts.map((o, i) => `<button class="btn quiz-opt" data-q="${i}">${o.label}</button>`).join('')}</div>`;
  box.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
    const o = opts[+b.dataset.q];
    if (o.ok) { loadTask(S.task, k + 1); return; }
    quiz.mistakes++;
    b.classList.add('wrong'); b.disabled = true;
    say(o.why, 'err');
  }));
}

// ----- Панель -----
function planeName(prep) { return prep.given.map((g) => sub(g.name)).join(''); }
function renderPanel() {
  const { task, prep, poly } = S;
  const lv = task.level;
  $('chips').innerHTML = `<span class="chip lv${lv}">${LEVELS[lv].name} уровень</span><span class="chip">${poly.def.title}</span>${task.fromDemo ? `<span class="chip">${task.fromDemo} из презентации</span>` : task.custom ? '<span class="chip">своя задача</span>' : task.random ? '<span class="chip">случайная</span>' : ''}`;
  const verts = prep.given.filter((g) => g.vertex).map((g) => sub(g.name));
  const pts = prep.given.filter((g) => !g.vertex).map((g) => sub(g.name));
  let through = '';
  if (pts.length && verts.length) through = `через ${pts.length > 1 ? 'точки' : 'точку'} <span class="m">${pts.join(', ')}</span> и ${verts.length > 1 ? 'вершины' : 'вершину'} <span class="m">${verts.join(', ')}</span>`;
  else if (pts.length) through = `через точки <span class="m">${pts.join(', ')}</span>`;
  else through = `через вершины <span class="m">${verts.join(', ')}</span>`;
  $('statement').innerHTML = `Постройте сечение ${poly.def.full} <span class="m">${poly.label}</span> плоскостью, проходящей ${through}.`;
  $('pdesc').innerHTML = task.pts.map((s) => describePoint(s)).filter(Boolean).map((t) => `<li>${t}</li>`).join('');
  $('vcount').textContent = task.demo ? '' : lv === 1 ? `Сечение имеет ${prep.target.length} вершины.` : lv === 2 ? 'Сколько вершин у сечения, выясните сами.' : 'Число вершин не сообщается. Ищите следы секущей плоскости на плоскостях граней.';
  if (task.demo) { $('chips').innerHTML = `<span class="chip">Разбор из презентации</span><span class="chip">${task.title}</span><span class="chip">${poly.def.title}</span>`; renderDemo(); renderLog(); return; }
  $('hintCost').textContent = LEVELS[lv].cost ? 'Каждая подсказка снимает одну звезду. Без подсказок — три звезды.' : 'На базовом уровне подсказки не снимают звёзд.';
  renderHints(); renderLog(); renderResult();
}
function renderHints() {
  const steps = S.prep.sol.steps;
  const n = S.revealed ? steps.length : S.hints;
  $('hintList').innerHTML = steps.slice(0, n).map((s) => `<li>${s.text}</li>`).join('');
  $('hintBtn').disabled = n >= steps.length || S.solved;
  $('hintBtn').textContent = n ? 'Следующая подсказка' : 'Первая подсказка';
  $('solveBtn').disabled = S.revealed || S.solved;
}
function renderLog() {
  const items = S.history.map((h) => `<li><span>${h.log}</span></li>`);
  $('log').innerHTML = items.length ? items.join('') : '<li class="empty">Пока пусто. Постройте первую прямую.</li>';
  $('undoBtn').disabled = !S.history.length;
}
function renderResult(html, tone) {
  const r = $('result');
  if (!html) { r.hidden = true; return; }
  r.hidden = false; r.className = 'result ' + (tone || ''); r.innerHTML = html;
}
function starsHtml(n) { n = Number.isInteger(n) ? Math.max(0, Math.min(3, n)) : null; return n == null ? '' : '<span class="stars" aria-label="' + n + ' из 3">' + '★'.repeat(n) + '<span class="off">' + '★'.repeat(3 - n) + '</span></span>'; }
function renderTaskList() {
  document.querySelectorAll('.levels button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view ? document.body.classList.contains('theory-mode') : !document.body.classList.contains('theory-mode') && +b.dataset.level === curLevel)));
  $('levelNote').textContent = LEVELS[curLevel].note;
  $('tasksTitle').textContent = curLevel ? 'Задачи уровня' : 'Задачи из презентации';
  renderResults();
  if (curLevel === 0) {
    $('taskList').innerHTML = DEMOS.map((d, i) => {
      const nm = d.pts.map((p) => sub(p.v || p.n)).join('');
      return `<li><button data-demo="${d.id}" aria-current="${S && S.task.id === d.id}"><span class="no">${String(i + 1).padStart(2, '0')}</span><span class="nm"><b>${POLY_DEFS[d.poly].title}</b><span>сечение через ${nm}</span></span></button></li>`;
    }).join('');
    return;
  }
  const list = TASKS.filter((t) => t.level === curLevel);
  if (randomTasks[curLevel]) list.push(randomTasks[curLevel]);
  $('taskList').innerHTML = list.map((t, i) => {
    const poly = POLY_DEFS[t.poly];
    const nm = t.pts.map((p) => sub(p.v || p.n)).join('');
    const st = progress[t.id];
    const calc = calcDone[t.id] ? '<span class="calc-mark" title="Вычисление решено">∑</span>' : '';
    return `<li><button data-id="${t.id}" aria-current="${S && S.task.id === t.id}"><span class="no">${t.random ? '∗' : String(i + 1).padStart(2, '0')}</span><span class="nm"><b>${poly.title}</b><span>сечение ${nm}</span></span><span class="marks">${calc}${starsHtml(st)}</span></button></li>`;
  }).join('');
}

// ----- Сообщения -----
let tipTimer = 0;
function say(html, tone = '') { const s = $('status'); s.className = 'status ' + tone; s.innerHTML = html; }
const m = (t) => `<span class="m">${t}</span>`;

// ----- Инструменты -----
const TOOL_HELP = {
  line: 'Прямая: выберите две точки — вершины, данные или построенные.',
  intersect: 'Пересечение: выберите две прямые (рёбра или ваши прямые), лежащие в одной плоскости.',
  parallel: 'Параллель: выберите точку и прямую — через точку пройдёт параллельная прямая.',
  section: 'Сечение: по очереди отметьте вершины сечения, затем нажмите на первую точку или «Проверить сечение».',
};
function setTool(t, silent) {
  S.tool = t; clearSel();
  document.querySelectorAll('.tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  if (!silent) say(TOOL_HELP[t]);
}
function clearSel() {
  S.sel = []; S.secSel = [];
  if (S.prevObj) { removeObj(S.prevObj); S.prevObj = null; }
}

function pushHistory(log, undo) { S.history.push({ log, undo }); renderLog(); }
function undo() {
  const h = S.history.pop(); if (!h) return;
  h.undo(); clearSel(); renderLog(); say('Последнее построение отменено.');
}

function makeLineThrough(A, B) {
  const ex = S.lines.find((l) => onLine(l, A.pos) && onLine(l, B.pos));
  if (ex) {
    say(`Прямая ${m(sub(A.name + B.name))} уже есть: ${ex.kind === 'edge' ? 'это ребро ' + m(ex.name) : m(ex.name)}.`, 'warn');
    return;
  }
  const d = V.sub(B.pos, A.pos);
  const ln = addLine(A.pos, d, -0.2, 1.2, sub(A.name + B.name));
  pushHistory(`прямая ${ln.name}`, () => { removeObj(ln.obj); S.lines = S.lines.filter((l) => l !== ln); });
  const common = S.poly.faces.filter((f) => [A, B].every((P) => Math.abs(V.dot(f.normal, P.pos) - f.d) < 1e-6));
  const where = common.length ? ` Она лежит в плоскости грани ${m(common.map((f) => f.label).join(', '))}.` : ' Прямая не лежит ни в одной грани: она проходит внутри или вне многогранника.';
  say(`Проведена прямая ${m(ln.name)}.${where}`, common.length ? '' : 'warn');
  return ln;
}

function makeParallel(P, L, forced) {
  if (onLine(L, P.pos)) { say(`Точка ${m(sub(P.name))} лежит на прямой ${m(L.name)} — параллельная совпадёт с ней.`, 'warn'); return; }
  const d = V.mul(V.norm(L.d), 1);
  if (S.lines.some((l) => onLine(l, P.pos) && V.len(V.cross(V.norm(l.d), d)) < 1e-7)) { say('Такая прямая уже построена.', 'warn'); return; }
  const name = forced ? sub(forced) : 'ℓ' + sub(String(++lineNo));
  const ln = addLine(P.pos, d, -0.7, 0.7, name);
  pushHistory(`${name} ∥ ${L.name}, через ${sub(P.name)}`, () => { removeObj(ln.obj); S.lines = S.lines.filter((l) => l !== ln); if (!forced) lineNo--; });
  say(`Проведена прямая ${m(name)} через ${m(sub(P.name))} параллельно ${m(L.name)}. Найдите её пересечения с рёбрами.`);
  return ln;
}

function edgeOfPoint(pos) {
  return S.poly.edges.findIndex((e) => {
    const d = V.sub(e.pb, e.pa), t = V.dot(V.sub(pos, e.pa), d) / V.dot(d, d);
    return t > -1e-7 && t < 1 + 1e-7 && V.dist(pos, V.lerp(e.pa, e.pb, t)) < 1e-6;
  });
}

function intersect(A, B, forced) {
  const r = lineLine(A.p, A.d, B.p, B.d);
  const nm = `${m(A.name)} и ${m(B.name)}`;
  if (r.kind === 'same') return say(`${nm} — одна и та же прямая.`, 'warn');
  if (r.kind === 'parallel') return say(`Прямые ${nm} параллельны и не пересекаются. Здесь пригодится инструмент «Параллель».`, 'err');
  if (r.kind === 'skew') return say(`Прямые ${nm} скрещиваются — они не лежат в одной плоскости. Пересекать можно только прямые одной грани (или одной плоскости).`, 'err');
  const pos = r.pos;
  const oldA = [A.t0, A.t1], oldB = [B.t0, B.t1];
  extendTo(A, pos); extendTo(B, pos);
  const restore = () => { [A.t0, A.t1] = oldA; [B.t0, B.t1] = oldB; redrawLine(A); redrawLine(B); };
  const ex = S.points.find((p) => V.dist(p.pos, pos) < 1e-6);
  if (ex) {
    say(`Прямые ${nm} пересекаются в уже отмеченной точке ${m(sub(ex.name))}.`);
    if (oldA[0] !== A.t0 || oldA[1] !== A.t1 || oldB[0] !== B.t0 || oldB[1] !== B.t1) pushHistory(`продление до ${sub(ex.name)}`, restore);
    return;
  }
  const name = forced || nextName();
  const ei = edgeOfPoint(pos);
  const pt = addPoint(name, pos, 'built', { edge: ei >= 0 ? ei : undefined });
  pushHistory(`${sub(name)} = ${A.name} ∩ ${B.name}`, () => { removePoint(pt); restore(); });
  const where = ei >= 0 ? ` Она лежит на ребре ${m(S.poly.edges[ei].label)}.` : ' Точка лежит вне рёбер — это вспомогательная точка следа.';
  say(`Построена точка ${m(sub(name))} = ${A.name} ∩ ${B.name}.${where}`, ei >= 0 ? 'ok' : '');
  return pt;
}

// ----- Сечение -----
function updatePreview() {
  if (S.prevObj) { removeObj(S.prevObj); S.prevObj = null; }
  if (S.secSel.length >= 2) S.prevObj = polyline(S.secSel.map((p) => p.pos), M.secPrev, false, 5);
}
function check() {
  if (S.solved) return;
  const sel = S.secSel;
  const { plane, target } = S.prep;
  if (S.tool !== 'section' || sel.length < 3) {
    setTool('section', true);
    say('Выберите инструмент «Сечение» и отметьте по порядку вершины сечения (не меньше трёх).', 'warn');
    renderResult('Сначала отметьте вершины сечения инструментом <b>«Сечение»</b>.', 'err');
    return;
  }
  const off = sel.find((p) => Math.abs(V.dot(plane.n, p.pos) - plane.d) > 1e-6);
  if (off) return fail(`Точка ${m(sub(off.name))} не лежит в секущей плоскости ${m(planeName(S.prep))}.`);
  const notEdge = sel.find((p) => !p.vertex && edgeOfPoint(p.pos) < 0);
  if (notEdge) return fail(`Точка ${m(sub(notEdge.name))} лежит в секущей плоскости, но вне поверхности многогранника. Вершины сечения лежат на рёбрах.`);
  const missing = target.filter((t) => !sel.some((p) => V.dist(p.pos, t.pos) < 1e-6));
  if (missing.length) {
    const lv = S.task.level;
    const tail = lv === 1 ? ` Не хватает ${missing.length} ${missing.length === 1 ? 'вершины' : 'вершин'}.` : '';
    return fail(`Все отмеченные точки лежат в секущей плоскости, но это ещё не всё сечение.${tail} Плоскость пересекает и другие грани — найдите точки на их рёбрах.`);
  }
  if (sel.length !== target.length) return fail('Некоторые вершины отмечены дважды или лишние. Отметьте каждую вершину один раз.');
  // успех
  S.solved = true;
  const ordered = target.map((t) => sel.find((p) => V.dist(p.pos, t.pos) < 1e-6));
  clearSel();
  S.secObjs.push(fan(target.map((t) => t.pos), secMat), polyline(target.map((t) => t.pos), M.secLine, true, 5));
  const lv = S.task.level;
  const stars = S.revealed ? 0 : Math.max(1, 3 - S.hints * LEVELS[lv].cost);
  if (!S.task.random) { progress[S.task.id] = Math.max(progress[S.task.id] ?? 0, stars); saveProgress(); }
  else progress[S.task.id] = stars;
  const name = ordered.map((p) => sub(p.name)).join('');
  renderResult(`<b>Верно!</b> Сечение ${m(name)} — ${NGON[target.length] || target.length + '-угольник'}. ${starsHtml(stars)}<br>Построений: ${S.history.length}, подсказок: ${S.revealed ? 'показано решение' : S.hints}.<div class="btn-row" style="margin-top:8px"><button class="btn primary" id="nextBtn">Следующая задача</button></div>`, 'ok');
  $('nextBtn').addEventListener('click', nextTask);
  if (S.poly.def.calc) renderCalc();
  say(`Сечение построено: ${m(name)}.`, 'ok');
  renderHints(); renderTaskList();
}
function renderCalc() {
  const { k, cond } = S.poly.def.calc;
  const per = S.task.level === 1;
  const what = per ? 'периметр' : 'площадь';
  const ans = per ? perimeterOf(S.prep.target) * k : polyArea(S.prep.target) * k * k;
  const box = document.createElement('div');
  box.className = 'calc';
  box.innerHTML = `<h3>Задача на вычисление · как в ЕГЭ</h3><p>${cond} Найдите ${what} построенного сечения. Ответ округлите до сотых.</p>
    <div class="calc-row"><input id="calcIn" inputmode="decimal" autocomplete="off" placeholder="Ответ" aria-label="Ответ"><button class="btn primary" id="calcBtn">Проверить</button><button class="btn" id="calcShow">Показать ответ</button></div><p class="calc-msg" id="calcMsg" role="status"></p>`;
  $('result').appendChild(box);
  const fmt = (x) => x.toFixed(2).replace('.', ',');
  const checkCalc = () => {
    const x = Number(String($('calcIn').value).trim().replace(',', '.'));
    if (!Number.isFinite(x)) { $('calcMsg').textContent = 'Введите число, например 12,73.'; return; }
    if (Math.abs(x - ans) <= 0.011 + ans * 0.001) {
      $('calcMsg').textContent = `Верно: ${fmt(ans)}.`; $('calcMsg').className = 'calc-msg ok';
      if (TASKS.some((t) => t.id === S.task.id)) { calcDone[S.task.id] = true; saveCalc(); renderTaskList(); renderResults(); }
    } else { $('calcMsg').textContent = 'Неверно. Найдите длины сторон сечения по теореме Пифагора или подобию треугольников.'; $('calcMsg').className = 'calc-msg err'; }
  };
  $('calcBtn').addEventListener('click', checkCalc);
  $('calcIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') checkCalc(); });
  $('calcShow').addEventListener('click', () => { $('calcMsg').textContent = `Ответ: ${fmt(ans)}.`; $('calcMsg').className = 'calc-msg'; });
}
function fail(msg) { say(msg, 'err'); renderResult(msg, 'err'); }
function nextTask() {
  const list = TASKS.filter((t) => t.level === curLevel);
  const i = list.findIndex((t) => t.id === S.task.id);
  if (i >= 0 && i + 1 < list.length) return loadTask(list[i + 1]);
  if (curLevel < MAXLV) { curLevel++; storeLevel(); return loadTask(TASKS.find((t) => t.level === curLevel)); }
  genTask();
}
function reveal() {
  if (S.revealed) return;
  S.revealed = true;
  const pts = S.prep.target.map((t) => t.pos);
  S.secObjs.push(fan(pts, secMat), polyline(pts, M.solLine, true, 5));
  renderHints();
  say('Решение показано: многоугольник сечения выделен, шаги построения — в подсказках. Повторите их инструментами, чтобы закрепить.', 'warn');
}

// ----- Выбор мышью -----
const coarse = matchMedia('(pointer: coarse)').matches;
function scr(p) { const v = TV(p).project(camera); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, v.z]; }
function pickPoint(x, y) {
  let best = null, bd = coarse ? 24 : 15;
  S.points.forEach((p) => { const [sx, sy] = scr(p.pos); const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = p; } });
  return best;
}
function pickLine(x, y) {
  let best = null, bd = coarse ? 18 : 10;
  S.lines.forEach((l) => {
    const [t0, t1] = lineRange(l);
    const [ax, ay] = scr(V.add(l.p, V.mul(l.d, t0))), [bx, by] = scr(V.add(l.p, V.mul(l.d, t1)));
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    const d = Math.hypot(ax + u * dx - x, ay + u * dy - y);
    if (d < bd) { bd = d; best = l; }
  });
  return best;
}
function pickFor(x, y) {
  const t = S.tool;
  if (t === 'line' || t === 'section') { const p = pickPoint(x, y); return p && { type: 'point', obj: p }; }
  if (t === 'intersect') { const l = pickLine(x, y); return l && { type: 'line', obj: l }; }
  const p = pickPoint(x, y); if (p) return { type: 'point', obj: p };
  const l = pickLine(x, y); return l && { type: 'line', obj: l };
}
function handleClick(x, y) {
  if (S.task.demo || S.task.preview) return;
  if (S.solved && S.tool === 'section') return;
  const hit = pickFor(x, y);
  const t = S.tool;
  if (!hit) { say(TOOL_HELP[t]); return; }
  const o = hit.obj;
  if (t === 'line') {
    if (S.sel.includes(o)) { S.sel = []; say(TOOL_HELP.line); return; }
    S.sel.push(o);
    if (S.sel.length === 2) { const [A, B] = S.sel; S.sel = []; makeLineThrough(A, B); }
    else say(`Выбрана точка ${m(sub(o.name))}. Теперь вторая точка.`);
  } else if (t === 'intersect') {
    if (S.sel.includes(o)) { S.sel = []; say(TOOL_HELP.intersect); return; }
    S.sel.push(o);
    if (S.sel.length === 2) { const [A, B] = S.sel; S.sel = []; intersect(A, B); }
    else say(`Выбрана прямая ${m(o.name)}. Теперь вторая прямая.`);
  } else if (t === 'parallel') {
    const P = S.sel.find((s) => s.pos && !s.d), L = S.sel.find((s) => s.d);
    if (hit.type === 'point') S.sel = L ? [o, L] : [o]; else S.sel = P ? [P, o] : [o];
    const P2 = S.sel.find((s) => !s.d), L2 = S.sel.find((s) => s.d);
    if (P2 && L2) { S.sel = []; makeParallel(P2, L2); }
    else say(hit.type === 'point' ? `Точка ${m(sub(o.name))}. Теперь выберите прямую, которой нужна параллель.` : `Прямая ${m(o.name)}. Теперь выберите точку.`);
  } else if (t === 'section') {
    if (S.secSel[0] === o && S.secSel.length >= 3) { check(); return; }
    if (S.secSel.includes(o)) { say(`Точка ${m(sub(o.name))} уже отмечена.`, 'warn'); return; }
    S.secSel.push(o); updatePreview();
    say(`Вершины: ${m(S.secSel.map((p) => sub(p.name)).join(' → '))}. ${S.secSel.length >= 3 ? 'Нажмите на первую точку или «Проверить сечение».' : 'Продолжайте.'}`);
  }
}

let down = null;
const cvs = renderer.domElement;
cvs.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
cvs.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]);
  down = null;
  if (moved > 6) return;
  const r = cvs.getBoundingClientRect();
  handleClick(e.clientX - r.left, e.clientY - r.top);
});
cvs.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  const r = cvs.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const hit = e.buttons ? null : pickFor(x, y);
  S.hover = hit ? hit.obj : null;
  cvs.classList.toggle('hit', !!hit);
  const tip = $('tip');
  if (hit) {
    tip.hidden = false; tip.style.left = x + 'px'; tip.style.top = y + 'px';
    const fs = hit.type === 'point' ? facesOfPos(hit.obj.pos) : facesOfLine(hit.obj);
    const where = fs.length ? ' · ' + (fs.length > 1 ? 'грани ' : 'грань ') + fs.map((i) => S.poly.faces[i].label).join(', ') : '';
    let txt = (hit.type === 'point' ? 'точка ' + sub(hit.obj.name) : (hit.obj.kind === 'edge' ? 'прямая ребра ' : 'прямая ') + hit.obj.name) + where;
    const A = S.tool === 'line' && S.sel.length === 1 && hit.type === 'point' && hit.obj !== S.sel[0] ? S.sel[0] : null;
    if (A && !facesOfPos(A.pos).some((f) => fs.includes(f))) txt = `${sub(A.name)} и ${sub(hit.obj.name)}: нет общей грани`;
    tip.textContent = txt;
  }
  else tip.hidden = true;
});
cvs.addEventListener('pointerleave', () => { S.hover = null; $('tip').hidden = true; });

// ----- Кнопки -----
document.querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
const demoTask = (d) => ({ ...d, level: 0, demo: true });
function openDemo(id, step = 0) { curLevel = 0; storeLevel(); showTheory(false); loadTask(demoTask(DEMOS.find((d) => d.id === id)), step); }
function showTheory(on) {
  document.body.classList.toggle('theory-mode', on);
  $('theory').hidden = !on;
  if (on) { $('theory').scrollTop = 0; window.scrollTo(0, 0); setHash('theory'); }
  renderTaskList();
}
document.querySelectorAll('.levels button').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.view === 'theory') { showTheory(true); return; }
  showTheory(false);
  curLevel = +b.dataset.level; storeLevel();
  if (curLevel === 0) openDemo(DEMOS[0].id);
  else loadTask(TASKS.find((t) => t.level === curLevel));
}));
$('theory').addEventListener('click', (e) => {
  const b = e.target.closest('[data-open]'); if (b) { openDemo(b.dataset.open); return; }
  const lv = e.target.closest('[data-level-open]');
  if (lv) { showTheory(false); curLevel = +lv.dataset.levelOpen; storeLevel(); loadTask(TASKS.find((t) => t.level === curLevel)); }
});
$('demoPrev').addEventListener('click', () => loadTask(S.task, S.demoStep - 1));
$('demoNext').addEventListener('click', () => loadTask(S.task, S.demoStep + 1));
$('demoReset').addEventListener('click', () => loadTask(S.task, 0));
$('demoSteps').addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b) loadTask(S.task, +b.dataset.step); });
$('demoTry').addEventListener('click', () => {
  const d = S.task, p = prepareTask({ ...d, level: 2 });
  curLevel = classify(p); storeLevel();
  loadTask({ id: 'try-' + d.id, level: curLevel, poly: d.poly, pts: d.pts, random: true, fromDemo: d.title });
  say(`Теперь постройте сечение ${d.title.toLowerCase()} сами — инструментами на панели.`);
});
$('taskList').addEventListener('click', (e) => {
  const dm = e.target.closest('button[data-demo]'); if (dm) { openDemo(dm.dataset.demo); return; }
  const b = e.target.closest('button[data-id]'); if (!b) return;
  const t = TASKS.find((x) => x.id === b.dataset.id) || Object.values(randomTasks).find((x) => x && x.id === b.dataset.id);
  if (t) loadTask(t);
});
function storeLevel() { try { localStorage.setItem('sec-lab-level', String(curLevel)); } catch (e) { /* нет хранилища */ } }
function genTask() {
  const t = randomTask(curLevel, $('genPoly').value || undefined);
  if (!t) { say('Не удалось подобрать задачу для этого многогранника и уровня. Попробуйте другой многогранник.', 'warn'); return; }
  randomTasks[curLevel] = t; loadTask(t);
  say('Новая задача готова. Точки выбраны случайно, сложность соответствует уровню.');
}
$('genBtn').addEventListener('click', genTask);
$('checkBtn').addEventListener('click', check);
$('clearBtn').addEventListener('click', () => loadTask(S.task));
$('undoBtn').addEventListener('click', undo);
$('viewBtn').addEventListener('click', resetView);
$('hintBtn').addEventListener('click', () => { S.hints++; renderHints(); });
$('solveBtn').addEventListener('click', reveal);
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if (S.task.preview) return;
  if (S.task.demo) {
    if (quizOn) return;
    if (e.key === 'ArrowRight' && S.demoStep < S.task.steps.length) loadTask(S.task, S.demoStep + 1);
    if (e.key === 'ArrowLeft' && S.demoStep > 0) loadTask(S.task, S.demoStep - 1);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  const tools = { 1: 'line', 2: 'intersect', 3: 'parallel', 4: 'section' };
  if (tools[e.key]) setTool(tools[e.key]);
  if (e.key === 'Escape') { clearSel(); say(TOOL_HELP[S.tool]); }
  if (e.key === 'Enter' && S.tool === 'section') check();
});

// ----- Кадр -----
function frame() {
  requestAnimationFrame(frame);
  controls.update();
  const cam = fromTV(camera.position);
  const poly = S.poly;
  const front = poly.faces.map((f) => V.dot(f.normal, V.sub(cam, f.center)) > 0);
  const selSet = new Set([...S.sel, ...S.secSel]);
  S.lines.forEach((l) => {
    let mat;
    if (selSet.has(l)) mat = M.sel;
    else if (S.hover === l) mat = M.hover;
    else if (l.kind === 'edge') mat = poly.edges[l.ei].faces.some((fi) => front[fi]) ? M.edge : M.hidden;
    else mat = M.user;
    if (l.obj.material !== mat) l.obj.material = mat;
  });
  // подсветка граней, в которых лежит точка или прямая под курсором
  const h = S.hover;
  let hi = h ? (h.d ? facesOfLine(h) : facesOfPos(h.pos)) : [];
  let bad = false;
  if (h && !h.d && S.tool === 'line' && S.sel.length === 1 && S.sel[0] !== h) {
    const fa = facesOfPos(S.sel[0].pos);
    const common = hi.filter((f) => fa.includes(f));
    if (common.length) hi = common; else bad = true;
  }
  poly.faces.forEach((f, i) => { const mt = hi.includes(i) ? (bad ? faceBad : faceHi) : faceMat; if (f.mesh.material !== mt) f.mesh.material = mt; });
  const [cx, cy] = scr(poly.center);
  S.points.forEach((p) => {
    const sel = selSet.has(p) || S.hover === p;
    p.mesh.material = sel ? PM.sel : PM[p.kind];
    p.mesh.scale.setScalar(sel ? 1.6 : 1);
    const [x, y, z] = scr(p.pos);
    let dx = x - cx, dy = y - cy; const L = Math.hypot(dx, dy);
    if (L < 8) { dx = 0.7; dy = -0.7; } else { dx /= L; dy /= L; }
    const off = p.kind === 'built' ? 14 : 15;
    p.el.style.transform = `translate(${(x + dx * off).toFixed(1)}px, ${(y + dy * off).toFixed(1)}px) translate(-50%, -50%)`;
    p.el.hidden = z > 1;
    if (p.vertex) p.el.classList.toggle('dim', !poly.vertFaces(p.vertex).some((fi) => front[fi]));
  });
  renderer.render(scene, camera);
}

$('quizToggle').addEventListener('change', (e) => { quizOn = e.target.checked; loadTask(S.task, 0); });

// ----- Ссылки на задачи -----
function setHash(h) { try { history.replaceState(null, '', '#' + h); } catch (e) { /* без адресной строки */ } }
function encodeTask(task) {
  const enc = (p) => {
    if (p.v) return 'v.' + p.v;
    if (p.face) return `${p.n}.f.${p.face.join('-')}.${p.w.map((w) => Math.max(1, Math.round(w * 1000))).join('-')}`;
    for (let q = 2; q <= 24; q++) { const a = Math.round(p.t * q); if (a > 0 && a < q && Math.abs(p.t * q - a) < 1e-6) return `${p.n}.${p.on[0]}.${p.on[1]}.${a}.${q - a}`; }
    const a = Math.round(p.t * 1000); return `${p.n}.${p.on[0]}.${p.on[1]}.${a}.${1000 - a}`;
  };
  return task.poly + '~' + task.pts.map(enc).join('~');
}
// строгий разбор: всё, что не соответствует формату, отбрасывается
function decodeTask(str) {
  const parts = String(str).split('~');
  if (parts.length !== 4 || !Object.prototype.hasOwnProperty.call(POLY_DEFS, parts[0])) return null;
  const poly = buildPoly(parts[0]);
  const pts = [], names = new Set();
  for (const tok of parts.slice(1)) {
    let mm;
    if ((mm = /^v\.([A-Z]1?)$/.exec(tok))) {
      if (!poly.names.includes(mm[1]) || names.has(mm[1])) return null;
      names.add(mm[1]); pts.push({ v: mm[1] });
    } else if ((mm = /^([A-Z])\.([A-Z]1?)\.([A-Z]1?)\.(\d{1,4})\.(\d{1,4})$/.exec(tok))) {
      const [, n, a, b, p, q] = mm;
      if (poly.names.includes(n) || names.has(n) || poly.findEdge(a, b) === undefined || +p < 1 || +q < 1) return null;
      names.add(n); pts.push({ n, on: [a, b], t: +p / (+p + +q) });
    } else if ((mm = /^([A-Z])\.f\.((?:[A-Z]1?-){2,5}[A-Z]1?)\.((?:\d{1,4}-){2,5}\d{1,4})$/.exec(tok))) {
      const [, n, vs, ws] = mm;
      const face = vs.split('-'), w = ws.split('-').map(Number);
      const f = poly.faces.find((x) => x.verts.length === face.length && face.every((v) => x.verts.includes(v)));
      if (!f || w.length !== face.length || w.some((x) => x < 1) || poly.names.includes(n) || names.has(n)) return null;
      const sw = w.reduce((x, y) => x + y, 0);
      names.add(n); pts.push({ n, face, w: w.map((x) => x / sw) });
    } else return null;
  }
  const task = { id: 'c-' + str.slice(0, 80), poly: parts[0], pts, random: true, custom: true, level: 2 };
  const p = prepareTask(task);
  if (!p.plane || p.target.length < 3 || !p.sol.ok) return null;
  task.level = classify(p);
  return task;
}
function openFromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === 'theory') { showTheory(true); return true; }
  let mm;
  if ((mm = /^demo-(d\d)$/.exec(h)) && DEMOS.some((d) => d.id === mm[1])) { openDemo(mm[1]); return true; }
  if ((mm = /^task-([a-z]\d{1,2})$/.exec(h))) { const t = TASKS.find((x) => x.id === mm[1]); if (t) { curLevel = t.level; loadTask(t); return true; } }
  if (h.startsWith('c=')) {
    const t = decodeTask(h.slice(2));
    if (t) { curLevel = t.level; loadTask(t); say('Задача открыта по ссылке. Постройте сечение.'); return true; }
    loadTask(TASKS[0]); say('Ссылка на задачу повреждена — открыта первая задача.', 'warn'); return true;
  }
  return false;
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); say(okMsg, 'ok'); }
  catch (e) { const f = $('copyFallback'); f.hidden = false; f.value = text; f.focus(); f.select(); say('Скопируйте ссылку вручную: она выделена в поле под условием.', 'warn'); }
}
$('linkBtn').addEventListener('click', () => copyText(location.href, 'Ссылка на задачу скопирована. Отправьте её ученикам.'));

// ----- Конструктор задачи для учителя -----
const RATIOS = [[1, 1], [1, 2], [2, 1], [1, 3], [3, 1], [2, 3], [3, 2]];
const TNAMES = ['K', 'L', 'M'];
function fillTeacherSelects(i) {
  const poly = buildPoly($('tPoly').value);
  const type = $('tType' + i).value;
  const tg = $('tTarget' + i), prev = tg.value;
  const opts = type === 'vertex' ? poly.names.map((n) => [n, sub(n)])
    : type === 'face' ? poly.faces.map((f) => [f.verts.join('-'), 'грань ' + f.label])
      : poly.edges.map((e) => [e.la + '|' + e.lb, 'ребро ' + e.label]);
  tg.innerHTML = '';
  opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; tg.appendChild(o); });
  if (opts.some(([v]) => v === prev)) tg.value = prev;
  $('tRatio' + i).hidden = type !== 'edge';
}
function teacherTask() {
  const pts = [0, 1, 2].map((i) => {
    const type = $('tType' + i).value, v = $('tTarget' + i).value;
    if (type === 'vertex') return { v };
    if (type === 'face') { const face = v.split('-'); return { n: TNAMES[i], face, w: face.map(() => 1 / face.length) }; }
    const [a, b] = v.split('|'), [p, q] = RATIOS[+$('tRatio' + i).value];
    return { n: TNAMES[i], on: [a, b], t: p / (p + q) };
  });
  return { id: 'preview', poly: $('tPoly').value, pts, preview: true, level: 2 };
}
function previewTeacher() { loadTask(teacherTask()); }
function renderTeacherInfo() {
  const p = S.prep, info = $('tInfo');
  const vs = S.task.pts.filter((x) => x.v).map((x) => x.v);
  let msg, ok = false;
  if (new Set(vs).size !== vs.length) msg = 'Одна и та же вершина выбрана дважды.';
  else if (!p.plane) msg = 'Точки лежат на одной прямой — плоскость не задана.';
  else if (p.target.length < 3) msg = 'Плоскость только касается многогранника — сечения нет.';
  else if (isFacePlane(p)) msg = 'Все точки лежат в одной грани — сечение совпадает с гранью.';
  else if (!p.sol.ok) msg = 'Такую задачу не решить инструментами лаборатории. Сдвиньте точки.';
  else { ok = true; const lv = classify(p); S.task.level = lv; msg = `Сечение — ${NGON[p.target.length] || p.target.length + '-угольник'}. Уровень: ${LEVELS[lv].name.toLowerCase()}. Шагов в подсказке: ${p.sol.steps.length}.`; }
  info.textContent = msg; info.className = 'tinfo ' + (ok ? 'ok' : 'err');
  $('tSolve').disabled = !ok; $('tLink').disabled = !ok;
}
const isFacePlane = (p) => p.poly.faces.some((f) => Math.abs(Math.abs(V.dot(f.normal, p.plane.n)) - 1) < 1e-6 && Math.abs(V.dot(f.normal, p.given[0].pos) - f.d) < 1e-6);
// стартовая расстановка: первая тройка рёбер, дающая решаемую задачу с хорошим сечением
function teacherDefaults() {
  const poly = buildPoly($('tPoly').value), E = poly.edges;
  [0, 1, 2].forEach((i) => { $('tType' + i).value = 'edge'; $('tRatio' + i).value = '0'; fillTeacherSelects(i); });
  for (let a = 0; a < E.length; a++) for (let b = a + 1; b < E.length; b++) for (let c = b + 1; c < E.length; c++) {
    const pts = [a, b, c].map((ei, i) => ({ n: TNAMES[i], on: [E[ei].la, E[ei].lb], t: 0.5 }));
    const p = prepareTask({ poly: poly.key, pts });
    if (p.plane && p.target.length >= 4 && p.sol.ok && !isFacePlane(p) && polyArea(p.target) > 0.8) {
      [a, b, c].forEach((ei, i) => { $('tTarget' + i).value = E[ei].la + '|' + E[ei].lb; });
      return;
    }
  }
}
function openTeacher() {
  showTheory(false);
  teacherDefaults();
  previewTeacher();
  say('Конструктор: выберите многогранник и три точки. Сцена обновляется сразу.');
}
$('tPoly').addEventListener('change', () => { teacherDefaults(); previewTeacher(); });
[0, 1, 2].forEach((i) => {
  $('tType' + i).addEventListener('change', () => { fillTeacherSelects(i); previewTeacher(); });
  $('tTarget' + i).addEventListener('change', previewTeacher);
  $('tRatio' + i).addEventListener('change', previewTeacher);
});
$('teacherBtn').addEventListener('click', openTeacher);
$('tClose').addEventListener('click', () => { loadTask(TASKS.find((t) => t.level === (curLevel || 1)) || TASKS[0]); });
$('tSolve').addEventListener('click', () => { const t = { ...S.task, preview: false, random: true, custom: true, id: 'c-' + encodeTask(S.task) }; curLevel = t.level; loadTask(t); });
$('tLink').addEventListener('click', () => {
  const url = location.href.split('#')[0] + '#c=' + encodeTask(S.task);
  copyText(url, 'Ссылка для учеников скопирована. По ней откроется эта задача.');
});

// ----- Результаты и код для учителя -----
function renderResults() {
  const solved = TASKS.filter((t) => progress[t.id] != null && progress[t.id] > 0);
  const stars = solved.reduce((a, t) => a + progress[t.id], 0);
  const calcs = Object.keys(calcDone).length;
  $('resSummary').textContent = `Решено ${solved.length} из ${TASKS.length} задач, звёзд: ${stars}, вычислений: ${calcs}.`;
}
const b64e = (str) => { const bytes = new TextEncoder().encode(str); let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64d = (str) => { const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };
const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
function makeCode(name) {
  const p = {}; TASKS.forEach((t) => { if (progress[t.id] != null) p[t.id] = progress[t.id]; });
  const json = JSON.stringify({ v: 1, n: name, d: new Date().toISOString().slice(0, 10), p, c: Object.keys(calcDone) });
  return 'SL1.' + b64e(json) + '.' + fnv(json + '|sechenia');
}
function readCode(code) {
  const parts = String(code).trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'SL1' || !/^[A-Za-z0-9_-]{1,4000}$/.test(parts[1])) return null;
  let json, data;
  try { json = b64d(parts[1]); data = JSON.parse(json); } catch (e) { return null; }
  if (fnv(json + '|sechenia') !== parts[2]) return { forged: true };
  if (!data || typeof data !== 'object' || typeof data.n !== 'string') return null;
  const p = {};
  if (data.p && typeof data.p === 'object') TASKS.forEach((t) => { const v = data.p[t.id]; if (Number.isInteger(v) && v >= 0 && v <= 3) p[t.id] = v; });
  const c = Array.isArray(data.c) ? data.c.filter((id) => TASKS.some((t) => t.id === id)) : [];
  const d = typeof data.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.d) ? data.d : '';
  return { n: data.n.slice(0, 40), d, p, c };
}
function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
function openModal(kind) {
  const body = $('modalBody');
  body.replaceChildren();
  if (kind === 'student') {
    $('modalTitle').textContent = 'Код для учителя';
    body.append(el('p', 'Код содержит ваше имя и результаты по всем задачам. Отправьте его учителю — он увидит таблицу решённых задач.'));
    const name = el('input'); name.id = 'stName'; name.maxLength = 40; name.placeholder = 'Фамилия и имя'; name.autocomplete = 'name';
    try { name.value = localStorage.getItem('sec-lab-name') || ''; } catch (e) { /* нет хранилища */ }
    const out = el('textarea'); out.id = 'stCode'; out.readOnly = true; out.rows = 3; out.hidden = true;
    const make = el('button', 'Создать код', 'btn primary'); make.id = 'stMake';
    const copy = el('button', 'Скопировать', 'btn'); copy.id = 'stCopy'; copy.hidden = true;
    make.addEventListener('click', () => {
      const n = name.value.trim();
      if (!n) { name.focus(); name.setAttribute('aria-invalid', 'true'); return; }
      try { localStorage.setItem('sec-lab-name', n); } catch (e) { /* нет хранилища */ }
      out.value = makeCode(n); out.hidden = false; copy.hidden = false; out.select();
    });
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(out.value); copy.textContent = 'Скопировано'; } catch (e) { out.focus(); out.select(); } });
    const row = el('div', null, 'btn-row'); row.append(make, copy);
    body.append(name, row, out);
  } else {
    $('modalTitle').textContent = 'Проверить код ученика';
    body.append(el('p', 'Вставьте код, который прислал ученик.'));
    const inp = el('textarea'); inp.id = 'tcCode'; inp.rows = 3; inp.placeholder = 'SL1.…';
    const go = el('button', 'Показать результаты', 'btn primary'); go.id = 'tcGo';
    const out = el('div', null, 'code-out');
    go.addEventListener('click', () => {
      out.replaceChildren();
      const r = readCode(inp.value);
      if (!r) { out.append(el('p', 'Это не код лаборатории. Проверьте, что он скопирован целиком.', 'calc-msg err')); return; }
      if (r.forged) { out.append(el('p', 'Код изменён вручную: контрольная сумма не сходится.', 'calc-msg err')); return; }
      const solved = TASKS.filter((t) => r.p[t.id] > 0);
      out.append(el('p', `${r.n}${r.d ? ' · ' + r.d.split('-').reverse().join('.') : ''}: решено ${solved.length} из ${TASKS.length}, звёзд ${solved.reduce((a, t) => a + r.p[t.id], 0)}, вычислений ${r.c.length}.`, 'code-sum'));
      const wrap = el('div', null, 'ngon-wrap'); const tb = el('table', null, 'ngon');
      const hr = el('tr'); ['Задача', 'Уровень', 'Звёзды', 'ЕГЭ'].forEach((h) => hr.append(el('th', h)));
      const thead = el('thead'); thead.append(hr); tb.append(thead);
      const tbody = el('tbody');
      TASKS.forEach((t, i) => {
        const tr = el('tr');
        tr.append(el('td', `${POLY_DEFS[t.poly].title}, ${t.pts.map((x) => sub(x.v || x.n)).join('')}`), el('td', LEVELS[t.level].name),
          el('td', r.p[t.id] != null ? '★'.repeat(r.p[t.id]) || 'решение показано' : '—'), el('td', r.c.includes(t.id) ? '✓' : ''));
        tbody.append(tr);
      });
      tb.append(tbody); wrap.append(tb); out.append(wrap);
    });
    body.append(inp, go, out);
  }
  $('modal').hidden = false;
  const first = body.querySelector('input, textarea'); if (first) first.focus();
}
function closeModal() { $('modal').hidden = true; }
$('codeBtn').addEventListener('click', () => openModal('student'));
$('checkCodeBtn').addEventListener('click', () => openModal('teacher'));
$('modalClose').addEventListener('click', closeModal);
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

window.addEventListener('hashchange', () => { closeModal(); openFromHash(); });
if (!openFromHash()) {
  if (curLevel === 0) openDemo(DEMOS[0].id);
  else loadTask(TASKS.find((t) => t.level === curLevel) || TASKS[0]);
}
frame();
