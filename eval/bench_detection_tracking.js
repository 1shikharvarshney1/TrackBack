const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const { detectVehicles } = require('../server/services/detector');
const { VehicleTracker } = require('../server/services/tracker');
const { evaluateDetection, evaluateTracking } = require('./metrics');

function parseGtTxt(gtPath) {
  const content = fs.readFileSync(gtPath, 'utf8');
  const lines = content.trim().split('\n');
  const gtByFrame = new Map();
  const allIds = new Set();
  let totalBoxes = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(',');
    if (parts.length < 6) continue;
    const frame = parseInt(parts[0], 10);
    const id = parseInt(parts[1], 10);
    const x = parseFloat(parts[2]);
    const y = parseFloat(parts[3]);
    const w = parseFloat(parts[4]);
    const h = parseFloat(parts[5]);

    if (!gtByFrame.has(frame)) gtByFrame.set(frame, []);
    gtByFrame.get(frame).push({
      id,
      bbox: [Math.round(x), Math.round(y), Math.round(w), Math.round(h)]
    });
    allIds.add(id);
    totalBoxes++;
  }

  return { gtByFrame, totalBoxes, uniqueIds: allIds.size };
}

async function evaluateSequence(seqDir) {
  const seqName = path.basename(seqDir);
  const gtPath = path.join(seqDir, 'gt', 'gt.txt');
  const framesDir = path.join(seqDir, 'frames');

  if (!fs.existsSync(gtPath) || !fs.existsSync(framesDir)) {
    throw new Error(`Missing gt or frames for ${seqName}`);
  }

  console.log(`\n======================================================`);
  console.log(`Evaluating Sequence: ${seqName}`);
  const { gtByFrame, totalBoxes, uniqueIds } = parseGtTxt(gtPath);
  console.log(`Ground truth loaded: ${totalBoxes} boxes across ${uniqueIds} tracks.`);

  const frameFiles = fs.readdirSync(framesDir)
    .filter(f => f.startsWith('img') && f.endsWith('.jpg'))
    .sort();

  console.log(`Processing ${frameFiles.length} consecutive frames through YOLOv8n detector + Tracker...`);

  const tracker = new VehicleTracker();
  const detByFrame = new Map();
  const hypByFrame = new Map();

  const tStart = performance.now();
  let processedFrames = 0;

  for (let i = 0; i < frameFiles.length; i++) {
    const filename = frameFiles[i];
    const frameIndex = parseInt(filename.replace(/\D/g, ''), 10);
    const framePath = path.join(framesDir, filename);

    // 1. Detection
    const rawDetections = await detectVehicles(framePath, 0.35);
    detByFrame.set(frameIndex, rawDetections.map(d => ({
      id: d.className,
      bbox: d.bbox,
      score: d.score,
      className: d.className
    })));

    // 2. Tracking update
    const dummyTimestamp = new Date(Date.now() + i * 40); // 25 fps = 40ms interval
    const activeTracks = tracker.update(rawDetections, frameIndex, dummyTimestamp);

    // Record tracker state for this frame
    hypByFrame.set(frameIndex, activeTracks.map(t => ({
      id: t.trackId,
      bbox: t.bbox,
      className: t.className
    })));

    processedFrames++;
    if (processedFrames % 50 === 0 || processedFrames === frameFiles.length) {
      const elapsed = ((performance.now() - tStart) / 1000).toFixed(1);
      const fps = (processedFrames / (performance.now() - tStart) * 1000).toFixed(1);
      console.log(`  Processed ${processedFrames}/${frameFiles.length} frames (${fps} FPS, elapsed: ${elapsed}s)`);
    }
  }

  console.log('Computing Step 3 Detection Metrics (IoU 0.5)...');
  const detMetrics = evaluateDetection(gtByFrame, detByFrame, 0.5);

  console.log('Computing Step 4 Tracking Metrics (CLEAR MOT & IDF1)...');
  const trkMetrics = evaluateTracking(gtByFrame, hypByFrame, 0.5);

  const result = {
    sequence: seqName,
    frames: frameFiles.length,
    groundTruth: {
      tracks: uniqueIds,
      boxes: totalBoxes
    },
    detection: detMetrics,
    tracking: trkMetrics
  };

  console.log(`Results for ${seqName}:`);
  console.log(`  Detection (IoU 0.5): Precision = ${(detMetrics.precision * 100).toFixed(1)}%, Recall = ${(detMetrics.recall * 100).toFixed(1)}%, F1 = ${(detMetrics.f1 * 100).toFixed(1)}%`);
  console.log(`  Tracking: MOTA = ${trkMetrics.mota}%, IDF1 = ${trkMetrics.idf1}%, ID Switches = ${trkMetrics.idSwitches}, Frag = ${trkMetrics.fragmentations}`);

  return result;
}

