const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  if (ffmpegInstaller && ffmpegInstaller.path) {
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  }
} catch (e) {
  // Fall back to system-installed ffmpeg if installer package is unavailable
}
const { detectVehicles } = require('./detector');
const { VehicleTracker } = require('./tracker');
const { cropVehicleLowerRegion, readPlate } = require('./plateReader');
const { computeTrackSpeeds, detectCollisions } = require('./speed');
const Video = require('../models/Video');
const Sighting = require('../models/Sighting');

function extractFrames(videoPath, outputDir, fps = 3) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    ffmpeg(videoPath)
      .outputOptions([`-vf fps=${fps}`])
      .output(path.join(outputDir, 'frame_%04d.jpg'))
      .on('end', () => {
        const files = fs
          .readdirSync(outputDir)
          .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
          .sort();
        resolve(
          files.map((file, idx) => ({
            filename: file,
            filepath: path.join(outputDir, file),
            frameIndex: idx,
            offsetSeconds: idx / fps
          }))
        );
      })
      .on('error', (err) => {
        reject(err);
      })
      .run();
  });
}

async function processVideo(videoId) {
  const video = await Video.findById(videoId).populate('camera');
  if (!video) throw new Error('Video not found: ' + videoId);

  try {
    video.status = 'processing';
    await video.save();

    const framesDir = path.join(__dirname, '..', 'uploads', 'frames', video._id.toString());
    const frames = await extractFrames(video.filepath, framesDir, 3);

    const tracker = new VehicleTracker();
    const startTime = new Date(video.startTime).getTime();

    const frameMap = new Map();
    for (const frame of frames) {
      frameMap.set(frame.frameIndex, frame);
      const frameTimestamp = new Date(startTime + frame.offsetSeconds * 1000);
      try {
        const detections = await detectVehicles(frame.filepath);
        tracker.update(detections, frame.frameIndex, frameTimestamp);
      } catch (detErr) {
        console.warn(`Detection error on frame ${frame.frameIndex}:`, detErr.message);
      }
    }

    const tracks = tracker.getTracks();
    const calibrationConstant = parseFloat(process.env.SPEED_CALIBRATION) || 0.5;

    // 1. Calculate speeds and individual flags per track
    const trackSpeedMap = new Map();
    for (const track of tracks) {
      const speedAnalysis = computeTrackSpeeds(track, calibrationConstant);
      trackSpeedMap.set(track.trackId, speedAnalysis);
    }

    // 2. Detect collisions across tracks
    const collisionTrackIds = detectCollisions(tracks, trackSpeedMap);

    const cropsDir = path.join(__dirname, '..', 'uploads', 'crops');
    if (!fs.existsSync(cropsDir)) {
      fs.mkdirSync(cropsDir, { recursive: true });
    }

    const maxGeminiCalls = parseInt(process.env.MAX_GEMINI_CALLS_PER_VIDEO, 10) || 10;
    let geminiCallsCount = 0;
    const sightings = [];

    for (const track of tracks) {
      if (!track.history || track.history.length === 0) continue;

      // Select single best frame with largest bounding box area (vehicle closest/clearest)
      let bestItem = track.history[0];
      let maxArea = bestItem.bbox[2] * bestItem.bbox[3];
      for (const item of track.history) {
        const area = item.bbox[2] * item.bbox[3];
        if (area > maxArea) {
          maxArea = area;
          bestItem = item;
        }
      }

      const bestFrame = frameMap.get(bestItem.frameIndex);
      let plateText = 'unreadable';
      let relativeCropPath = null;

      if (bestFrame && fs.existsSync(bestFrame.filepath)) {
        const cropFilename = `${video._id}_${track.trackId}.jpg`;
        const cropOutputPath = path.join(cropsDir, cropFilename);
        relativeCropPath = `uploads/crops/${cropFilename}`;

        try {
          const cropBuffer = await cropVehicleLowerRegion(
            bestFrame.filepath,
            bestItem.bbox,
            cropOutputPath
          );

          // Enforce hard cap on Gemini calls per video while allowing cached hits
          const allowApi = geminiCallsCount < maxGeminiCalls;
          if (!allowApi) {
            console.warn(
              `Video ${video._id}: Hit MAX_GEMINI_CALLS_PER_VIDEO (${maxGeminiCalls}). Skipping OCR call for ${track.trackId}.`
            );
          }

          const ocrResult = await readPlate(cropBuffer, { allowApiCall: allowApi });
          if (ocrResult.calledApi) {
            geminiCallsCount++;
          }
          plateText = ocrResult.plate || 'unreadable';
        } catch (cropErr) {
          console.warn(`Crop or plate reading failed for track ${track.trackId}:`, cropErr.message);
          plateText = 'unreadable';
        }
      }

      const speedInfo = trackSpeedMap.get(track.trackId) || { maxSpeed: 0, flags: [] };
      const finalFlags = new Set(speedInfo.flags);
      if (collisionTrackIds.has(track.trackId)) {
        finalFlags.add('possible_collision');
      }

      const sighting = await Sighting.create({
        video: video._id,
        camera: video.camera._id,
        trackId: track.trackId,
        vehicleType: track.className || 'car',
        plate: plateText,
        timestamp: bestItem.timestamp,
        bbox: bestItem.bbox,
        cropImagePath: relativeCropPath,
        estimatedSpeed: speedInfo.maxSpeed,
        flags: Array.from(finalFlags)
      });

      sightings.push(sighting);
    }

    video.status = 'done';
    await video.save();

    return {
      videoId: video._id,
      framesCount: frames.length,
      sightingsCount: sightings.length,
      geminiCallsCount,
      sightings
    };
  } catch (err) {
    video.status = 'failed';
    video.error = err.message;
    await video.save();
    throw err;
  }
}

module.exports = {
  extractFrames,
  processVideo
};
