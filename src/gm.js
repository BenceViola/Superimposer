// Geometric morphometrics: preparation of the data, GPA, PCA and checks.
// Pure and DOM-free (UMD: window.SupGM in the browser, require in Node).
// Follows geomorph's gpagen and gm.prcomp, compared in tests/unit/gm-geomorph.test.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SupGM = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- linear algebra ---------- */
  /** Eigen-decomposition of a symmetric matrix (cyclic Jacobi). vectors[i][j]: component i of eigenvector j. */
  function symEig(A) {
    const n = A.length;
    const a = new Float64Array(n * n), v = new Float64Array(n * n);
    for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) a[i * n + j] = A[i][j]; v[i * n + i] = 1; }
    let norm = 0;
    for (let i = 0; i < n * n; i++) norm += a[i] * a[i];
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i * n + j] * a[i * n + j];
      if (off <= 1e-32 * norm || off === 0) break;
      for (let p = 0; p < n - 1; p++) {
        for (let q = p + 1; q < n; q++) {
          const apq = a[p * n + q];
          if (Math.abs(apq) < 1e-300) continue;
          const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
          const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (let k = 0; k < n; k++) {
            const akp = a[k * n + p], akq = a[k * n + q];
            a[k * n + p] = c * akp - s * akq;
            a[k * n + q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = a[p * n + k], aqk = a[q * n + k];
            a[p * n + k] = c * apk - s * aqk;
            a[q * n + k] = s * apk + c * aqk;
          }
          for (let k = 0; k < n; k++) {
            const vkp = v[k * n + p], vkq = v[k * n + q];
            v[k * n + p] = c * vkp - s * vkq;
            v[k * n + q] = s * vkp + c * vkq;
          }
        }
      }
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => a[y * n + y] - a[x * n + x]);
    return {
      values: order.map(i => a[i * n + i]),
      vectors: Array.from({ length: n }, (_, i) => order.map(j => v[i * n + j])),
    };
  }

  /* ---------- configurations ---------- */
  function centre(c) {
    const k = c[0].length, m = new Array(k).fill(0);
    for (const p of c) for (let d = 0; d < k; d++) m[d] += p[d] / c.length;
    return c.map(p => p.map((v, d) => v - m[d]));
  }
  const norm = c => Math.sqrt(c.reduce((s, p) => s + p.reduce((t, v) => t + v * v, 0), 0));
  const centroidSize = c => norm(centre(c));
  const scaled = (c, k) => c.map(p => p.map(v => v * k));
  function normalise(c) { const m = centre(c); return scaled(m, 1 / norm(m)); }
  const meanOf = list => list[0].map((p, i) => p.map((_, d) => list.reduce((s, c) => s + c[i][d], 0) / list.length));
  const distance = (a, b) => Math.sqrt(a.reduce((s, p, i) => s + p.reduce((t, v, d) => t + (v - b[i][d]) ** 2, 0), 0));

  function applyRotation(R, c) { return c.map(p => R.map(r => r.reduce((s, v, i) => s + v * p[i], 0))); }

  /** The rotation (never a reflection) of centred y that best fits centred ref. */
  function bestRotation(ref, y) {
    const k = ref[0].length;
    if (k === 2) {
      let a = 0, b = 0;
      for (let i = 0; i < ref.length; i++) {
        a += y[i][0] * ref[i][0] + y[i][1] * ref[i][1];
        b += y[i][0] * ref[i][1] - y[i][1] * ref[i][0];
      }
      const t = Math.atan2(b, a), c = Math.cos(t), s = Math.sin(t);
      return [[c, -s], [s, c]];
    }
    // Horn's quaternion method: always a proper rotation, also for planar configurations.
    const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < ref.length; i++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) S[a][b] += y[i][a] * ref[i][b];
    const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
    const N = [
      [xx + yy + zz, yz - zy, zx - xz, xy - yx],
      [yz - zy, xx - yy - zz, xy + yx, zx + xz],
      [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
      [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
    ];
    const { vectors } = symEig(N);
    const [w, x, yq, z] = vectors.map(r => r[0]);
    return [
      [w * w + x * x - yq * yq - z * z, 2 * (x * yq - w * z), 2 * (x * z + w * yq)],
      [2 * (yq * x + w * z), w * w - x * x + yq * yq - z * z, 2 * (yq * z - w * x)],
      [2 * (z * x - w * yq), 2 * (z * yq + w * x), w * w - x * x - yq * yq + z * z],
    ];
  }
  const rotateOnto = (ref, y) => applyRotation(bestRotation(ref, y), y);

  /* ---------- GPA ---------- */
  /** Rotate everything so the consensus lies on its principal axes (as gpagen's PrinAxes). */
  function principalAxes(aligned) {
    const M = meanOf(aligned), k = M[0].length;
    const cov = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => M.reduce((s, p) => s + p[a] * p[b], 0)));
    const V = symEig(cov).vectors;
    for (let j = 0; j < k; j++) if (V[j][j] < 0) for (let i = 0; i < k; i++) V[i][j] = -V[i][j];
    if (k === 3) {
      const det = V[0][0] * (V[1][1] * V[2][2] - V[1][2] * V[2][1]) - V[0][1] * (V[1][0] * V[2][2] - V[1][2] * V[2][0]) + V[0][2] * (V[1][0] * V[2][1] - V[1][1] * V[2][0]);
      if (det < 0) for (let i = 0; i < 3; i++) V[i][2] = -V[i][2];
    }
    const R = V[0].map((_, j) => V.map(r => r[j])); // y' = y·V, so apply Vᵀ to column vectors
    return aligned.map(c => applyRotation(R, c));
  }

  function gpa(matrix, opts) {
    opts = opts || {};
    const tol = opts.tol || 1e-13, maxIter = opts.maxIter || 200;
    const csize = matrix.map(centroidSize);
    let aligned = matrix.map(normalise);
    aligned = aligned.map(c => rotateOnto(aligned[0], c));
    let M = meanOf(aligned), ss = 1 - norm(M) ** 2, iterations = 1, converged = false;
    M = normalise(M);
    while (iterations < maxIter) {
      iterations++;
      aligned = aligned.map(c => rotateOnto(M, c));
      const mean = meanOf(aligned), next = 1 - norm(mean) ** 2;
      M = normalise(mean);
      if (Math.abs(ss - next) < tol) { converged = true; ss = next; break; }
      ss = next;
    }
    aligned = principalAxes(aligned);
    const consensus = normalise(meanOf(aligned));
    const y = consensus.flat();
    const tangent = aligned.map(c => {
      const x = c.flat(), dot = x.reduce((s, v, i) => s + v * y[i], 0);
      const z = x.map((v, i) => v - dot * y[i] + y[i]);
      return c.map((p, i) => p.map((_, d) => z[i * p.length + d]));
    });
    const procD = tangent.map(c => distance(c, consensus));
    return { aligned, tangent, consensus, csize, procD, iterations, converged };
  }

  /* ---------- PCA ---------- */
  function pca(tangent) {
    const n = tangent.length, p = tangent[0].length, k = tangent[0][0].length, m = p * k;
    const X = tangent.map(c => c.flat());
    const mean = new Array(m).fill(0);
    for (const row of X) for (let j = 0; j < m; j++) mean[j] += row[j] / n;
    for (const row of X) for (let j = 0; j < m; j++) row[j] -= mean[j];
    const dual = n <= m;
    const size = dual ? n : m;
    const G = Array.from({ length: size }, () => new Array(size).fill(0));
    if (dual) {
      for (let a = 0; a < n; a++) for (let b = a; b < n; b++) { let s = 0; for (let j = 0; j < m; j++) s += X[a][j] * X[b][j]; G[a][b] = G[b][a] = s; }
    } else {
      for (let a = 0; a < m; a++) for (let b = a; b < m; b++) { let s = 0; for (let i = 0; i < n; i++) s += X[i][a] * X[i][b]; G[a][b] = G[b][a] = s; }
    }
    const { values, vectors } = symEig(G);
    const top = values[0] || 0;
    const q = values.filter(v => v > 1e-12 * top && v > 1e-24).length;
    const loadings = [];
    for (let c = 0; c < q; c++) {
      let l;
      if (dual) {
        const s = Math.sqrt(values[c]);
        l = new Array(m).fill(0);
        for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) l[j] += X[i][j] * vectors[i][c] / s;
      } else l = vectors.map(r => r[c]);
      const big = l.reduce((b, v) => (Math.abs(v) > Math.abs(b) ? v : b), 0);
      loadings.push(big < 0 ? l.map(v => -v) : l);
    }
    const scores = X.map(row => loadings.map(l => row.reduce((s, v, j) => s + v * l[j], 0)));
    const vals = values.slice(0, q).map(v => v / (n - 1));
    const total = vals.reduce((a, b) => a + b, 0);
    return { values: vals, proportion: vals.map(v => v / total), scores, loadings, mean, shape: { p, k } };
  }

  function shapeFromScores(res, scores) {
    const { p, k } = res.shape;
    const out = [];
    for (let i = 0; i < p; i++) {
      const row = [];
      for (let d = 0; d < k; d++) {
        const j = i * k + d;
        row.push(res.mean[j] + scores.reduce((s, v, c) => s + v * res.loadings[c][j], 0));
      }
      out.push(row);
    }
    return out;
  }
  function shapeAt(res, pc, score) {
    const s = new Array(res.values.length).fill(0);
    s[pc] = score;
    return shapeFromScores(res, s);
  }

  /* ---------- thin-plate spline ---------- */
  /** Solve A·X = B for several right-hand sides by elimination with pivoting, or null if A is singular. */
  function solve(A, B) {
    const n = A.length, M = A.map((r, i) => [...r, ...B[i]]);
    const scale = Math.max(...A.flat().map(Math.abs)) || 1;
    for (let c = 0; c < n; c++) {
      let best = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[best][c])) best = r;
      if (Math.abs(M[best][c]) < 1e-11 * scale) return null;
      [M[c], M[best]] = [M[best], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const k = M[r][c] / M[c][c];
        if (k) for (let j = c; j < M[r].length; j++) M[r][j] -= k * M[c][j];
      }
    }
    return M.map((row, i) => row.slice(n).map(v => v / row[i]));
  }

  /**
   * The thin-plate spline taking source onto target, as a function of a point, in 2D or 3D
   * (kernel r² log r² in 2D, r in 3D, as geomorph's tps2d3d); null if the landmarks can't define one.
   */
  function tpsWarp(source, target) {
    const n = source.length, k = source[0].length;
    const U = (a, b) => {
      let r2 = 0;
      for (let d = 0; d < k; d++) r2 += (a[d] - b[d]) ** 2;
      if (!(r2 > 0)) return 0;
      return k === 2 ? r2 * Math.log(r2) : Math.sqrt(r2);
    };
    const L = Array.from({ length: n + k + 1 }, () => new Array(n + k + 1).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) L[i][j] = U(source[i], source[j]);
      const q = [1, ...source[i]];
      for (let c = 0; c <= k; c++) { L[i][n + c] = q[c]; L[n + c][i] = q[c]; }
    }
    const rhs = [...target.map(p => p.slice(0, k)), ...Array.from({ length: k + 1 }, () => new Array(k).fill(0))];
    const coef = solve(L, rhs);
    if (!coef) return null;
    return p => Array.from({ length: k }, (_, d) => {
      let v = coef[n][d];
      for (let c = 0; c < k; c++) v += coef[n + 1 + c][d] * p[c];
      for (let i = 0; i < n; i++) v += coef[i][d] * U(p, source[i]);
      return v;
    });
  }

  /* ---------- missing landmarks ---------- */
  const centroidOf = pts => pts[0].map((_, d) => pts.reduce((s, p) => s + p[d], 0) / pts.length);
  const minus = (p, c) => p.map((v, d) => v - c[d]);
  const plus = (p, c) => p.map((v, d) => v + c[d]);

  /** For centred point sets: the rotation (never a reflection) taking from onto to, as a function of a point. */
  function fitRigid(from, to) {
    const R = bestRotation(to, from);
    return p => R.map(r => r.reduce((s, v, i) => s + v * p[i], 0));
  }
  const transpose = R => R[0].map((_, j) => R.map(r => r[j]));
  const rotate = (R, p) => R.map(r => r.reduce((s, v, i) => s + v * p[i], 0));

  /** Mirror image of the specimen about its own midline, fitted onto it; fills the gaps whose partner is present. */
  function mirrorFill(c, partner, todo) {
    const flip = q => [-q[0], ...q.slice(1)];
    const fit = c.map((q, j) => j).filter(j => c[j] && c[partner[j]]);
    if (fit.length < 3 || !fit.some(j => partner[j] !== j)) return { got: [], reason: 'too few landmarks on both sides to fit its mirror image' };
    const from = fit.map(j => flip(c[partner[j]])), to = fit.map(j => c[j]);
    const cf = centroidOf(from), ct = centroidOf(to);
    const turn = fitRigid(from.map(q => minus(q, cf)), to.map(q => minus(q, ct)));
    const got = [];
    for (const j of todo) {
      if (c[j] || !c[partner[j]]) continue;
      c[j] = plus(turn(minus(flip(c[partner[j]]), cf)), ct);
      got.push(j);
    }
    return { got };
  }

  /** The reference for thin-plate spline, regression and mean: complete specimens, aligned with their size kept, as geomorph's estimate.missing. */
  function buildReference(configs) {
    const g = gpa(configs);
    const sized = g.aligned.map((c, i) => scaled(c, g.csize[i]));
    return { mean: meanOf(sized), sized };
  }

  function fromReference(method, c, left, R, opts) {
    const k = c.find(Boolean).length;
    const present = c.map((q, j) => j).filter(j => c[j]);
    const mean = present.map(j => R.mean[j]), have = present.map(j => c[j]);
    if (method === 'tps') {
      const warp = tpsWarp(mean, have);
      if (!warp) return { reason: 'its remaining landmarks can’t define a thin-plate spline' };
      for (const j of left) c[j] = warp(R.mean[j]);
      return {};
    }
    const cm = centroidOf(mean), ch = centroidOf(have);
    const m0 = mean.map(q => minus(q, cm)), h0 = have.map(q => minus(q, ch));
    if (method === 'mean') {
      // The mean shape, moved, turned and sized onto the specimen's own landmarks.
      const Rot = bestRotation(h0, m0);
      const turned = m0.map(q => rotate(Rot, q));
      const s = turned.reduce((a, q, i) => a + q.reduce((b, v, d) => b + v * h0[i][d], 0), 0) / m0.reduce((a, q) => a + q.reduce((b, v) => b + v * v, 0), 0);
      for (const j of left) c[j] = plus(rotate(Rot, minus(R.mean[j], cm)).map(v => v * s), ch);
      return {};
    }
    // Regression (as geomorph's "Reg"): two-block partial least squares between the present and the
    // missing coordinates of the complete specimens, then a regression of one block's scores on the other's.
    const Rot = bestRotation(m0, h0);
    // geomorph leaves the specimen centred on its own remaining landmarks; here it goes where a reference
    // specimen of its size would have them.
    // The reference specimens keep their size, so the centroid of these landmarks scales with it.
    const shift = opts.geomorphCentring ? cm.map(() => 0) : cm.map(v => v * norm(h0) / norm(m0));
    const x = h0.map(q => plus(rotate(Rot, q), shift)).flat();
    const xs = R.sized.map(cfg => present.flatMap(j => cfg[j]));
    const ys = R.sized.map(cfg => left.flatMap(j => cfg[j]));
    const pc = x.length, mc = ys[0].length, n = xs.length;
    const Vr = Array.from({ length: pc }, (_, a) => Array.from({ length: mc }, (_, b) => xs.reduce((s, row, i) => s + row[a] * ys[i][b], 0)));
    const VtV = Array.from({ length: mc }, (_, a) => Array.from({ length: mc }, (_, b) => Vr.reduce((s, row) => s + row[a] * row[b], 0)));
    const eig = symEig(VtV);
    const top = Math.max(eig.values[0], 0);
    const keep = eig.values.map((v, i) => i).filter(i => eig.values[i] > 1e-12 * top && eig.values[i] > 0);
    if (n < keep.length + 2) return { reason: `regression needs more complete specimens (it has ${n}) than ${keep.length + 1}` };
    const Vc = keep.map(i => eig.vectors.map(r => r[i]));
    const Uc = keep.map((i, t) => Vr.map(row => row.reduce((s, v, b) => s + v * Vc[t][b], 0) / Math.sqrt(eig.values[i])));
    const xScore = row => [1, ...Uc.map(u => u.reduce((s, v, a) => s + v * row[a], 0))];
    const Z = xs.map(xScore), Y = ys.map(row => Vc.map(v => v.reduce((s, w, b) => s + w * row[b], 0)));
    const q = Z[0].length;
    const ZtZ = Array.from({ length: q }, (_, a) => Array.from({ length: q }, (_, b) => Z.reduce((s, r) => s + r[a] * r[b], 0)));
    const ZtY = Array.from({ length: q }, (_, a) => Vc.map((_, t) => Z.reduce((s, r, i) => s + r[a] * Y[i][t], 0)));
    const beta = solve(ZtZ, ZtY);
    if (!beta) return { reason: 'the regression could not be solved for this specimen' };
    const zx = xScore(x);
    const yScore = Vc.map((_, t) => zx.reduce((s, v, a) => s + v * beta[a][t], 0));
    const pred = Array.from({ length: mc }, (_, b) => yScore.reduce((s, v, t) => s + v * Vc[t][b], 0));
    const back = transpose(Rot);
    left.forEach((j, n2) => {
      const q = pred.slice(n2 * k, n2 * k + k);
      c[j] = plus(rotate(back, minus(q, shift)), ch);
    });
    return {};
  }

  /**
   * Estimate missing landmarks. matrix: configurations with null for gaps (left unchanged).
   * opts: method ('mirror' | 'tps' | 'reg' | 'mean'), canFill(i, j), pairs [[a, b]] of point indices,
   * mirrorFirst, max (per specimen), groups (a label per specimen: the reference is then the same group).
   * Returns { matrix, filled: per specimen [{ j, method }], notes: [{ i, reason }] }.
   */
  function impute(matrix, opts) {
    const method = opts.method, canFill = opts.canFill || (() => true);
    const max = opts.max == null ? Infinity : opts.max;
    const m = matrix.map(c => c.map(q => (q ? q.slice() : null)));
    const p = m.length ? m[0].length : 0;
    const partner = Array.from({ length: p }, (_, j) => j);
    for (const [a, b] of opts.pairs || []) { partner[a] = b; partner[b] = a; }
    const hasPairs = (opts.pairs || []).length > 0;
    const complete = m.map(c => c.every(Boolean));
    const references = new Map();
    const referenceFor = i => {
      const label = opts.groups ? opts.groups[i] : '';
      if (opts.groups && !label) return { reason: 'it has no group, and the reference is its own group' };
      if (!references.has(label)) {
        const members = m.map((c, n) => n).filter(n => complete[n] && (!opts.groups || opts.groups[n] === label));
        references.set(label, members.length < 3
          ? { reason: `the reference needs three complete specimens${opts.groups ? ` in group “${label}”` : ''} (there ${members.length === 1 ? 'is' : 'are'} ${members.length})` }
          : buildReference(members.map(n => m[n])));
      }
      return references.get(label);
    };
    const filled = m.map(() => []), notes = [];
    const NAMES = { mirror: 'mirroring', tps: 'thin-plate spline', reg: 'regression', mean: 'mean substitution' };
    m.forEach((c, i) => {
      const todo = c.map((q, j) => j).filter(j => !c[j] && canFill(i, j));
      if (!todo.length) return;
      if (todo.length > max) { notes.push({ i, reason: `${todo.length} missing landmarks, more than the limit of ${max}.` }); return; }
      const reasons = [];
      if (method === 'mirror' || opts.mirrorFirst) {
        if (!hasPairs) reasons.push('no landmark pairs are defined for mirroring');
        else {
          const r = mirrorFill(c, partner, todo);
          r.got.forEach(j => filled[i].push({ j, method: 'mirror' }));
          if (r.reason) reasons.push(r.reason);
        }
      }
      const left = todo.filter(j => !c[j]);
      if (left.length && method === 'mirror' && !reasons.length) reasons.push(`${left.length === 1 ? 'one gap has' : `${left.length} gaps have`} no landmark on the other side to mirror`);
      if (left.length && method !== 'mirror') {
        const R = referenceFor(i);
        const r = R.reason ? R : fromReference(method, c, left, R, opts);
        if (r.reason) reasons.push(r.reason);
        else left.forEach(j => filled[i].push({ j, method }));
      }
      if (reasons.length) {
        const text = reasons.join('; ');
        notes.push({ i, reason: `Not estimated by ${NAMES[method]}${opts.mirrorFirst && method !== 'mirror' ? ' (after mirroring)' : ''}: ${text}.` });
      }
    });
    return { matrix: m, filled, notes };
  }

  /* ---------- checks ---------- */
  function quantile(sorted, q) {
    const at = (sorted.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
  }
  /** Which values lie beyond the upper Tukey fence (Q3 + 1.5 IQR). */
  function flagHigh(values) {
    if (values.length < 4) return values.map(() => false);
    const s = [...values].sort((a, b) => a - b);
    const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75);
    const fence = q3 + 1.5 * (q3 - q1) + 1e-12;
    return values.map(v => v > fence);
  }

  /** Indices of specimens that are mirror images of the majority. Shapes that look the same both ways are never flagged. */
  function findMirrored(matrix) {
    if (matrix.length < 3) return [];
    const MARGIN = 0.7;
    const mirrorOf = c => c.map(p => [-p[0], ...p.slice(1)]);
    const norms = matrix.map(normalise);
    let ref = norms[0], labels = [];
    for (let round = 0; round < 6; round++) {
      const next = norms.map(c => {
        const dN = distance(ref, rotateOnto(ref, c)), dM = distance(ref, rotateOnto(ref, mirrorOf(c)));
        if (dM < MARGIN * dN) return -1;
        if (dN < MARGIN * dM) return 1;
        return 0;
      });
      const minus = next.filter(v => v < 0).length, plus = next.filter(v => v > 0).length;
      const final = minus > plus ? next.map(v => -v) : next;
      if (JSON.stringify(final) === JSON.stringify(labels)) break;
      labels = final;
      const set = norms.map((c, i) => rotateOnto(ref, next[i] < 0 ? mirrorOf(c) : c));
      ref = normalise(meanOf(set));
    }
    // A shape only has a left and a right if its mirror image is clearly different, compared with the variation between specimens.
    const chirality = distance(ref, rotateOnto(ref, mirrorOf(ref)));
    const nearest = norms.map(c => Math.min(distance(ref, rotateOnto(ref, c)), distance(ref, rotateOnto(ref, mirrorOf(c))))).sort((a, b) => a - b);
    if (chirality <= 3 * quantile(nearest, 0.5)) return [];
    return labels.map((v, i) => (v < 0 ? i : -1)).filter(i => i >= 0);
  }

  /* ---------- preparing a dataset ---------- */
  const replicateGroup = s => JSON.stringify([s.id, s.operator, s.sha || '', (s.key.match(/~\d+$/) || [''])[0]]);

  function averageReplicates(list) {
    const groups = new Map();
    for (const s of list) {
      const g = replicateGroup(s);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(s);
    }
    return [...groups.values()].map(g => {
      if (g.length === 1) return Object.assign({}, g[0], { nReplicates: 1 });
      const coords = g[0].coords.map((_, i) => {
        const have = g.map(s => s.coords[i]).filter(Boolean);
        return have.length ? have[0].map((_, d) => have.reduce((a, c) => a + c[d], 0) / have.length) : null;
      });
      const status = g[0].status.map((_, i) => {
        if (!coords[i]) return g.some(s => s.status[i] === 'missing') ? 'missing' : 'not_done';
        return g.some(s => s.status[i] === 'estimated') ? 'estimated' : 'placed';
      });
      const key = g[0].key.replace(/_r\d+(?=$|~)/, '');
      return Object.assign({}, g[0], { key, replicate: 1, nReplicates: g.length, coords, status });
    });
  }

  /**
   * From a dataset to a complete matrix. Options: missing ('specimens' | 'points'),
   * semilandmarks (bool), replicates ('all' | 'average'), flip, excludeSpecimens, excludePoints (Sets of keys / row ids).
   */
  function prepare(dataset, opts) {
    opts = opts || {};
    const flip = opts.flip || new Set(), noSp = opts.excludeSpecimens || new Set(), noPt = opts.excludePoints || new Set();
    const dropped = { specimens: [], points: [] };
    let list = dataset.specimens.filter(s => !noSp.has(s.key));
    if (opts.replicates === 'average') list = averageReplicates(list);
    list = list.map(s => {
      const flipped = flip.has(s.key);
      return Object.assign({ nReplicates: 1 }, s, {
        flipped,
        coords: flipped ? s.coords.map(c => (c ? [-c[0], ...c.slice(1)] : c)) : s.coords,
      });
    });

    let use = dataset.rows.map((r, i) => i).filter(i => {
      const r = dataset.rows[i];
      return !noPt.has(r.id) && (r.type !== 'curve' || opts.semilandmarks);
    });
    // Imputation comes first; gaps it leaves follow the missing-data choice below.
    const imp = opts.impute && opts.impute.method && opts.impute.method !== 'none' ? opts.impute : null;
    const imputeNotes = [];
    if (imp && list.length && use.length) {
      const at = new Map(use.map((row, j) => [dataset.rows[row].id, j]));
      const pairs = (imp.pairs || []).filter(([a, b]) => a !== b && at.has(a) && at.has(b)).map(([a, b]) => [at.get(a), at.get(b)]);
      const groups = imp.groupOf ? list.map(s => imp.groupOf.get(s.key) || imp.groupOf.get(s.id) || null) : null;
      const res = impute(list.map(s => use.map(i => s.coords[i])), {
        method: imp.method, mirrorFirst: imp.mirrorFirst, max: imp.max, pairs, groups,
        canFill: (n, j) => { const st = list[n].status[use[j]]; return st === 'missing' || (!!imp.notDone && st === 'not_done'); },
      });
      res.notes.forEach(x => imputeNotes.push({ key: list[x.i].key, reason: x.reason }));
      list = list.map((s, n) => {
        if (!res.filled[n].length) return s;
        const coords = s.coords.slice();
        for (const f of res.filled[n]) coords[use[f.j]] = res.matrix[n][f.j];
        return Object.assign({}, s, { coords, imputedRows: res.filled[n].map(f => ({ row: use[f.j], method: f.method })) });
      });
    }

    if (opts.missing === 'points') {
      use = use.filter(i => {
        const gaps = list.filter(s => !s.coords[i]).length;
        if (gaps) dropped.points.push({ id: dataset.rows[i].id, reason: `Missing on ${gaps} specimen${gaps === 1 ? '' : 's'}.` });
        return !gaps;
      });
    } else {
      list = list.filter(s => {
        const gaps = use.filter(i => !s.coords[i]).map(i => dataset.rows[i].id);
        if (gaps.length) dropped.specimens.push({ key: s.key, reason: `Missing ${gaps.join(', ')}.` });
        return !gaps.length;
      });
    }
    if (use.length) {
      list = list.filter(s => {
        const zero = centroidSize(use.map(i => s.coords[i])) < 1e-12;
        if (zero) dropped.specimens.push({ key: s.key, reason: 'All its points are in the same place.' });
        return !zero;
      });
    }
    const curveRows = dataset.rows.filter(r => r.type === 'curve').length;
    const imputed = list.map(s => (s.imputedRows || []).map(f => ({ j: use.indexOf(f.row), method: f.method })).filter(f => f.j >= 0));
    return {
      imputed, imputeNotes, impute: imp,
      imputedCount: imputed.reduce((n, x) => n + x.length, 0),
      dim: dataset.dim,
      rows: use.map(i => dataset.rows[i]),
      specimens: list,
      matrix: list.map(s => use.map(i => s.coords[i])),
      dropped,
      estimated: list.reduce((n, s) => n + use.filter(i => s.status[i] === 'estimated').length, 0),
      semilandmarksAvailable: curveRows,
      semilandmarksUsed: use.filter(i => dataset.rows[i].type === 'curve').length,
    };
  }

  /** Coordinates for showing the data as digitised. A flipped specimen is put back in its own place, as flipping is about x = 0. */
  function rawCoords(prep) {
    return prep.matrix.map((c, i) => {
      if (!prep.specimens[i].flipped) return c;
      const shift = -2 * c.reduce((s, p) => s + p[0], 0) / c.length;
      return c.map(p => [p[0] + shift, ...p.slice(1)]);
    });
  }

  /* ---------- repeatability ---------- */
  /** Distances between replicates of one specimen by one operator, per landmark and per curve, in the data's units. */
  function repeatability(dataset) {
    const groups = new Map();
    for (const s of dataset.specimens) {
      const g = replicateGroup(s);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(s);
    }
    const reps = [...groups.values()].filter(g => g.length > 1);
    const collect = (indices) => {
      const d = [];
      let specimens = 0;
      for (const g of reps) {
        let used = false;
        for (let a = 0; a < g.length; a++) {
          for (let b = a + 1; b < g.length; b++) {
            for (const i of indices) {
              const p = g[a].coords[i], q = g[b].coords[i];
              if (p && q) { d.push(Math.sqrt(p.reduce((s, v, c) => s + (v - q[c]) ** 2, 0))); used = true; }
            }
          }
        }
        if (used) specimens++;
      }
      return { d, specimens };
    };
    const out = [];
    const push = (row, indices) => {
      const { d, specimens } = collect(indices);
      out.push(Object.assign(row, {
        specimens, pairs: d.length,
        mean: d.length ? d.reduce((a, b) => a + b, 0) / d.length : null,
        max: d.length ? Math.max(...d) : null,
      }));
    };
    const seenCurves = new Set();
    dataset.rows.forEach((r, i) => {
      if (r.type !== 'curve') push({ kind: 'lm', id: r.id, name: r.label }, [i]);
      else if (!seenCurves.has(r.curve)) {
        seenCurves.add(r.curve);
        push({ kind: 'curve', id: r.curve, name: r.label }, dataset.rows.map((x, j) => (x.curve === r.curve ? j : -1)).filter(j => j >= 0));
      }
    });
    const means = out.filter(r => r.pairs).map(r => r.mean).sort((a, b) => a - b);
    const median = means.length ? quantile(means, 0.5) : null;
    for (const r of out) r.flag = !!(r.pairs && median > 0 && r.mean > 2 * median);
    const units = new Set(reps.flat().map(s => s.units));
    return {
      rows: out, median,
      units: units.size === 1 ? [...units][0] : units.size ? 'mixed' : '',
      specimens: reps.map(g => ({ id: g[0].id, operator: g[0].operator, replicates: g.length })),
    };
  }

  /* ---------- whole analysis ---------- */
  function analyse(dataset, opts) {
    const prep = prepare(dataset, opts);
    const fail = message => ({ ok: false, message, prep });
    if (prep.rows.length < 3) return fail('Superimposition needs at least three points. Too many have been left out.');
    if (prep.specimens.length < 3) {
      const lost = prep.dropped.specimens.length;
      return fail(`Superimposition needs at least three specimens.${lost ? ` ${lost} were left out because of missing landmarks: try leaving out the landmark instead.` : ''}`);
    }
    const g = gpa(prep.matrix);
    const p = pca(g.tangent);
    if (!p.values.length) return fail('All specimens have exactly the same shape, so there is no variation to analyse.');
    return {
      ok: true, prep, gpa: g, pca: p,
      mirrored: findMirrored(prep.matrix).map(i => prep.specimens[i].key),
      outliers: flagHigh(g.procD),
    };
  }

  return {
    tpsWarp, impute, fitRigid, symEig, centroidSize, rotateOnto, normalise, gpa, pca, shapeFromScores, shapeAt,
    flagHigh, findMirrored, prepare, rawCoords, repeatability, analyse,
  };
}));
