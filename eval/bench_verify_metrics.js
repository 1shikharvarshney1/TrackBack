const assert = require('assert');
const { calculateIoU, minWeightBipartiteMatching, evaluateDetection, evaluateTracking } = require('./metrics');

console.log('Verifying metrics implementation against ground truth test cases...');

// Test 1: Hungarian matching
const cost = [
  [4, 1, 3],
  [2, 0, 5],
  [3, 2, 2]
];
// Optimal assignment: row 0 -> col 1 (cost 1), row 1 -> col 0 (cost 2)? No: row 0 -> col 2 (3), row 1 -> col 1 (0), row 2 -> col 0 (3) sum = 6
// Or row 0 -> 1 (1), row 1 -> 0 (2), row 2 -> 2 (2) -> sum = 5!
const matching = minWeightBipartiteMatching(cost);
let totalCost = 0;
for (const [r, c] of matching) totalCost += cost[r][c];
assert.strictEqual(totalCost, 5, `Expected total cost 5, got ${totalCost}`);
console.log('✓ Hungarian matching algorithm verified (optimal cost = 5).');

// Test 2: Detection metrics with perfect match
const gtMap = new Map();
gtMap.set(1, [{ id: 1, bbox: [10, 10, 50, 50] }]);
const detMap = new Map();
detMap.set(1, [{ id: 101, bbox: [10, 10, 50, 50] }]);

const detRes = evaluateDetection(gtMap, detMap, 0.5);
assert.strictEqual(detRes.precision, 1.0);
assert.strictEqual(detRes.recall, 1.0);
assert.strictEqual(detRes.f1, 1.0);
console.log('✓ Detection metrics perfect match verified (P=1.0, R=1.0).');

// Test 3: Tracking with 1 ID switch
// Frame 1: GT 1 matched to Hyp A
// Frame 2: GT 1 matched to Hyp B -> ID switch!
const trkGt = new Map();
trkGt.set(1, [{ id: 1, bbox: [10, 10, 50, 50] }]);
trkGt.set(2, [{ id: 1, bbox: [15, 15, 50, 50] }]);

const trkHyp = new Map();
trkHyp.set(1, [{ id: 'A', bbox: [10, 10, 50, 50] }]);
trkHyp.set(2, [{ id: 'B', bbox: [15, 15, 50, 50] }]);

const trkRes = evaluateTracking(trkGt, trkHyp, 0.5);
assert.strictEqual(trkRes.idSwitches, 1, `Expected 1 ID switch, got ${trkRes.idSwitches}`);
assert.strictEqual(trkRes.falseNegatives, 0);
assert.strictEqual(trkRes.falsePositives, 0);
// MOTA = 1 - (FN + FP + IDSW)/GT = 1 - 1/2 = 0.5 (50%)
assert.strictEqual(trkRes.mota, 50.0);
// For IDF1: GT 1 length 2. Hyp A matches frame 1 (1), Hyp B matches frame 2 (1).
// Best bipartite match assigns GT 1 to either A or B -> IDTP = 1.
// IDFP = 2 - 1 = 1, IDFN = 2 - 1 = 1.
// IDF1 = 2*1 / (2*1 + 1 + 1) = 2/4 = 0.5 (50%).
assert.strictEqual(trkRes.idf1, 50.0);
console.log('✓ Tracking CLEAR MOT and IDF1 verified (IDSW=1, MOTA=50%, IDF1=50%).');

console.log('ALL METRIC TESTS PASSED SUCCESSFULLY!\n');
