/**
 * Statistics for comparing performance samples from two builds.
 *
 * Timings are compared on a log scale, so a change is a ratio ("12% slower")
 * rather than a difference in milliseconds. The estimate is the Hodges-Lehmann
 * shift (the median of every pairwise PR/base ratio) and the confidence
 * interval is the exact one from the Mann-Whitney U distribution. Neither
 * assumes the timings are normally distributed, and a single slow outlier run
 * can't move them much, which matters with the handful of samples CI can
 * afford.
 */

export const DEFAULT_ALPHA = 0.05;
// Changes smaller than this are reported as no change even when they are
// statistically detectable: they're within what unrelated work on the runner
// shifts, and too small to act on in a PR.
export const DEFAULT_MIN_EFFECT = 0.05;

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Median absolute deviation as a fraction of the median: how much a single run
 * typically differs from the middle run. 0.04 means runs are usually within 4%.
 */
export function relativeSpread(values) {
  const m = median(values);
  if (!m) return null;
  return median(values.map((v) => Math.abs(v - m))) / m;
}

/** Number of ways each U value occurs when there is no difference. */
function mannWhitneyCounts(n, m) {
  // counts[i][j][u]: arrangements of i base and j PR samples with U = u.
  const counts = [];
  for (let i = 0; i <= n; i++) {
    counts.push([]);
    for (let j = 0; j <= m; j++) {
      const row = new Array(i * j + 1).fill(0);
      if (i === 0 || j === 0) {
        row[0] = 1;
      } else {
        // The largest sample is either a base sample, which ranks above all j
        // PR samples, or a PR sample, which ranks above none.
        const takeBase = counts[i - 1][j];
        const takePr = counts[i][j - 1];
        for (let u = 0; u < row.length; u++) {
          row[u] = (u - j >= 0 ? takeBase[u - j] || 0 : 0) + (takePr[u] || 0);
        }
      }
      counts[i].push(row);
    }
  }
  return counts[n][m];
}

/**
 * The rank k for which [d_(k), d_(nm+1-k)] of the sorted pairwise differences
 * is an exact (1 - alpha) confidence interval, or 0 if the samples are too
 * few for one.
 */
function confidenceRank(n, m, alpha) {
  const counts = mannWhitneyCounts(n, m);
  const total = counts.reduce((a, b) => a + b, 0);
  let cumulative = 0;
  let k = 0;
  for (let u = 0; u < counts.length; u++) {
    cumulative += counts[u];
    if (cumulative / total > alpha / 2) break;
    k = u + 1;
  }
  return k;
}

/**
 * Compare two sets of timing samples.
 *
 * Returns the medians, the estimated change as a fraction (0.12 = 12% slower),
 * its confidence interval, and a verdict:
 *   "slower" / "faster": the interval excludes no change and the estimate is
 *                        at least minEffect.
 *   "same":              not significant, and the interval is within
 *                        ±2 × minEffect.
 *   "inconclusive":      the runs were too noisy, or too few, to tell.
 */
export function compareTimings(
  base,
  pr,
  { alpha = DEFAULT_ALPHA, minEffect = DEFAULT_MIN_EFFECT } = {},
) {
  const result = {
    n: { base: base.length, pr: pr.length },
    baseMedian: median(base),
    prMedian: median(pr),
    baseSpread: relativeSpread(base),
    prSpread: relativeSpread(pr),
    change: null,
    ciLow: null,
    ciHigh: null,
    verdict: "inconclusive",
  };
  if (base.length === 0 || pr.length === 0) return result;
  if (base.some((v) => v <= 0) || pr.some((v) => v <= 0)) return result;

  const diffs = [];
  for (const b of base) {
    for (const p of pr) diffs.push(Math.log(p) - Math.log(b));
  }
  diffs.sort((a, b) => a - b);
  result.change = Math.exp(median(diffs)) - 1;

  const k = confidenceRank(base.length, pr.length, alpha);
  if (k === 0) return result;
  result.ciLow = Math.exp(diffs[k - 1]) - 1;
  result.ciHigh = Math.exp(diffs[diffs.length - k]) - 1;

  if (result.ciLow > 0 && result.change >= minEffect) {
    result.verdict = "slower";
  } else if (result.ciHigh < 0 && result.change <= -minEffect) {
    result.verdict = "faster";
  } else if (result.ciLow > 0 || result.ciHigh < 0) {
    // Detectable, but smaller than minEffect.
    result.verdict = "same";
  } else if (result.ciLow > -2 * minEffect && result.ciHigh < 2 * minEffect) {
    // A few outlier runs widen the interval past minEffect even when the
    // typical runs agree closely; only call it noisy when it is much wider.
    result.verdict = "same";
  }
  return result;
}
