const Video = require('../models/Video');
const Camera = require('../models/Camera');
const Sighting = require('../models/Sighting');
const { processVideo } = require('../services/videoProcessor');

exports.uploadVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Video file is required' });
    }

    const { cameraId, startTime } = req.body;
    if (!cameraId || !startTime) {
      return res.status(400).json({ error: 'cameraId and startTime are required' });
    }

    const camera = await Camera.findById(cameraId);
    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    const video = await Video.create({
      camera: cameraId,
      uploadedBy: req.user._id,
      filename: req.file.filename,
      originalName: req.file.originalname,
      filepath: req.file.path,
      startTime: new Date(startTime),
      status: 'queued'
    });

    // Run processing asynchronously in background without blocking response
    setImmediate(() => {
      processVideo(video._id).catch((err) => {
        console.error(`Background processing failed for video ${video._id}:`, err.message);
      });
    });

    res.status(201).json(video);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getVideos = async (req, res) => {
  try {
    const videos = await Video.find({ uploadedBy: req.user._id })
      .populate('camera', 'name lat lng')
      .sort({ createdAt: -1 });
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getVideoById = async (req, res) => {
  try {
    const video = await Video.findOne({
      _id: req.params.id,
      uploadedBy: req.user._id
    }).populate('camera', 'name lat lng');

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.json(video);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteVideo = async (req, res) => {
  try {
    const video = await Video.findOneAndDelete({
      _id: req.params.id,
      uploadedBy: req.user._id
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Also remove associated sightings
    await Sighting.deleteMany({ video: video._id });

    res.json({ message: 'Video and associated sightings deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
