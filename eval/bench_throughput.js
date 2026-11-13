const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// Import exact TrackBack server services without modifying them
const { detectVehicles } = require('../server/services/detector');
const { VehicleTracker } = require('../server/services/tracker');
const { extractFrames } = require('../server/services/videoProcessor');

function quantile(arr, q) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function computeStats(arr) {
  if (!arr || arr.length === 0) return { median: 0, p95: 0, p99: 0, mean: 0, min: 0, max: 0, n: 0 };
  const sum = arr.reduce((a, b) => a + b, 0);
  return {
    n: arr.length,
    mean: Number((sum / arr.length).toFixed(2)),
    median: Number(quantile(arr, 0.50).toFixed(2)),
    p95: Number(quantile(arr, 0.95).toFixed(2)),
    p99: Number(quantile(arr, 0.99).toFixed(2)),
    min: Number(Math.min(...arr).toFixed(2)),
    max: Number(Math.max(...arr).toFixed(2))
  };
}

async function benchmarkSequence(seqName, videoPath, numRuns = 5) {
  console.log(`\n------------------------------------------------------`);
  console.log(`Benchmarking Sequence: ${seqName}`);
  console.log(`Video: ${videoPath}`);

  const tempDir = path.join(__dirname, 'temp_bench', seqName);
  fs.mkdirSync(tempDir, { recursive: true });

  // 1. Warm-up run (not included in statistics)
  console.log('Running 1 warm-up run...');
  const warmDir = path.join(tempDir, 'warm');
  fs.mkdirSync(warmDir, { recursive: true });
  const warmFrames = await extractFrames(videoPath, warmDir, 3);
  const warmTracker = new VehicleTracker();
  for (const f of warmFrames) {
    const dets = await detectVehicles(f.filepath);
    warmTracker.update(dets, f.frameIndex, new Date());
  }
  fs.rmSync(warmDir, { recursive: true, force: true });
  console.log(`Warm-up complete (${warmFrames.length} frames).`);

  // 2. Measured runs (5 runs)
  const runResults = [];
  const allInferenceLatencies = [];
  const allTrackingLatencies = [];

  for (let r = 1; r <= numRuns; r++) {
    const runDir = path.join(tempDir, `run_${r}`);
    fs.mkdirSync(runDir, { recursive: true });

    // Stage 1: Decode
    const t0 = performance.now();
    const frames = await extractFrames(videoPath, runDir, 3);
    const t1 = performance.now();
    const decodeTimeMs = t1 - t0;

    // Stage 2: Inference & Stage 3: Tracking
    let totalInferenceTimeMs = 0;
    let totalTrackingTimeMs = 0;
    const tracker = new VehicleTracker();
    let totalDetectionsCount = 0;

    for (const f of frames) {
      const tInf0 = performance.now();
      const detections = await detectVehicles(f.filepath);
      const tInf1 = performance.now();
      const infDuration = tInf1 - tInf0;
      totalInferenceTimeMs += infDuration;
      allInferenceLatencies.push(infDuration);
      totalDetectionsCount += detections.length;

      const tTrk0 = performance.now();
      tracker.update(detections, f.frameIndex, new Date());
      const tTrk1 = performance.now();
      const trkDuration = tTrk1 - tTrk0;
      totalTrackingTimeMs += trkDuration;
      allTrackingLatencies.push(trkDuration);
    }

    const tEnd = performance.now();
    const totalPipelineTimeMs = decodeTimeMs + totalInferenceTimeMs + totalTrackingTimeMs;
    const framesCount = frames.length;

    const decodeFps = framesCount / (decodeTimeMs / 1000);
    const inferenceFps = framesCount / (totalInferenceTimeMs / 1000);
    const trackingFps = framesCount / (totalTrackingTimeMs / 1000);
    const endToEndFps = framesCount / (totalPipelineTimeMs / 1000);

    runResults.push({
      run: r,
      framesCount,
      detectionsCount: totalDetectionsCount,
      decodeTimeMs,
      decodeFps,
      totalInferenceTimeMs,
      inferenceFps,
      totalTrackingTimeMs,
      trackingFps,
      totalPipelineTimeMs,
      endToEndFps
    });

    console.log(
      `  Run ${r}/${numRuns}: ${framesCount} frames | ` +
      `Decode: ${decodeFps.toFixed(1)} FPS (${decodeTimeMs.toFixed(0)}ms) | ` +
      `YOLOv8n: ${inferenceFps.toFixed(1)} FPS (${totalInferenceTimeMs.toFixed(0)}ms) | ` +
      `Tracker: ${trackingFps.toFixed(1)} FPS (${totalTrackingTimeMs.toFixed(1)}ms) | ` +
      `End-to-End: ${endToEndFps.toFixed(1)} FPS`
    );

    // Clean up temporary extracted frames
    fs.rmSync(runDir, { recursive: true, force: true });
  }

  // Clean up sequence temp dir
  fs.rmSync(tempDir, { recursive: true, force: true });

  return {
    sequence: seqName,
    framesExtracted: runResults[0].framesCount,
    numRuns,
    runs: runResults,
    metrics: {
      decodeFps: computeStats(runResults.map(r => r.decodeFps)),
      inferenceFps: computeStats(runResults.map(r => r.inferenceFps)),
      trackingFps: computeStats(runResults.map(r => r.trackingFps)),
      endToEndFps: computeStats(runResults.map(r => r.endToEndFps)),
      inferenceLatencyMsPerFrame: computeStats(allInferenceLatencies),
      trackingLatencyMsPerFrame: computeStats(allTrackingLatencies)
    }
  };
}

