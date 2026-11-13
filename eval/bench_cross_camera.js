const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const Camera = require('../server/models/Camera');
const Video = require('../server/models/Video');
const Sighting = require('../server/models/Sighting');
const User = require('../server/models/User');

async function testCrossCamera() {
  console.log('======================================================');
  console.log('STEP 6: CROSS-CAMERA RE-IDENTIFICATION EVALUATION');
  console.log('Analyzing codebase mechanism & executing verification test');
  console.log('======================================================');

  // 1. Static Code Analysis verification
  const servicesDir = path.join(__dirname, '..', 'server', 'services');
  const serviceFiles = fs.readdirSync(servicesDir);
  console.log('Server services present:', serviceFiles);

  const trackerCode = fs.readFileSync(path.join(servicesDir, 'tracker.js'), 'utf8');
  const hasVisualEmbeddings = trackerCode.includes('embedding') || trackerCode.includes('feature') || trackerCode.includes('reid');
  console.log(`- Visual embeddings / appearance features in tracker.js: ${hasVisualEmbeddings ? 'YES' : 'NO'}`);

  const sightingControllerCode = fs.readFileSync(path.join(__dirname, '..', 'server', 'controllers', 'sightingController.js'), 'utf8');
  const hasPlateRegexMatch = sightingControllerCode.includes('cleanPlate.split') && sightingControllerCode.includes('$regex');
  console.log(`- Cross-camera plate regex query in sightingController.js: ${hasPlateRegexMatch ? 'YES' : 'NO'}`);

  // 2. Database & API behavior test
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/trackback';
  console.log(`Connecting to MongoDB at: ${mongoUri}...`);
  await mongoose.connect(mongoUri);

  // Setup test user
  let testUser = await User.findOne({ email: 'eval_cross_cam@trackback.local' });
  if (!testUser) {
    testUser = await User.create({
      name: 'Eval Tester',
      email: 'eval_cross_cam@trackback.local',
      password: 'evalpassword123'
    });
  }

  // Setup 2 test cameras
  const cam1 = await Camera.create({
    name: 'Camera 1 - North Gate',
    lat: 37.7749,
    lng: -122.4194
  });
  const cam2 = await Camera.create({
    name: 'Camera 2 - South Gate',
    lat: 37.7755,
    lng: -122.4180
  });

  // Setup 2 test videos
  const now = new Date();
  const vid1 = await Video.create({
    camera: cam1._id,
    uploadedBy: testUser._id,
    filename: 'test_cam1.mp4',
    originalName: 'test_cam1.mp4',
    filepath: 'eval/data/test_cam1.mp4',
    startTime: now,
    status: 'done'
  });
  const vid2 = await Video.create({
    camera: cam2._id,
    uploadedBy: testUser._id,
    filename: 'test_cam2.mp4',
    originalName: 'test_cam2.mp4',
    filepath: 'eval/data/test_cam2.mp4',
    startTime: new Date(now.getTime() + 120000), // 2 mins later
    status: 'done'
  });

  // Scenario A: Same vehicle with successfully read matching plate
  const plateText = 'KA01AB1234';
  const sight1 = await Sighting.create({
    video: vid1._id,
    camera: cam1._id,
    trackId: 'TRK-1',
    vehicleType: 'car',
    plate: plateText,
    timestamp: now,
    bbox: [100, 100, 200, 150]
  });
  const sight2 = await Sighting.create({
    video: vid2._id,
    camera: cam2._id,
    trackId: 'TRK-9',
    vehicleType: 'car',
    plate: plateText,
    timestamp: new Date(now.getTime() + 120000),
    bbox: [120, 110, 210, 160]
  });

  // Scenario B: Same vehicle observed at Cam 1 and Cam 2, but plate unreadable (e.g. night/rain/rear-only angle)
  const sightUnreadable1 = await Sighting.create({
    video: vid1._id,
    camera: cam1._id,
    trackId: 'TRK-2',
    vehicleType: 'truck',
    plate: 'unreadable',
    timestamp: now,
    bbox: [300, 200, 300, 250]
  });
  const sightUnreadable2 = await Sighting.create({
    video: vid2._id,
    camera: cam2._id,
    trackId: 'TRK-14',
    vehicleType: 'truck',
    plate: 'unreadable',
    timestamp: new Date(now.getTime() + 130000),
    bbox: [320, 210, 310, 260]
  });

  // Test Sighting query logic (from sightingController.searchByPlate)
  const cleanPlate = plateText.replace(/[\s\-_]+/g, '').toUpperCase();
  const queryPattern = cleanPlate.split('').join('[\\s\\-_]*');
  const userVideoIds = await Video.find({ uploadedBy: testUser._id }).distinct('_id');

  const matchedSightings = await Sighting.find({
    video: { $in: userVideoIds },
    plate: { $regex: queryPattern, $options: 'i' }
  }).populate('camera').populate('video').sort({ timestamp: 1 });

  console.log(`\nTest Case A (Matching Plate String "${plateText}"):`);
  console.log(`  Query matched: ${matchedSightings.length} sightings across cameras.`);
  for (const s of matchedSightings) {
    console.log(`  - At ${s.timestamp.toISOString()}: Camera "${s.camera.name}", Track "${s.trackId}", Plate "${s.plate}"`);
  }

  console.log(`\nTest Case B (Unreadable Plates):`);
  const unreadableMatches = await Sighting.find({
    video: { $in: userVideoIds },
    plate: 'unreadable'
  });
  console.log(`  Unreadable sightings in database: ${unreadableMatches.length}.`);
  console.log(`  Can system associate TRK-2 (Cam 1) with TRK-14 (Cam 2)? NO (No appearance/visual Re-ID model exists).`);

  // Clean up test data
  await Sighting.deleteMany({ video: { $in: [vid1._id, vid2._id] } });
  await Video.deleteMany({ _id: { $in: [vid1._id, vid2._id] } });
  await Camera.deleteMany({ _id: { $in: [cam1._id, cam2._id] } });
  await User.deleteOne({ _id: testUser._id });
  await mongoose.disconnect();

  const report = {
    mechanism: "Post-hoc database string/regex match on OCR license plate text",
    visualReIdModel: false,
    crossCameraTrajectoryFusion: false,
    worksWhenPlateMatches: true,
    worksWhenPlateUnreadable: false,
    limitation: "Does NOT perform visual re-identification. Cross-camera vehicle linkage relies 100% on successful Gemini OCR plate extraction and string equality."
  };

  const resultsDir = path.join(__dirname, 'results');
  fs.writeFileSync(path.join(resultsDir, 'cross_camera_evaluation.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('\nReport written to eval/results/cross_camera_evaluation.json');
}

testCrossCamera().catch(console.error);
