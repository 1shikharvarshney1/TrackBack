/**
 * Standard Multi-Object Tracking & Detection Evaluation Module
 * Implements:
 * 1. Hungarian / Munkres Bipartite Matching Algorithm
 * 2. Detection Metrics at IoU 0.5 (TP, FP, FN, Precision, Recall, F1)
 * 3. CLEAR MOT Metrics (MOTA, MOTP, ID Switches, Fragmentation, MT, ML)
 *    Reference: Bernardin & Stiefelhagen (2008), "Evaluating Multiple Object Tracking Performance: The CLEAR MOT Metrics"
 * 4. Identification Metrics (IDF1, IDP, IDR)
 *    Reference: Ristani et al. (2016), "Performance Measures and a Data Set for Multi-Target, Multi-Camera Tracking"
 */

function calculateIoU(boxA, boxB) {
  const [ax, ay, aw, ah] = boxA;
  const [bx, by, bw, bh] = boxB;

  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = aw * ah + bw * bh - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Hungarian / Munkres algorithm for minimum weight bipartite matching.
 * Cost matrix is rectangular or square (rows x cols).
 * Returns array of [row, col] assignments.
 */
function minWeightBipartiteMatching(costMatrix) {
  const n = costMatrix.length;
  if (n === 0) return [];
  const m = costMatrix[0].length;
  if (m === 0) return [];

  const dim = Math.max(n, m);
  const cost = Array.from({ length: dim + 1 }, () => new Array(dim + 1).fill(0));
  for (let i = 1; i <= dim; i++) {
    for (let j = 1; j <= dim; j++) {
      if (i <= n && j <= m) {
        cost[i][j] = costMatrix[i - 1][j - 1];
      } else {
        cost[i][j] = 1e9;
      }
    }
  }

  const u = new Array(dim + 1).fill(0);
  const v = new Array(dim + 1).fill(0);
  const p = new Array(dim + 1).fill(0);
  const way = new Array(dim + 1).fill(0);

  for (let i = 1; i <= dim; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(dim + 1).fill(Infinity);
    const used = new Array(dim + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= dim; j++) {
        if (!used[j]) {
          const cur = cost[i0][j] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= dim; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const matching = [];
  for (let j = 1; j <= dim; j++) {
    const r = p[j] - 1;
    const c = j - 1;
    if (r >= 0 && r < n && c < m && costMatrix[r][c] < 1e8) {
      matching.push([r, c]);
    }
  }
  return matching;
}

/**
 * Evaluates detection precision and recall at given IoU threshold (default 0.5)
 * gtByFrame: Map<frameIndex, Array<{ id, bbox: [x,y,w,h] }>>
 * detByFrame: Map<frameIndex, Array<{ id, bbox: [x,y,w,h], score? }>>
 */
function evaluateDetection(gtByFrame, detByFrame, iouThreshold = 0.5) {
  let totalGt = 0;
  let totalDet = 0;
  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;

  const allFrames = new Set([...gtByFrame.keys(), ...detByFrame.keys()]);

  for (const frame of allFrames) {
    const gtBoxes = gtByFrame.get(frame) || [];
    const detBoxes = detByFrame.get(frame) || [];

    totalGt += gtBoxes.length;
    totalDet += detBoxes.length;

    if (gtBoxes.length === 0) {
      totalFP += detBoxes.length;
      continue;
    }
    if (detBoxes.length === 0) {
      totalFN += gtBoxes.length;
      continue;
    }

    // Cost matrix: distance = 1 - IoU
    const costMatrix = [];
    for (let g = 0; g < gtBoxes.length; g++) {
      const row = [];
      for (let d = 0; d < detBoxes.length; d++) {
        const iou = calculateIoU(gtBoxes[g].bbox, detBoxes[d].bbox);
        row.push(iou >= iouThreshold ? 1 - iou : 1e6);
      }
      costMatrix.push(row);
    }

    const matches = minWeightBipartiteMatching(costMatrix);
    const validMatches = matches.filter(([g, d]) => costMatrix[g][d] <= 1 - iouThreshold);

    const tp = validMatches.length;
    const fp = detBoxes.length - tp;
    const fn = gtBoxes.length - tp;

    totalTP += tp;
    totalFP += fp;
    totalFN += fn;
  }

  const precision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 0;
  const recall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    iouThreshold,
    totalFrames: allFrames.size,
    totalGroundTruth: totalGt,
    totalDetections: totalDet,
    truePositives: totalTP,
    falsePositives: totalFP,
    falseNegatives: totalFN,
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4))
  };
}

/**
 * Evaluates CLEAR MOT metrics (MOTA, MOTP, ID Switches, Fragmentation)
 * and IDF1 identity persistence.
 * gtByFrame: Map<frameIndex, Array<{ id: number|string, bbox: [x,y,w,h] }>>
 * hypByFrame: Map<frameIndex, Array<{ id: number|string, bbox: [x,y,w,h] }>>
 */
function evaluateTracking(gtByFrame, hypByFrame, iouThreshold = 0.5) {
  const allFrames = Array.from(new Set([...gtByFrame.keys(), ...hypByFrame.keys()])).sort((a, b) => a - b);

  let totalGtBoxes = 0;
  let totalHypBoxes = 0;
  let totalFP = 0;
  let totalFN = 0;
  let totalIDSW = 0;
  let totalFrag = 0;
  let totalOverlapIoU = 0;
  let totalMatchedFrames = 0;

  // Track state across frames
  // Map<gtId, lastMatchedHypId>
  const gtLastHypId = new Map();
  // Map<gtId, lastSeenFrame>
  const gtLastSeen = new Map();
  // Map<gtId, boolean wasTrackedInPrevFrame>
  const gtTrackedPrev = new Map();

  // Accumulate bipartite counts for global IDF1
  // Map<gtId, Map<hypId, countOfMatchedFrames>>
  const globalCoOccur = new Map();
  const allGtIds = new Set();
  const allHypIds = new Set();
  const gtLengths = new Map();
  const hypLengths = new Map();

  for (const frame of allFrames) {
    const gts = gtByFrame.get(frame) || [];
    const hyps = hypByFrame.get(frame) || [];

    totalGtBoxes += gts.length;
    totalHypBoxes += hyps.length;

    for (const g of gts) {
      allGtIds.add(g.id);
      gtLengths.set(g.id, (gtLengths.get(g.id) || 0) + 1);
    }
    for (const h of hyps) {
      allHypIds.add(h.id);
      hypLengths.set(h.id, (hypLengths.get(h.id) || 0) + 1);
    }

    if (gts.length === 0) {
      totalFP += hyps.length;
      continue;
    }
    if (hyps.length === 0) {
      totalFN += gts.length;
      for (const g of gts) {
        if (gtTrackedPrev.get(g.id)) {
          gtTrackedPrev.set(g.id, false);
        }
      }
      continue;
    }

    // Build cost matrix: 1 - IoU
    const costMatrix = [];
    for (let i = 0; i < gts.length; i++) {
      const row = [];
      for (let j = 0; j < hyps.length; j++) {
        const iou = calculateIoU(gts[i].bbox, hyps[j].bbox);
        row.push(iou >= iouThreshold ? 1 - iou : 1e6);
      }
      costMatrix.push(row);
    }

    const matches = minWeightBipartiteMatching(costMatrix);
    const validMatches = matches.filter(([i, j]) => costMatrix[i][j] <= 1 - iouThreshold);

    const matchedGtIndices = new Set(validMatches.map(m => m[0]));
    const matchedHypIndices = new Set(validMatches.map(m => m[1]));

    const fp = hyps.length - matchedHypIndices.size;
    const fn = gts.length - matchedGtIndices.size;
    totalFP += fp;
    totalFN += fn;

    // Check ID switches and match details
    for (const [gIdx, hIdx] of validMatches) {
      const g = gts[gIdx];
      const h = hyps[hIdx];
      const iou = 1 - costMatrix[gIdx][hIdx];

      totalOverlapIoU += iou;
      totalMatchedFrames++;

      // Global co-occurrence for IDF1
      if (!globalCoOccur.has(g.id)) globalCoOccur.set(g.id, new Map());
      const hypMap = globalCoOccur.get(g.id);
      hypMap.set(h.id, (hypMap.get(h.id) || 0) + 1);

      // CLEAR MOT ID switch detection:
      // If GT target was previously matched to a different hypothesis ID
      if (gtLastHypId.has(g.id)) {
        const lastHyp = gtLastHypId.get(g.id);
        if (lastHyp !== h.id) {
          totalIDSW++;
        }
      }
      gtLastHypId.set(g.id, h.id);

      // Fragmentation detection:
      // If target was previously seen, but missed in the immediately preceding frame
      if (gtLastSeen.has(g.id)) {
        const lastFrame = gtLastSeen.get(g.id);
        const prevTracked = gtTrackedPrev.get(g.id);
        if (frame > lastFrame + 1 || !prevTracked) {
          totalFrag++;
        }
      }
      gtLastSeen.set(g.id, frame);
      gtTrackedPrev.set(g.id, true);
    }

    // For unmatched GT targets in this frame, mark tracked as false
    for (let i = 0; i < gts.length; i++) {
      if (!matchedGtIndices.has(i)) {
        const g = gts[i];
        if (gtTrackedPrev.get(g.id)) {
          gtTrackedPrev.set(g.id, false);
        }
      }
    }
  }

  // Compute MOTA & MOTP
  const mota = totalGtBoxes > 0
    ? 1 - (totalFN + totalFP + totalIDSW) / totalGtBoxes
    : 0;
  const motp = totalMatchedFrames > 0
    ? totalOverlapIoU / totalMatchedFrames
    : 0;

  // Compute Global IDF1 via maximum bipartite weight matching
  const gtIdList = Array.from(allGtIds);
  const hypIdList = Array.from(allHypIds);

  const idCostMatrix = [];
  for (let r = 0; r < gtIdList.length; r++) {
    const gid = gtIdList[r];
    const hypMap = globalCoOccur.get(gid) || new Map();
    const row = [];
    for (let c = 0; c < hypIdList.length; c++) {
      const hid = hypIdList[c];
      const matchCount = hypMap.get(hid) || 0;
      // To maximize matches, min-cost = 100000 - matchCount
      row.push(100000 - matchCount);
    }
    idCostMatrix.push(row);
  }

  const idMatches = minWeightBipartiteMatching(idCostMatrix);
  let idTP = 0;
  for (const [r, c] of idMatches) {
    const gid = gtIdList[r];
    const hid = hypIdList[c];
    const matchCount = (globalCoOccur.get(gid) || new Map()).get(hid) || 0;
    idTP += matchCount;
  }

  const idFP = totalHypBoxes - idTP;
  const idFN = totalGtBoxes - idTP;
  const idp = idTP + idFP > 0 ? idTP / (idTP + idFP) : 0;
  const idr = idTP + idFN > 0 ? idTP / (idTP + idFN) : 0;
  const idf1 = (2 * idTP) / (2 * idTP + idFP + idFN);

  return {
    frames: allFrames.length,
    gtTrajectories: allGtIds.size,
    hypTrajectories: allHypIds.size,
    totalGtBoxes,
    totalHypBoxes,
    matchedBoxes: totalMatchedFrames,
    falseNegatives: totalFN,
    falsePositives: totalFP,
    idSwitches: totalIDSW,
    fragmentations: totalFrag,
    mota: Number((mota * 100).toFixed(2)),
    motp: Number((motp * 100).toFixed(2)),
    idf1: Number((idf1 * 100).toFixed(2)),
    idp: Number((idp * 100).toFixed(2)),
    idr: Number((idr * 100).toFixed(2))
  };
}

module.exports = {
  calculateIoU,
  minWeightBipartiteMatching,
  evaluateDetection,
  evaluateTracking
};