async function main() {
  console.log('======================================================');
  console.log('STEP 2: THROUGHPUT & LATENCY BENCHMARKING');
  console.log('Testing TrackBack pipeline: ffmpeg decode -> YOLOv8n ONNX -> Centroid/IoU Tracker');
  console.log('Gemini API calls: EXCLUDED from throughput benchmark (tested separately)');
  console.log('Warm-up: 1 run per sequence | Measured runs: 5 runs per sequence');
  console.log('======================================================');

  const dataDir = path.join(__dirname, 'data');
  const sequences = fs.readdirSync(dataDir).filter(f => fs.statSync(path.join(dataDir, f)).isDirectory());

  const allSeqResults = [];
  const globalE2EFps = [];
  const globalDecodeFps = [];
  const globalInferenceFps = [];
  const globalTrackingFps = [];
  const globalInferenceLatencies = [];
  const globalTrackingLatencies = [];

  for (const seq of sequences) {
    const videoPath = path.join(dataDir, seq, `${seq}.mp4`);
    if (!fs.existsSync(videoPath)) {
      console.warn(`Video file not found: ${videoPath}`);
      continue;
    }
    const result = await benchmarkSequence(seq, videoPath, 5);
    allSeqResults.push(result);

    for (const r of result.runs) {
      globalE2EFps.push(r.endToEndFps);
      globalDecodeFps.push(r.decodeFps);
      globalInferenceFps.push(r.inferenceFps);
      globalTrackingFps.push(r.trackingFps);
    }
  }

  const overall = {
    totalSequences: allSeqResults.length,
    totalMeasuredRuns: globalE2EFps.length,
    endToEndFps: computeStats(globalE2EFps),
    decodeFps: computeStats(globalDecodeFps),
    inferenceFps: computeStats(globalInferenceFps),
    trackingFps: computeStats(globalTrackingFps)
  };

  console.log('\n======================================================');
  console.log('OVERALL BENCHMARK RESULTS (Summary across all 6 sequences, 30 measured runs):');
  console.log('======================================================');
  console.log(`End-to-End Pipeline FPS: Median = ${overall.endToEndFps.median} FPS, p95 = ${overall.endToEndFps.p95} FPS (n=${overall.endToEndFps.n})`);
  console.log(`Stage 1 Decode FPS:      Median = ${overall.decodeFps.median} FPS, p95 = ${overall.decodeFps.p95} FPS (n=${overall.decodeFps.n})`);
  console.log(`Stage 2 YOLOv8n FPS:     Median = ${overall.inferenceFps.median} FPS, p95 = ${overall.inferenceFps.p95} FPS (n=${overall.inferenceFps.n})`);
  console.log(`Stage 3 Tracker FPS:     Median = ${overall.trackingFps.median} FPS, p95 = ${overall.trackingFps.p95} FPS (n=${overall.trackingFps.n})`);

  const outputPayload = {
    timestamp: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      geminiCallsIncluded: false,
      warmUpRuns: 1,
      measuredRunsPerSequence: 5
    },
    overall,
    perSequence: allSeqResults
  };

  const resultsDir = path.join(__dirname, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const resultFilePath = path.join(resultsDir, 'throughput_benchmark.json');
  fs.writeFileSync(resultFilePath, JSON.stringify(outputPayload, null, 2), 'utf8');
  console.log(`\nRaw results saved to: ${resultFilePath}`);
}

main().catch(console.error);
