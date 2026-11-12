const Sighting = require('../models/Sighting');
const Video = require('../models/Video');

exports.searchByPlate = async (req, res) => {
  try {
    const { plate } = req.query;
    if (!plate || !plate.trim()) {
      return res.status(400).json({ error: 'Plate search query is required' });
    }

    const cleanPlate = plate.replace(/[\s\-_]+/g, '').toUpperCase();
    const queryPattern = cleanPlate.split('').join('[\\s\\-_]*');
    const userVideoIds = await Video.find({ uploadedBy: req.user._id }).distinct('_id');

    const sightings = await Sighting.find({
      video: { $in: userVideoIds },
      plate: { $regex: queryPattern, $options: 'i' }
    })
      .populate('camera', 'name lat lng')
      .populate('video', 'filename startTime status')
      .sort({ timestamp: 1 });

    res.json(sightings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSightings = async (req, res) => {
  try {
    const userVideoIds = await Video.find({ uploadedBy: req.user._id }).distinct('_id');

    const sightings = await Sighting.find({ video: { $in: userVideoIds } })
      .populate('camera', 'name lat lng')
      .populate('video', 'filename startTime')
      .sort({ timestamp: -1 })
      .limit(100);

    res.json(sightings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSightingById = async (req, res) => {
  try {
    const userVideoIds = await Video.find({ uploadedBy: req.user._id }).distinct('_id');

    const sighting = await Sighting.findOne({
      _id: req.params.id,
      video: { $in: userVideoIds }
    })
      .populate('camera', 'name lat lng')
      .populate('video', 'filename startTime');

    if (!sighting) {
      return res.status(404).json({ error: 'Sighting not found' });
    }

    res.json(sighting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const userVideoIds = await Video.find({ uploadedBy: req.user._id }).distinct('_id');

    const videoCount = await Video.countDocuments({ uploadedBy: req.user._id });
    const vehicleCount = await Sighting.countDocuments({ video: { $in: userVideoIds } });
    const flaggedCount = await Sighting.countDocuments({
      video: { $in: userVideoIds },
      'flags.0': { $exists: true }
    });

    res.json({
      videoCount,
      vehicleCount,
      flaggedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
