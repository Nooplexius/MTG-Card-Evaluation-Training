/** Cholesky factor L (lower, row-major) of a symmetric positive-definite matrix; null if not positive definite. */
export function cholesky(a: Float64Array, n: number): Float64Array<ArrayBuffer> | null {
  const l = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i * n + j];
      for (let k = 0; k < j; k++) s -= l[i * n + k] * l[j * n + k];
      if (i === j) {
        if (s <= 1e-12) return null;
        l[i * n + i] = Math.sqrt(s);
      } else l[i * n + j] = s / l[j * n + j];
    }
  }
  return l;
}

/** Solves L Lᵀ x = b. */
export function cholSolve(l: Float64Array, n: number, b: Float64Array): Float64Array<ArrayBuffer> {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= l[i * n + k] * y[k];
    y[i] = s / l[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= l[k * n + i] * x[k];
    x[i] = s / l[i * n + i];
  }
  return x;
}

/** Diagonal of A⁻¹ from its Cholesky factor. */
export function cholInverseDiag(l: Float64Array, n: number): Float64Array<ArrayBuffer> {
  const d = new Float64Array(n);
  const e = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    e.fill(0);
    e[j] = 1;
    d[j] = cholSolve(l, n, e)[j];
  }
  return d;
}

/** Two-sided normal tail probability for a z statistic. */
export function normalTail(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 1 - erf;
}