async function main() {
  console.log('======================================================');
  console.log('STEPS 3 & 4: DETECTION AND TRACKING EVALUATION');
  console.log('Evaluating against ground-truth UA-DETRAC MOT annotations');
  console.log('Detection: IoU 0.5 Precision, Recall, F1');
  console.log('Tracking: MOTA, IDF1, ID Switches, Fragmentation (CLEAR MOT)');
  console.log('======================================================');

  const dataDir = path.join(__dirname, 'data');
  const sequences = fs.readdirSync(dataDir).filter(f => fs.statSync(path.join(dataDir, f)).isDirectory());

  const categoryMap = {
    'detrac_69_MVI_39501': 'crowded',
    'detrac_84_MVI_40775': 'crowded_occluded',
    'detrac_70_MVI_39511': 'moderate',
    'detrac_82_MVI_40773': 'moderate',
    'detrac_83_MVI_40774': 'sparse_highway',
    'detrac_72_MVI_40711': 'moderate_intersection'
  };

  const results = [];

  for (const seq of sequences) {
    const seqDir = path.join(dataDir, seq);
    const seqRes = await evaluateSequence(seqDir);
    seqRes.category = categoryMap[seq] || 'moderate';
    results.push(seqRes);

    // Save individual checkpoint
    const resultsDir = path.join(__dirname, 'results');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(
      path.join(resultsDir, `eval_${seq}.json`),
      JSON.stringify(seqRes, null, 2),
      'utf8'
    );
  }

  // Aggregate Overall Metrics
  let totalGtBoxes = 0;
  let totalDetBoxes = 0;
  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;
  let totalIDSW = 0;
  let totalFrag = 0;
  let totalHypBoxes = 0;
  let totalFrames = 0;
  let totalGtTracks = 0;
  let totalHypTracks = 0;

  for (const r of results) {
    totalFrames += r.frames;
    totalGtTracks += r.groundTruth.tracks;
    totalHypTracks += r.tracking.hypTrajectories;
    totalGtBoxes += r.groundTruth.boxes;
    totalDetBoxes += r.detection.totalDetections;
    totalTP += r.detection.truePositives;
    totalFP += r.detection.falsePositives;
    totalFN += r.detection.falseNegatives;
    totalIDSW += r.tracking.idSwitches;
    totalFrag += r.tracking.fragmentations;
    totalHypBoxes += r.tracking.totalHypBoxes;
  }

  const overallPrecision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 0;
  const overallRecall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0;
  const overallF1 = overallPrecision + overallRecall > 0 ? (2 * overallPrecision * overallRecall) / (overallPrecision + overallRecall) : 0;
  const overallMota = totalGtBoxes > 0 ? 1 - (totalFN + totalFP + totalIDSW) / totalGtBoxes : 0;

  // Aggregate crowded vs sparse
  const crowdedSeqs = results.filter(r => r.category.includes('crowded'));
  const regularSeqs = results.filter(r => !r.category.includes('crowded'));

  function aggregateGroup(group) {
    let gt = 0, tp = 0, fp = 0, fn = 0, idsw = 0, frag = 0, frames = 0, tracks = 0, hypBoxes = 0;
    for (const r of group) {
      frames += r.frames;
      tracks += r.groundTruth.tracks;
      gt += r.groundTruth.boxes;
      tp += r.detection.truePositives;
      fp += r.detection.falsePositives;
      fn += r.detection.falseNegatives;
      idsw += r.tracking.idSwitches;
      frag += r.tracking.fragmentations;
      hypBoxes += r.tracking.totalHypBoxes;
    }
    const prec = tp + fp > 0 ? tp / (tp + fp) : 0;
    const rec = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;
    const mota = gt > 0 ? 1 - (fn + fp + idsw) / gt : 0;
    return {
      sequences: group.map(g => g.sequence),
      frames,
      tracks,
      gtBoxes: gt,
      tp,
      fp,
      fn,
      idsw,
      frag,
      precision: Number((prec * 100).toFixed(2)),
      recall: Number((rec * 100).toFixed(2)),
      f1: Number((f1 * 100).toFixed(2)),
      mota: Number((mota * 100).toFixed(2))
    };
  }

  const crowdedAgg = aggregateGroup(crowdedSeqs);
  const regularAgg = aggregateGroup(regularSeqs);

  const finalPayload = {
    timestamp: new Date().toISOString(),
    overall: {
      totalSequences: results.length,
      totalFrames,
      totalGtTracks,
      totalHypTracks,
      totalGtBoxes,
      detection: {
        precision: Number((overallPrecision * 100).toFixed(2)),
        recall: Number((overallRecall * 100).toFixed(2)),
        f1: Number((overallF1 * 100).toFixed(2)),
        truePositives: totalTP,
        falsePositives: totalFP,
        falseNegatives: totalFN
      },
      tracking: {
        mota: Number((overallMota * 100).toFixed(2)),
        idSwitches: totalIDSW,
        fragmentations: totalFrag
      }
    },
    bySubgroup: {
      crowdedOrOccluded: crowdedAgg,
      moderateOrSparse: regularAgg
    },
    perSequence: results
  };

  const finalPath = path.join(__dirname, 'results', 'detection_tracking_benchmark.json');
  fs.writeFileSync(finalPath, JSON.stringify(finalPayload, null, 2), 'utf8');

  console.log('\n======================================================');
  console.log('FINAL EVALUATION SUMMARY:');
  console.log('======================================================');
  console.log(`Total Frames: ${totalFrames} | Total Ground Truth Tracks: ${totalGtTracks} | Total GT Boxes: ${totalGtBoxes}`);
  console.log(`Overall Detection: Precision = ${(overallPrecision * 100).toFixed(2)}%, Recall = ${(overallRecall * 100).toFixed(2)}%, F1 = ${(overallF1 * 100).toFixed(2)}%`);
  console.log(`Overall Tracking: MOTA = ${(overallMota * 100).toFixed(2)}%, ID Switches = ${totalIDSW}, Fragmentations = ${totalFrag}`);
  console.log(`Crowded/Occluded (n=${crowdedAgg.frames} frames): MOTA = ${crowdedAgg.mota}%, Prec = ${crowdedAgg.precision}%, Recall = ${crowdedAgg.recall}%, IDSW = ${crowdedAgg.idsw}`);
  console.log(`Moderate/Sparse  (n=${regularAgg.frames} frames): MOTA = ${regularAgg.mota}%, Prec = ${regularAgg.precision}%, Recall = ${regularAgg.recall}%, IDSW = ${regularAgg.idsw}`);
  console.log(`\nRaw results saved to: ${finalPath}`);
}

main().catch(console.error);

