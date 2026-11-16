// Geometric morphometrics: preparation of the data, GPA, PCA and checks.
// Pure and DOM-free (UMD: window.SupGM in the browser, require in Node).
// Follows geomorph's gpagen and gm.prcomp, compared in tests/unit/gm-geomorph.test.js.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SupGM = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Smallest and largest value, without spreading the list into arguments (which overflows on long lists). */
  function extent(values) {
    let lo = Infinity, hi = -Infinity;
    for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
    return [lo, hi];
  }

  /* ---------- linear algebra ---------- */
  /**
   * Eigen-decomposition of a symmetric matrix: Householder reduction to tridiagonal form, then the
   * QL algorithm with implicit shifts (tred2 and tql2, as in EISPACK and JAMA). O(n³), a few times
   * faster than Jacobi rotations on the matrices a PCA produces.
   * Returns values in decreasing order; vectors[i][j] is component i of eigenvector j.
   */
  function symEig(A) {
    const n = A.length;
    if (!n) return { values: [], vectors: [] };
    const V = A.map(r => Float64Array.from(r));
    const d = new Float64Array(n), e = new Float64Array(n);
    // tred2
    for (let j = 0; j < n; j++) d[j] = V[n - 1][j];
    for (let i = n - 1; i > 0; i--) {
      let scale = 0, h = 0;
      for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
      if (scale === 0) {
        e[i] = d[i - 1];
        for (let j = 0; j < i; j++) { d[j] = V[i - 1][j]; V[i][j] = 0; V[j][i] = 0; }
      } else {
        for (let k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
        let f = d[i - 1], g = Math.sqrt(h);
        if (f > 0) g = -g;
        e[i] = scale * g;
        h -= f * g;
        d[i - 1] = f - g;
        for (let j = 0; j < i; j++) e[j] = 0;
        for (let j = 0; j < i; j++) {
          f = d[j];
          V[j][i] = f;
          g = e[j] + V[j][j] * f;
          for (let k = j + 1; k <= i - 1; k++) { g += V[k][j] * d[k]; e[k] += V[k][j] * f; }
          e[j] = g;
        }
        f = 0;
        for (let j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
        const hh = f / (h + h);
        for (let j = 0; j < i; j++) e[j] -= hh * d[j];
        for (let j = 0; j < i; j++) {
          f = d[j]; g = e[j];
          for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k];
          d[j] = V[i - 1][j];
          V[i][j] = 0;
        }
      }
      d[i] = h;
    }
    for (let i = 0; i < n - 1; i++) {
      V[n - 1][i] = V[i][i];
      V[i][i] = 1;
      const h = d[i + 1];
      if (h !== 0) {
        for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h;
        for (let j = 0; j <= i; j++) {
          let g = 0;
          for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j];
          for (let k = 0; k <= i; k++) V[k][j] -= g * d[k];
        }
      }
      for (let k = 0; k <= i; k++) V[k][i + 1] = 0;
    }
    for (let j = 0; j < n; j++) { d[j] = V[n - 1][j]; V[n - 1][j] = 0; }
    V[n - 1][n - 1] = 1;
    e[0] = 0;
    // tql2
    for (let i = 1; i < n; i++) e[i - 1] = e[i];
    e[n - 1] = 0;
    let f = 0, tst1 = 0;
    const eps = 2 ** -52;
    for (let l = 0; l < n; l++) {
      tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
      let m = l;
      while (m < n) { if (Math.abs(e[m]) <= eps * tst1) break; m++; }
      if (m > l) {
        for (let iter = 0; iter < 60; iter++) {
          let g = d[l];
          let p = (d[l + 1] - g) / (2 * e[l]);
          let r = Math.hypot(p, 1);
          if (p < 0) r = -r;
          d[l] = e[l] / (p + r);
          d[l + 1] = e[l] * (p + r);
          const dl1 = d[l + 1];
          let h = g - d[l];
          for (let i = l + 2; i < n; i++) d[i] -= h;
          f += h;
          p = d[m];
          let c = 1, c2 = c, c3 = c, s = 0, s2 = 0;
          const el1 = e[l + 1];
          for (let i = m - 1; i >= l; i--) {
            c3 = c2; c2 = c; s2 = s;
            g = c * e[i];
            h = c * p;
            r = Math.hypot(p, e[i]);
            e[i + 1] = s * r;
            s = e[i] / r;
            c = p / r;
            p = c * d[i] - s * g;
            d[i + 1] = h + s * (c * g + s * d[i]);
            for (let k = 0; k < n; k++) {
              h = V[k][i + 1];
              V[k][i + 1] = s * V[k][i] + c * h;
              V[k][i] = c * V[k][i] - s * h;
            }
          }
          p = -s * s2 * c3 * el1 * e[l] / dl1;
          e[l] = s * p;
          d[l] = c * p;
          if (!(Math.abs(e[l]) > eps * tst1)) break;
        }
      }
      d[l] += f;
      e[l] = 0;
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => d[b] - d[a]);
    return {
      values: order.map(i => d[i]),
      vectors: V.map(row => order.map(j => row[j])),
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
    const M = centre(meanOf(aligned)), k = M[0].length;
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
    if (opts.sliders && opts.sliders.length) return slidingGpa(matrix, opts);
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

  /* ---------- sliding semilandmarks ---------- */
  const csScale = c => scaled(c, 1 / centroidSize(c)); // geomorph's cs.scale: scaled, not centred

  /** Bending-energy matrix of a configuration (top-left block of the inverted thin-plate spline matrix, as geomorph's Ltemplate). */
  function bendingEnergy(ref) {
    const p = ref.length, k = ref[0].length, n = p + k + 1;
    const L = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < p; i++) {
      for (let j = i + 1; j < p; j++) {
        let r2 = 0;
        for (let d = 0; d < k; d++) r2 += (ref[i][d] - ref[j][d]) ** 2;
        const r = Math.sqrt(r2), u = r > 0 ? (k === 2 ? r2 * Math.log(r) : r) : 0;
        L[i][j] = L[j][i] = u;
      }
      const q = [1].concat(ref[i]);
      for (let c = 0; c <= k; c++) { L[i][p + c] = q[c]; L[p + c][i] = q[c]; }
    }
    const I = Array.from({ length: n }, (_, i) => Array.from({ length: p }, (_, j) => (i === j ? 1 : 0)));
    const inv = solve(L, I);
    if (!inv) throw new Error('Two or more points of the mean shape are in the same place, so the semilandmarks can’t slide by bending energy. Try sliding by Procrustes distance.');
    return inv.slice(0, p);
  }

  /** Solves A x = b for symmetric positive definite A (Cholesky); null if A isn't. */
  function cholSolve(A, b) {
    const n = A.length, Lo = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) {
      const Li = Lo[i], Ai = A[i];
      for (let j = 0; j <= i; j++) {
        const Lj = Lo[j];
        let s = Ai[j];
        for (let m = 0; m < j; m++) s -= Li[m] * Lj[m];
        if (i === j) { if (!(s > 1e-300)) return null; Li[i] = Math.sqrt(s); } else Li[j] = s / Lj[j];
      }
    }
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = b[i]; for (let m = 0; m < i; m++) s -= Lo[i][m] * y[m]; y[i] = s / Lo[i][i]; }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let m = i + 1; m < n; m++) s -= Lo[m][i] * x[m]; x[i] = s / Lo[i][i]; }
    return x;
  }

  /**
   * One specimen's semilandmarks slid along their tangents (from the neighbour before to the one after),
   * minimising bending energy (L given) or Procrustes distance (L null) to ref; as geomorph's semilandmarks.slide.BE / .ProcD.
   */
  function slideOnce(y, ref, sliders, L) {
    const s = sliders.length, k = y[0].length;
    const idx = sliders.map(t => t[1]);
    const tans = sliders.map(([b, , a]) => {
      const v = y[a].map((v_, d) => v_ - y[b][d]);
      const len = Math.sqrt(v.reduce((q, x) => q + x * x, 0));
      return len > 0 ? v.map(x => x / len) : v.map(() => 0);
    });
    const yc = y.map((p, i) => p.map((v, d) => v - ref[i][d]));
    let lambda;
    if (!L) lambda = idx.map((i, a) => tans[a].reduce((q, t, d) => q + t * yc[i][d], 0));
    else {
      const A = Array.from({ length: s }, () => new Float64Array(s)), rhs = new Float64Array(s);
      for (let a = 0; a < s; a++) {
        const La = L[idx[a]], ta = tans[a];
        for (let b = 0; b <= a; b++) {
          let dot = 0;
          for (let d = 0; d < k; d++) dot += ta[d] * tans[b][d];
          A[a][b] = A[b][a] = dot * La[idx[b]];
        }
        let r = 0;
        for (let j = 0; j < y.length; j++) { const w = La[j]; if (w) for (let d = 0; d < k; d++) r += ta[d] * w * yc[j][d]; }
        rhs[a] = r;
      }
      lambda = cholSolve(A, rhs);
      if (!lambda) {
        const x = solve(Array.from(A, r => Array.from(r)), Array.from(rhs, v => [v]));
        if (!x) throw new Error('The semilandmarks can’t slide: their neighbours don’t define a direction (are two neighbours in the same place?).');
        lambda = x.map(r => r[0]);
      }
    }
    const out = y.map(p => p.slice());
    idx.forEach((i, a) => { for (let d = 0; d < k; d++) out[i][d] -= tans[a][d] * lambda[a]; });
    return out;
  }

  /**
   * Procrustes fit with sliding semilandmarks, step for step as geomorph's gpagen(curves = ...):
   * align to the first specimen, then slide and rotate in turns (by default at most 10 rounds, tolerance 1e-4),
   * principal axes, tangent projection. Sliders: [before, slide, after] as row positions.
   */
  function slidingGpa(matrix, opts) {
    const sliders = opts.sliders, be = opts.slide !== 'procd';
    const maxIter = opts.slideMaxIter || 10, tol = opts.slideTol == null ? 1e-4 : opts.slideTol;
    const n = matrix.length, p = matrix[0].length, k = matrix[0][0].length;
    const csize = matrix.map(centroidSize);
    let slid0 = matrix.map(normalise);
    const first = csScale(slid0[0]);
    slid0 = slid0.map(c => rotateOnto(first, c));
    let ref = meanOf(slid0);
    const sumSq = list => {
      let s = 0;
      for (let i = 0; i < p; i++) for (let d = 0; d < k; d++) { let t = 0; for (const c of list) t += c[i][d]; s += t * t; }
      return s / n;
    };
    let ss0 = sumSq(slid0), Q = ss0, iter = 1;
    while (Q > tol) {
      iter++;
      const L = be ? bendingEnergy(ref) : null;
      const slid = slid0.map(y => slideOnce(y, ref, sliders, L));
      const ss = sumSq(slid);
      const target = csScale(ref);
      slid0 = slid.map(y => rotateOnto(target, y));
      ref = csScale(meanOf(slid0));
      Q = Math.abs(ss0 - ss);
      ss0 = ss;
      if (iter >= maxIter) break;
    }
    const aligned = principalAxes(slid0);
    const consensus = normalise(meanOf(aligned));
    const yv = consensus.flat();
    const tangent = aligned.map(c => {
      const x = c.flat(), dot = x.reduce((q, v, i) => q + v * yv[i], 0);
      const z = x.map((v, i) => v - dot * yv[i] + yv[i]);
      return c.map((pt, i) => pt.map((_, d) => z[i * k + d]));
    });
    const centreOfAll = meanOf(tangent); // sliding leaves the configurations slightly off centre, as in geomorph
    const procD = tangent.map(c => distance(c, centreOfAll));
    return { aligned, tangent, consensus, csize, procD, iterations: iter + 1, converged: Q <= tol, slide: be ? 'be' : 'procd', slideIterations: iter + 1, sliders };
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
    let scale = 0;
    for (const row of A) for (const v of row) if (Math.abs(v) > scale) scale = Math.abs(v);
    scale = scale || 1;
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

    const semi = opts.semilandmarks === true ? 'fixed' : opts.semilandmarks === false ? 'omit' : opts.semilandmarks || 'fixed';
    const slideIds = new Set((opts.sliders || []).map(t => t[1]));
    const isSemi = r => r.type === 'curve' || slideIds.has(r.id);
    let use = dataset.rows.map((r, i) => i).filter(i => {
      const r = dataset.rows[i];
      return !noPt.has(r.id) && (semi !== 'omit' || !isSemi(r));
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
    const curveRows = dataset.rows.filter(isSemi).length;
    const sliders = [], sliderNotes = [];
    if (semi === 'slide') {
      const at = new Map(use.map((row, j) => [dataset.rows[row].id, j]));
      for (const t of opts.sliders || []) {
        if (!at.has(t[1])) continue;
        const gone = [t[0], t[2]].filter(id => !at.has(id));
        if (gone.length) sliderNotes.push(`${t[1]} doesn’t slide: its neighbour ${gone.join(' and ')} is left out.`);
        else sliders.push(t.map(id => at.get(id)));
      }
    }
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
      semilandmarksUsed: use.filter(i => isSemi(dataset.rows[i])).length,
      semilandmarks: semi, sliders, sliderNotes,
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
        max: d.length ? extent(d)[1] : null,
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

  /* ---------- groups ---------- */
  /** Average of several configurations, landmark by landmark. */
  function meanShape(list) {
    return list[0].map((p, i) => p.map((_, d) => {
      let s = 0;
      for (const c of list) s += c[i][d];
      return s / list.length;
    }));
  }

  /** A small seeded generator (mulberry32), so permutation results don't change between reruns. */
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(n, random) {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    return p;
  }

  /**
   * Group means, mean centroid size, Procrustes variance (as geomorph's morphol.disparity with coords ~ group),
   * distances between means (as pairwise() with test.type "dist") and their permutation tests.
   * fit: { coords (tangent coordinates), csize }; index: a level index per specimen, or -1 for none.
   * opts: permutations (999), seed, or perms (explicit permutations of the grouped specimens, for tests).
   * In a permutation, grouped specimen i takes the data of specimen perm[i]; p counts the observed value too.
   */
  function groupStats(fit, index, levels, opts) {
    opts = opts || {};
    const used = [], lab = [];
    index.forEach((g, i) => { if (g >= 0 && g < levels.length) { used.push(i); lab.push(g); } });
    const present = levels.map((_, g) => g).filter(g => lab.includes(g));
    const re = new Map(present.map((g, k) => [g, k]));
    const L = lab.map(g => re.get(g)), K = present.length, n = used.length;
    const size = new Array(K).fill(0);
    for (const k of L) size[k]++;
    const groups = present.map((g, k) => {
      const members = used.filter((_, u) => L[u] === k);
      return {
        name: levels[g], level: g, n: size[k], members,
        mean: meanShape(members.map(i => fit.coords[i])),
        csize: members.reduce((s, i) => s + fit.csize[i], 0) / size[k],
      };
    });
    const out = { levels: present.map(g => levels[g]), groups, unassigned: index.length - n, distances: null, disparityDiff: null, pDistance: null, pDisparity: null, permutations: 0 };
    if (!n) return out;

    // Specimens as rows, centred on their grand mean; everything below needs only their inner products.
    const X = used.map(i => fit.coords[i].flat()), m = X[0].length;
    const centre = new Array(m).fill(0);
    for (const r of X) for (let j = 0; j < m; j++) centre[j] += r[j] / n;
    for (const r of X) for (let j = 0; j < m; j++) r[j] -= centre[j];
    const G = Array.from({ length: n }, () => new Float64Array(n));
    for (let a = 0; a < n; a++) for (let b = a; b < n; b++) {
      let s = 0;
      const xa = X[a], xb = X[b];
      for (let j = 0; j < m; j++) s += xa[j] * xb[j];
      G[a][b] = G[b][a] = s;
    }
    const block = Array.from({ length: K }, () => new Float64Array(K));
    /** Squared distances between group means when specimen data[i] carries label lab_[i]. */
    const meanDistances = labOf => {
      for (const r of block) r.fill(0);
      for (let a = 0; a < n; a++) {
        const ra = block[labOf[a]], Ga = G[a];
        for (let b = 0; b < n; b++) ra[labOf[b]] += Ga[b];
      }
      const d = Array.from({ length: K }, () => new Array(K).fill(0));
      for (let g = 0; g < K; g++) for (let h = g + 1; h < K; h++) {
        const v = block[g][g] / size[g] ** 2 + block[h][h] / size[h] ** 2 - 2 * block[g][h] / (size[g] * size[h]);
        d[g][h] = d[h][g] = Math.sqrt(Math.max(0, v));
      }
      return d;
    };
    // Squared distance of each specimen to its own group mean (residuals of coords ~ group).
    const means = groups.map(gr => gr.mean.flat());
    const resid = used.map((i, u) => {
      const x = fit.coords[i].flat(), mu = means[L[u]];
      let s = 0;
      for (let j = 0; j < m; j++) s += (x[j] - mu[j]) ** 2;
      return s;
    });
    const variances = r => {
      const pv = new Array(K).fill(0);
      for (let u = 0; u < n; u++) pv[L[u]] += r[u];
      return pv.map((v, k) => v / size[k]);
    };
    const pv = variances(resid);
    groups.forEach((gr, k) => { gr.disparity = size[k] > 1 ? pv[k] : null; });
    const pairs = f => Array.from({ length: K }, (_, g) => Array.from({ length: K }, (_, h) => f(g, h)));
    const diffOf = v => pairs((g, h) => (size[g] > 1 && size[h] > 1 ? Math.abs(v[g] - v[h]) : null));
    out.distances = meanDistances(L);
    out.disparityDiff = diffOf(pv);
    if (K < 2) { out.distances = out.disparityDiff = null; return out; }

    let perms = opts.perms;
    if (!perms) {
      const count = opts.permutations == null ? 999 : opts.permutations, random = seeded(opts.seed == null ? 1 : opts.seed);
      perms = Array.from({ length: count }, () => shuffled(n, random));
    }
    if (!perms.length) return out;
    const hitD = pairs(() => 1), hitV = pairs(() => 1);
    const atLeast = (y, x) => y >= x - 1e-10 * Math.abs(x);
    const labOf = new Array(n), r = new Array(n);
    for (const perm of perms) {
      for (let u = 0; u < n; u++) { labOf[perm[u]] = L[u]; r[u] = resid[perm[u]]; }
      const d = meanDistances(labOf), v = diffOf(variances(r));
      for (let g = 0; g < K; g++) for (let h = 0; h < K; h++) {
        if (g === h) continue;
        if (atLeast(d[g][h], out.distances[g][h])) hitD[g][h]++;
        if (v[g][h] != null && atLeast(v[g][h], out.disparityDiff[g][h])) hitV[g][h]++;
      }
    }
    const total = perms.length + 1;
    out.permutations = perms.length;
    out.pDistance = pairs((g, h) => (g === h ? 1 : hitD[g][h] / total));
    out.pDisparity = pairs((g, h) => (g === h ? 1 : out.disparityDiff[g][h] == null ? null : hitV[g][h] / total));
    return out;
  }

  /** Outline of the ellipse holding a share `level` of a bivariate normal fitted to the points, or null. */
  function ellipse(x, y, level, steps) {
    const n = x.length;
    if (n < 3) return null;
    const q = -2 * Math.log(1 - (level || 0.95)), N = steps || 64;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += x[i] / n; my += y[i] / n; }
    let a = 0, b = 0, c = 0;
    for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; a += dx * dx; b += dx * dy; c += dy * dy; }
    a /= n - 1; b /= n - 1; c /= n - 1;
    const det = a * c - b * b;
    if (!(det > 1e-18 * Math.max(a * a, c * c, 1e-300))) return null;
    const tr = (a + c) / 2, disc = Math.sqrt(Math.max(0, ((a - c) / 2) ** 2 + b * b));
    const l1 = tr + disc, l2 = tr - disc;
    const ang = Math.atan2(l1 - a, b || 1e-300);
    const v1 = Math.abs(b) > 1e-300 ? [Math.cos(ang), Math.sin(ang)] : (a >= c ? [1, 0] : [0, 1]);
    const v2 = [-v1[1], v1[0]], r1 = Math.sqrt(q * l1), r2 = Math.sqrt(q * l2);
    return Array.from({ length: N }, (_, k) => {
      const t = (2 * Math.PI * k) / N, u = r1 * Math.cos(t), w = r2 * Math.sin(t);
      return [mx + u * v1[0] + w * v2[0], my + u * v1[1] + w * v2[1]];
    });
  }

  /* ---------- allometry ---------- */
  /**
   * Shape regressed on log centroid size, as geomorph's procD.lm(coords ~ log(Csize)): sums of squares, R², F,
   * and a permutation test (specimens shuffled; specimen i takes the data of perm[i]). Regression scores as
   * plotAllometry(method = "RegScore"). fit: { tangent, csize }. Null with fewer than three specimens or one size.
   */
  function allometry(fit, opts) {
    opts = opts || {};
    const n = fit.tangent.length;
    if (n < 3) return null;
    const logSize = fit.csize.map(Math.log);
    const xm = logSize.reduce((s, v) => s + v, 0) / n;
    const x = logSize.map(v => v - xm);
    const sxx = x.reduce((s, v) => s + v * v, 0);
    if (!(sxx > 1e-24)) return null;
    const mean = meanOf(fit.tangent), p = mean.length, k = mean[0].length;
    const Y = fit.tangent.map(c => {
      const r = new Float64Array(p * k);
      for (let i = 0; i < p; i++) for (let d = 0; d < k; d++) r[i * k + d] = c[i][d] - mean[i][d];
      return r;
    });
    const m = p * k, b = new Float64Array(m);
    for (let a = 0; a < n; a++) for (let j = 0; j < m; j++) b[j] += (x[a] * Y[a][j]) / sxx;
    let total = 0;
    for (const r of Y) for (let j = 0; j < m; j++) total += r[j] * r[j];
    let bb = 0;
    for (let j = 0; j < m; j++) bb += b[j] * b[j];
    const model = bb * sxx, residual = Math.max(0, total - model);
    const F = r => (r.model / 1) / (r.residual / (n - 2));
    const f = residual > 0 ? F({ model, residual }) : Infinity;
    const blen = Math.sqrt(bb) || 1;
    const score = Y.map(r => { let s = 0; for (let j = 0; j < m; j++) s += r[j] * b[j]; return s / blen; });
    const slope = mean.map((_, i) => mean[i].map((__, d) => b[i * k + d]));
    let lo = Infinity, hi = -Infinity;
    for (const v of logSize) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const out = {
      n, logSize, mean, slope, score, range: [lo, hi],
      ss: { model, residual, total }, df: { model: 1, residual: n - 2, total: n - 1 },
      rsq: total > 0 ? model / total : 0, f, p: null, permutations: 0,
      predict: ls => mean.map((q, i) => q.map((v, d) => v + slope[i][d] * (ls - xm))),
      /** Shapes with the allometric part removed (residuals added to the mean). */
      corrected: () => fit.tangent.map((c, a) => c.map((q, i) => q.map((v, d) => v - slope[i][d] * x[a]))),
    };
    let perms = opts.perms;
    if (!perms) {
      const count = opts.permutations == null ? 999 : opts.permutations, random = seeded(opts.seed == null ? 1 : opts.seed);
      perms = Array.from({ length: count }, () => shuffled(n, random));
    }
    if (!perms.length) return out;
    // SS of the model under a permutation is wᵀ G w / sxx, with G the inner products of the centred shapes.
    const G = Array.from({ length: n }, () => new Float64Array(n));
    for (let a = 0; a < n; a++) for (let c = a; c < n; c++) {
      let s = 0;
      const ya = Y[a], yc = Y[c];
      for (let j = 0; j < m; j++) s += ya[j] * yc[j];
      G[a][c] = G[c][a] = s;
    }
    const w = new Float64Array(n);
    let hits = 1;
    for (const perm of perms) {
      for (let a = 0; a < n; a++) w[perm[a]] = x[a];
      let q = 0;
      for (let a = 0; a < n; a++) { const Ga = G[a]; let s = 0; for (let c = 0; c < n; c++) s += Ga[c] * w[c]; q += w[a] * s; }
      const ssm = q / sxx, ssr = Math.max(0, total - ssm);
      const fp = ssr > 0 ? ssm / (ssr / (n - 2)) : Infinity;
      if (fp >= f - 1e-10 * Math.abs(f)) hits++;
    }
    out.permutations = perms.length;
    out.p = hits / (perms.length + 1);
    return out;
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
    let g;
    try {
      g = gpa(prep.matrix, prep.sliders.length ? { sliders: prep.sliders, slide: opts && opts.slide } : {});
    } catch (e) { return fail(e.message); }
    const allo = allometry({ tangent: g.tangent, csize: g.csize }, { permutations: 0 });
    const sizeCorrect = !!(opts && opts.sizeCorrect && allo);
    const p = pca(sizeCorrect ? allo.corrected() : g.tangent);
    if (sizeCorrect) p.sizeCorrected = true;
    if (!p.values.length) return fail('All specimens have exactly the same shape, so there is no variation to analyse.');
    return {
      ok: true, prep, gpa: g, pca: p, allometry: allo,
      unslid: prep.sliders.length ? gpa(prep.matrix).aligned : undefined,
      mirrored: findMirrored(prep.matrix).map(i => prep.specimens[i].key),
      outliers: flagHigh(g.procD),
    };
  }

  return {
    tpsWarp, impute, fitRigid, symEig, centroidSize, rotateOnto, normalise, gpa, pca, shapeFromScores, shapeAt,
    flagHigh, findMirrored, prepare, rawCoords, repeatability, analyse, groupStats, meanShape, ellipse, allometry,
  };
}));
