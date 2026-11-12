const mongoose = require('mongoose');

const sightingSchema = new mongoose.Schema(
  {
    video: { type: mongoose.Schema.Types.ObjectId, ref: 'Video', required: true, index: true },
    camera: { type: mongoose.Schema.Types.ObjectId, ref: 'Camera', required: true },
    trackId: { type: String, required: true },
    vehicleType: { type: String, default: 'car' },
    plate: { type: String, uppercase: true, trim: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    bbox: [{ type: Number }],
    cropImagePath: { type: String },
    estimatedSpeed: { type: Number, default: 0 },
    flags: [{ type: String, enum: ['overspeeding', 'sudden_braking', 'possible_collision'] }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Sighting', sightingSchema);
