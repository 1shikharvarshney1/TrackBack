# TrackBack Evaluation Results

This document presents a comprehensive, empirical evaluation of **TrackBack** (vehicle tracking and analytics pipeline). All metrics were computed using independent ground-truth annotations from the UA-DETRAC dataset and standalone reproducible evaluation scripts. No application logic was modified to influence results.

---

## 1. Environment & Hardware Specification

- **Date of Evaluation**: November 13–14, 2026
- **Operating System**: Microsoft Windows 11 Home Single Language (64-bit, Build 10.0.26300)
- **CPU**: Intel(R) Core(TM) i5-10300H CPU @ 2.50GHz (4 physical cores, 8 logical processors)
- **System Memory (RAM)**: 8.00 GB (8,253,232 KB total physical memory, ~1.2 GB available at idle)
- **Runtime Versions**:
  - Node.js: `v24.21.0`
  - npm: `11.19.0`
  - Python: `3.11.9` (AMD64)
  - ONNX Runtime: `onnxruntime-node v1.14.0` (CPU Execution Provider)
  - FFmpeg: `ffmpeg version N-127043-g350570b556`
- **Database**: MongoDB Community Server running locally on `localhost:27017`
- **External APIs**: Google Gemini 1.5 Flash API (Cloud-hosted REST API)

---

## 2. Evaluation Dataset

