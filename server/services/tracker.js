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

function calculateCentroidDistance(c1, c2) {
  const dx = c1[0] - c2[0];
  const dy = c1[1] - c2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

class VehicleTracker {
  constructor(options = {}) {
    this.maxLostFrames = options.maxLostFrames || 5;
    this.iouThreshold = options.iouThreshold || 0.2;
    this.maxCentroidDistance = options.maxCentroidDistance || 150;
    this.nextTrackId = 1;
    this.activeTracks = [];
    this.allTracks = [];
  }

  update(detections, frameIndex, timestamp) {
    const matchedTrackIndices = new Set();
    const matchedDetectionIndices = new Set();

    // Compute pairwise similarity
    const pairs = [];
    for (let t = 0; t < this.activeTracks.length; t++) {
      const track = this.activeTracks[t];
      for (let d = 0; d < detections.length; d++) {
        const det = detections[d];
        const iou = calculateIoU(track.bbox, det.bbox);
        const dist = calculateCentroidDistance(track.centroid, det.centroid);

        // Eligible if IoU is reasonable or centroid is close
        if (iou >= this.iouThreshold || (dist <= this.maxCentroidDistance && iou > 0.05)) {
          pairs.push({ t, d, iou, dist, score: iou * 100 - dist });
        }
      }
    }

    // Sort pairs greedily by score descending
    pairs.sort((a, b) => b.score - a.score);

    for (const pair of pairs) {
      if (matchedTrackIndices.has(pair.t) || matchedDetectionIndices.has(pair.d)) {
        continue;
      }

      matchedTrackIndices.add(pair.t);
      matchedDetectionIndices.add(pair.d);

      const track = this.activeTracks[pair.t];
      const det = detections[pair.d];

      track.bbox = det.bbox;
      track.centroid = det.centroid;
      track.lastSeenFrame = frameIndex;
      track.lostFrames = 0;
      track.className = det.className;
      track.history.push({
        frameIndex,
        timestamp,
        bbox: det.bbox,
        centroid: det.centroid
      });
    }

    // Unmatched detections -> create new tracks
    for (let d = 0; d < detections.length; d++) {
      if (!matchedDetectionIndices.has(d)) {
        const det = detections[d];
        const newTrack = {
          trackId: `TRK-${this.nextTrackId++}`,
          className: det.className,
          bbox: det.bbox,
          centroid: det.centroid,
          firstSeenFrame: frameIndex,
          lastSeenFrame: frameIndex,
          lostFrames: 0,
          history: [
            {
              frameIndex,
              timestamp,
              bbox: det.bbox,
              centroid: det.centroid
            }
          ]
        };
        this.activeTracks.push(newTrack);
        this.allTracks.push(newTrack);
      }
    }

    // Unmatched active tracks -> increment lostFrames
    for (let t = 0; t < this.activeTracks.length; t++) {
      if (!matchedTrackIndices.has(t)) {
        this.activeTracks[t].lostFrames++;
      }
    }

    // Remove tracks that exceeded maxLostFrames
    this.activeTracks = this.activeTracks.filter(
      (track) => track.lostFrames <= this.maxLostFrames
    );

    return this.activeTracks;
  }

  getTracks() {
    return this.allTracks;
  }
}

module.exports = {
  VehicleTracker,
  calculateIoU,
  calculateCentroidDistance
};

