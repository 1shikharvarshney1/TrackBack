const Camera = require('../models/Camera');

exports.createCamera = async (req, res) => {
  try {
    const { name, lat, lng } = req.body;
    if (!name || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'Name, lat, and lng are required' });
    }

    const camera = await Camera.create({
      name: name.trim(),
      lat: Number(lat),
      lng: Number(lng)
    });

    res.status(201).json(camera);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCameras = async (req, res) => {
  try {
    const cameras = await Camera.find().sort({ createdAt: -1 });
    res.json(cameras);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCameraById = async (req, res) => {
  try {
    const camera = await Camera.findById(req.params.id);
    if (!camera) {
      return res.status(404).json({ error: 'Camera not found' });
    }
    res.json(camera);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

