const mongoose = require('mongoose');

const cameraSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Camera', cameraSchema);

