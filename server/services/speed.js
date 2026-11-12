const { calculateIoU } = require('./tracker');

function calculateCentroidDistance(c1, c2) {
  const dx = c1[0] - c2[0];
  const dy = c1[1] - c2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function computeTrackSpeeds(track, calibrationConstant = 0.5) {
  const history = track.history;
  if (!history || history.length < 2) {
    return {
      instantSpeeds: [],
      maxSpeed: 0,
      avgSpeed: 0,
      flags: []
    };
  }

  const instantSpeeds = [];
  const flags = new Set();
  const OVERSPEED_THRESHOLD = parseFloat(process.env.OVERSPEED_THRESHOLD) || 60;
  const BRAKING_THRESHOLD = parseFloat(process.env.BRAKING_THRESHOLD) || 20;

  let totalSpeed = 0;
  let maxSpeed = 0;

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];

    const dt = (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
    if (dt <= 0) continue;

    const pixelDist = calculateCentroidDistance(prev.centroid, curr.centroid);
    const speed = (pixelDist / dt) * calibrationConstant;

    instantSpeeds.push({
      frameIndex: curr.frameIndex,
      timestamp: curr.timestamp,
      speed
    });

    totalSpeed += speed;
    if (speed > maxSpeed) maxSpeed = speed;

    if (speed >= OVERSPEED_THRESHOLD) {
      flags.add('overspeeding');
    }

    // Check sudden braking: speed drop between consecutive steps
    if (i > 1) {
      const prevSpeed = instantSpeeds[instantSpeeds.length - 2].speed;
      const speedDrop = prevSpeed - speed;
      if (prevSpeed >= 20 && speedDrop >= BRAKING_THRESHOLD) {
        flags.add('sudden_braking');
      }
    }
  }

  const avgSpeed = instantSpeeds.length > 0 ? totalSpeed / instantSpeeds.length : 0;

  return {
    instantSpeeds,
    maxSpeed: Math.round(maxSpeed * 10) / 10,
    avgSpeed: Math.round(avgSpeed * 10) / 10,
    flags: Array.from(flags)
  };
}

function detectCollisions(tracks, trackSpeedMap) {
  const collisionTrackIds = new Set();
  const BRAKING_THRESHOLD = parseFloat(process.env.BRAKING_THRESHOLD) || 20;

  // Compare every pair of tracks
  for (let i = 0; i < tracks.length; i++) {
    for (let j = i + 1; j < tracks.length; j++) {
      const trackA = tracks[i];
      const trackB = tracks[j];

      // Find common frames where both tracks were present
      const mapA = new Map(trackA.history.map((h) => [h.frameIndex, h]));
      const mapB = new Map(trackB.history.map((h) => [h.frameIndex, h]));

      for (const [frameIndex, itemA] of mapA.entries()) {
        if (!mapB.has(frameIndex)) continue;
        const itemB = mapB.get(frameIndex);

        // Check bounding box overlap
        const iou = calculateIoU(itemA.bbox, itemB.bbox);
        if (iou > 0.05) {
          // Check if speed of A or B drops sharply right after overlap
          const speedsA = trackSpeedMap.get(trackA.trackId)?.instantSpeeds || [];
          const speedsB = trackSpeedMap.get(trackB.trackId)?.instantSpeeds || [];

          const dropA = hasSharpSpeedDrop(speedsA, frameIndex, BRAKING_THRESHOLD);
          const dropB = hasSharpSpeedDrop(speedsB, frameIndex, BRAKING_THRESHOLD);

          if (dropA || dropB) {
            collisionTrackIds.add(trackA.trackId);
            collisionTrackIds.add(trackB.trackId);
            break;
          }
        }
      }
    }
  }

  return collisionTrackIds;
}

function hasSharpSpeedDrop(speeds, overlapFrame, threshold) {
  const pre = speeds.find((s) => s.frameIndex <= overlapFrame);
  const post = speeds.find((s) => s.frameIndex > overlapFrame && s.frameIndex <= overlapFrame + 3);

  if (pre && post) {
    const drop = pre.speed - post.speed;
    if (pre.speed >= 15 && drop >= threshold) {
      return true;
    }
  }
  return false;
}

module.exports = {
  computeTrackSpeeds,
  detectCollisions
};

