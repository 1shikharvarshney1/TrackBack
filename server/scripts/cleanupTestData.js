require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Video = require('../models/Video');
const Sighting = require('../models/Sighting');

async function cleanupTestData() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/trackback';
  console.log('Connecting to database...');
  await mongoose.connect(uri);

  try {
    // Find all videos missing uploadedBy field
    const unownedVideos = await Video.find({
      $or: [{ uploadedBy: { $exists: false } }, { uploadedBy: null }]
    }).select('_id originalName');

    const unownedVideoIds = unownedVideos.map((v) => v._id);
    console.log(`Found ${unownedVideoIds.length} video(s) without an uploadedBy field.`);

    let deletedSightingsCount = 0;
    if (unownedVideoIds.length > 0) {
      const sightingResult = await Sighting.deleteMany({
        video: { $in: unownedVideoIds }
      });
      deletedSightingsCount = sightingResult.deletedCount;

      const videoResult = await Video.deleteMany({
        _id: { $in: unownedVideoIds }
      });
      console.log(`Deleted ${videoResult.deletedCount} unowned video document(s).`);
      console.log(`Deleted ${deletedSightingsCount} associated sighting document(s).`);
    } else {
      console.log('No unowned video documents to delete.');
    }

    // Clean up any orphan sightings whose video no longer exists in DB
    const existingVideoIds = await Video.distinct('_id');
    const orphanResult = await Sighting.deleteMany({
      video: { $nin: existingVideoIds }
    });
    if (orphanResult.deletedCount > 0) {
      console.log(`Deleted ${orphanResult.deletedCount} orphan sighting document(s).`);
    }

    console.log('Cleanup completed successfully.');
  } catch (err) {
    console.error('Error during cleanup:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed.');
  }
}

cleanupTestData();