- **Dataset**: [UA-DETRAC Benchmark](https://detrac-db.rit.albany.edu/) (Mirror: Hugging Face `abhineet123/ua_detrac`)
- **License**: Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Rationale**: UA-DETRAC is a widely accepted, real-world multi-object vehicle tracking benchmark containing diverse urban traffic conditions, varied angles, high vehicle densities, and occlusions, with verified per-frame MOT bounding boxes and persistent vehicle IDs.
- **Conversion**: Annotations converted to MOT challenge format (`<frame>,<id>,<bb_left>,<bb_top>,<bb_width>,<bb_height>,1,-1,-1,-1`). Video clips generated at 25 fps.
- **Sample Size**: 6 sequences, **2,130 frames**, **141 ground-truth vehicle tracks**, **33,238 ground-truth bounding boxes**.

### Dataset Summary Table

| Sequence | Category | Frames | GT Tracks | GT Bounding Boxes | Video Size |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `detrac_69_MVI_39501` | Crowded | 350 | 24 | 7,170 | 3.58 MB |
| `detrac_70_MVI_39511` | Moderate | 380 | 14 | 5,407 | 3.73 MB |
| `detrac_72_MVI_40711` | Moderate Intersection | 350 | 34 | 4,903 | 3.73 MB |
| `detrac_82_MVI_40773` | Moderate | 350 | 13 | 4,133 | 2.57 MB |
| `detrac_83_MVI_40774` | Sparse Highway | 350 | 10 | 3,045 | 3.04 MB |
| `detrac_84_MVI_40775` | Crowded & Occluded | 350 | 46 | 8,580 | 3.77 MB |
| **Total / Overall** | **All Categories** | **2,130** | **141** | **33,238** | **20.42 MB** |

*Raw data reference: `eval/results/dataset_summary.json`*

---

## 3. Throughput & Latency (Step 2)

- **Benchmark Method**: 1 warm-up run followed by 5 measured runs per sequence across all 6 sequences ($n = 30$ measured runs).
- **Gemini Status**: Gemini OCR API calls were **explicitly excluded** from throughput benchmarking to measure raw CPU compute capacity.
- **Execution Command**: `$env:NODE_PATH="server/node_modules"; node eval/bench_throughput.js`
- **Raw Results**: `eval/results/throughput_benchmark.json`

### Throughput Summary ($n = 30$)

| Stage / Pipeline | Mean FPS | Median FPS | p95 FPS | p99 FPS | Latency (Median) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Decode** (FFmpeg child process / pipe) | 55.59 | **59.13** | 72.88 | 74.30 | 16.91 ms/frame |
| **Inference** (YOLOv8n ONNX CPU) | 4.38 | **4.37** | 6.05 | 6.14 | 228.83 ms/frame |
| **Tracking** (Centroid + IoU Association) | 12,718.58 | **11,062.43** | 28,315.99 | 33,726.97 | 0.09 ms/frame |
| **End-to-End Pipeline** | 4.04 | **3.97** | 5.55 | 5.67 | 251.89 ms/frame |

### Bottleneck Analysis
- **Primary Bottleneck**: YOLOv8n ONNX inference on the Intel Core i5-10300H CPU consumes ~91% of end-to-end frame processing time (~228 ms per frame, 4.37 FPS).
- **Tracker Efficiency**: Centroid + IoU tracking introduces negligible computational overhead (>11,000 FPS, <0.1 ms/frame).
- **Decode Capability**: FFmpeg decodes 720p/1080p video at ~59 FPS, well exceeding the downstream inference throughput.

---

## 4. Vehicle Detection Accuracy (Step 3)

- **Metric**: Bipartite matching between detected bounding boxes and UA-DETRAC ground-truth annotations at **IoU threshold $\ge 0.5$**.
- **Sample Size**: 2,130 frames, 33,238 ground-truth annotations.
- **Detection Model**: YOLOv8n (COCO pretrained, classes: car, motorcycle, bus, truck), confidence threshold = 0.35.
- **Execution Command**: `$env:NODE_PATH="server/node_modules"; node eval/bench_detection_tracking.js`
- **Raw Results**: `eval/results/detection_tracking_benchmark.json`

### Detection Performance Table (IoU $\ge 0.5$)

| Sequence | Category | GT Boxes | Detections | True Pos (TP) | False Pos (FP) | False Neg (FN) | Precision | Recall | F1 Score |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `detrac_69_MVI_39501` | Crowded | 7,170 | 3,545 | 1,759 | 1,786 | 5,411 | 49.62% | 24.53% | 32.83% |
| `detrac_70_MVI_39511` | Moderate | 5,407 | 2,695 | 1,325 | 1,370 | 4,082 | 49.17% | 24.51% | 32.71% |
| `detrac_72_MVI_40711` | Moderate Intersect. | 4,903 | 5,492 | 3,125 | 2,367 | 1,778 | 56.90% | 63.74% | 60.13% |
| `detrac_82_MVI_40773` | Moderate | 4,133 | 1,178 | 943 | 235 | 3,190 | 80.05% | 22.82% | 35.51% |
| `detrac_83_MVI_40774` | Sparse Highway | 3,045 | 2,116 | 1,365 | 751 | 1,680 | 64.51% | 44.83% | 52.90% |
| `detrac_84_MVI_40775` | Crowded / Occluded | 8,580 | 4,637 | 3,892 | 745 | 4,688 | 83.93% | 45.36% | 58.89% |
| **Overall (n = 2,130 frames)** | **All Sequences** | **33,238** | **19,663** | **12,409** | **7,254** | **20,829** | **63.11%** | **37.33%** | **46.91%** |

---

## 5. Multi-Object Tracking Performance (Step 4)

- **Metrics**: Standard CLEAR MOT metrics (Bernardin & Stiefelhagen, 2008) and ID Measures (Ristani et al., 2016):
  - **MOTA**: Multiple Object Tracking Accuracy ($1 - \frac{\text{FN} + \text{FP} + \text{IDSW}}{\text{GT}}$)
  - **MOTP**: Multiple Object Tracking Precision (Average IoU of matched bounding boxes)
  - **IDF1**: Identification F1 score (Trajectory-level identity consistency)
  - **IDSW**: Identity switches
  - **Frag**: Trajectory fragmentations
- **Matching Threshold**: IoU $\ge 0.5$ using global bipartite Hungarian matching.
- **Raw Results**: `eval/results/detection_tracking_benchmark.json`

### Tracking Performance Table

| Sequence | Category | GT Tracks | Hyp Tracks | MOTA | MOTP | IDF1 | ID Switches (IDSW) | Frag |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `detrac_69_MVI_39501` | Crowded | 24 | 102 | -7.41% | 73.91% | 30.58% | 66 | 187 |
| `detrac_70_MVI_39511` | Moderate | 14 | 66 | -4.18% | 78.10% | 29.75% | 14 | 41 |
| `detrac_72_MVI_40711` | Moderate Intersect. | 34 | 93 | 9.12% | 84.16% | 55.30% | 15 | 19 |
| `detrac_82_MVI_40773` | Moderate | 13 | 48 | 20.81% | 85.75% | 32.02% | 25 | 30 |
| `detrac_83_MVI_40774` | Sparse Highway | 10 | 41 | 14.71% | 85.12% | 49.83% | 8 | 8 |
| `detrac_84_MVI_40775` | Crowded / Occluded | 46 | 92 | 40.14% | 85.28% | 59.91% | 55 | 352 |
| **Overall (n = 2,130 frames)** | **All Sequences** | **141** | **442** | **14.96%** | **82.05%** | **42.90%** | **183** | **637** |

### Breakdown by Density & Occlusion Level

| Group | Sequences ($n$ frames) | GT Tracks | GT Boxes | MOTA | Precision | Recall | ID Switches | Frag |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Crowded / Occluded** | 2 sequences ($n = 700$) | 70 | 15,750 | **19.04%** | 69.07% | 35.88% | 121 | 539 |
| **Moderate / Sparse** | 4 sequences ($n = 1,430$) | 71 | 17,488 | **11.28%** | 58.86% | 38.64% | 62 | 98 |

---

## 6. License Plate Recognition & Speed Estimation (Step 5)

> [!NOTE]
> **Plate Reading & Speed Not Evaluated Against Ground Truth**:
> The UA-DETRAC benchmark contains vehicle bounding boxes and track IDs, but does **not** provide ground-truth license plate strings or calibrated radar speed measurements. Therefore, plate reading accuracy and speed accuracy are **not evaluated** against ground truth in this benchmark.

- **Speed Computation Disclaimer**: TrackBack calculates vehicle speed strictly as an **approximate pixel-displacement estimate** between successive video frames (`speed = (distance / fps) * scale_factor`). It is **not** radar-calibrated nor verified against physical ground-truth vehicle telemetry.
- **License Plate OCR**: Performed via Google Gemini 1.5 Flash multimodal API. During stress evaluation, Gemini hit the free-tier quota ceiling (429 rate limit), falling back to marking plates as `UNREADABLE`. In production, throughput is gated by external API latency (~3.4 seconds per OCR call) and upstream request limits.

---

## 7. Cross-Camera Re-Identification (Step 6)

- **Investigation**: Codebase inspection of `server/services/tracker.js`, `server/models/Sighting.js`, and `server/controllers/sightingController.js`.
- **Empirical Test**: `eval/bench_cross_camera.js`
- **Raw Results**: `eval/results/cross_camera_evaluation.json`

### Mechanism & Findings
1. **No Visual Re-ID Model**: The system does **not** utilize visual appearance embeddings (e.g., DeepSORT, OSNet, or ResNet-50 feature extractors), color histograms, or spatial-temporal camera network topologies.
2. **Re-ID Mechanism**: Cross-camera vehicle linkage operates strictly post-hoc via **MongoDB text string / regex matching** on the OCR license plate string (`sightingController.searchByPlate`).
3. **Failure Modes**:
   - If a license plate is occluded, blurred, unreadable, or missing, the system **cannot** link the vehicle across different camera streams.
   - If OCR misidentifies even a single alphanumeric character between two cameras, the vehicle trajectories remain disconnected.

---

## 8. Asynchronous Processing & Fault Tolerance (Step 7)

- **Mechanism**: In-memory event-loop deferred execution via Node.js `setImmediate()`.
- **Infrastructure**: No persistent job queue (e.g., Redis, BullMQ, RabbitMQ) and no Node.js `worker_threads` or cluster processes.
- **Empirical Test**: `eval/bench_async_jobs.js`
- **Raw Results**: `eval/results/async_jobs_benchmark.json`

### Upload Response Latency vs. Clip Processing Time

| Clip Name | File Size | Upload Latency (Multer + DB) | Total Job Completion Time | Sampled Frames (3 fps) | Sightings |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `detrac_70_MVI_39511` (15.2s) | 3.73 MB | 16.77 ms | 46.94 s* | 46 | 35 |
| `detrac_69_MVI_39501` (14.0s) | 3.58 MB | 21.36 ms | 12.52 s** | 42 | 44 |
| `detrac_82_MVI_40773` (14.0s) | 2.57 MB | 7.40 ms | 10.51 s** | 42 | 20 |

*\*Includes 10 Gemini OCR API network roundtrips (~3.4s per call) up to `MAX_GEMINI_CALLS_PER_VIDEO`.*
*\*\*Gemini daily quota exhausted; ran local inference + tracker fallback.*

### Server Restart Failure Mode
- **Test**: Simulated server termination while a video job was in the `'processing'` state.
- **Result**: **STUCK** permanently.
- **Root Cause**: Because jobs are queued in Node.js process memory via `setImmediate()`, process termination kills all in-flight asynchronous operations. On startup, `server/server.js` has no recovery hooks to inspect MongoDB for orphaned `'processing'` records, leaving interrupted videos permanently stuck in `'processing'` status.

---

## 9. Failure Analysis & Known Limitations

1. **Low Recall on Distant / Small Vehicles (37.33% Overall Recall)**:
   - YOLOv8n operating on resized frames misses distant or occluded vehicles, generating 20,829 false negatives across 33,238 ground-truth annotations.
2. **Identity Switches in Dense Traffic**:
   - Centroid and IoU tracking without visual appearance features experiences 183 identity switches across 141 ground-truth tracks (121 ID switches occurring in crowded/occluded sequences).
3. **Negative MOTA in Low-Contrast / Heavy Congestion**:
   - Sequences `detrac_69` (-7.41%) and `detrac_70` (-4.18%) produced negative MOTA scores because the sum of false negatives, false positives, and ID switches exceeded the total number of ground-truth boxes, driven by dense vehicle clustering and overlap.
4. **API Latency & Rate Limits**:
   - Sequential Gemini OCR calls add ~3.4 seconds of latency per vehicle sighting, bottlenecking video completion times when quotas are active.
5. **Lack of Crash Resilience**:
   - In-memory job dispatching lacks durability. Crashes or redeployments orphan ongoing video processing tasks.

---

## 10. Resume-Safe Claims

The following statements are strictly supported by the empirical evaluation data and reproducible test artifacts:

1. **End-to-End Pipeline Throughput**:
   > *"Achieved an end-to-end video processing throughput of **3.97 FPS median** (p95: **5.55 FPS**) on an Intel Core i5 quad-core CPU using YOLOv8n ONNX and custom IoU tracking across $n = 30$ benchmark runs."*

2. **Ultra-Fast Tracking Stage**:
   > *"Engineered a lightweight centroid and IoU association tracker operating at **11,062 FPS median** (<0.1 ms per frame overhead, $n = 30$ runs), decoupling tracking latency from neural network inference."*

3. **Multi-Object Tracking Accuracy**:
   > *"Evaluated tracking performance across **2,130 real-world traffic frames** (141 vehicle tracks, 33,238 annotations) from the UA-DETRAC benchmark, achieving **14.96% MOTA** and **42.90% IDF1** overall, with peak performance of **40.14% MOTA** and **59.91% IDF1** on challenging occluded sequences."*

4. **Vehicle Detection Performance**:
   > *"Benchmarked vehicle detection at IoU 0.5 against independent ground truth, achieving **63.11% precision** and **37.33% recall** across 2,130 consecutive traffic frames ($n = 33,238$ GT boxes)."*

5. **Asynchronous Non-Blocking Ingestion**:
   > *"Implemented an asynchronous video ingestion pipeline achieving sub-25 ms upload response times (**7.40 ms – 21.36 ms**, $n = 3$ video streams) by decoupling upload storage from background frame extraction and inference."*

6. **Cross-Camera Re-Identification Architecture**:
   > *"Architected cross-camera vehicle tracking leveraging post-hoc license plate database queries, linking vehicle sightings across disjoint camera streams upon OCR extraction."*
