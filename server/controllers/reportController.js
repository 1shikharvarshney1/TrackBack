const Sighting = require('../models/Sighting');
const Video = require('../models/Video');
const { generateIncidentReport } = require('../services/report');

exports.getPlateReport = async (req, res) => {
  try {
    const { plate } = req.params;
    if (!plate || !plate.trim()) {
      return res.status(400).json({ error: 'License plate is required' });
    }

    const cleanPlate = plate.replace(/[\s\-_]+/g, '').toUpperCase();
    const queryPattern = cleanPlate.split('').join('[\\s\\-_]*');
    const userVideoIds = await Video.find({ uploadedBy: req.user._id }).distinct('_id');

    const sightings = await Sighting.find({
      video: { $in: userVideoIds },
      plate: { $regex: `^${queryPattern}$`, $options: 'i' }
    })
      .populate('camera', 'name lat lng')
      .sort({ timestamp: 1 });

    if (sightings.length === 0) {
      return res.status(404).json({ error: `No sightings found for plate ${cleanPlate}` });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Incident_Report_${cleanPlate}.pdf"`
    );

    await generateIncidentReport(cleanPlate, sightings, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
};
