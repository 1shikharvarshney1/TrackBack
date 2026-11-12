const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema(
  {
    camera: { type: mongoose.Schema.Types.ObjectId, ref: 'Camera', required: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    filepath: { type: String, required: true },
    startTime: { type: Date, required: true },
    status: {
      type: String,
      enum: ['queued', 'processing', 'done', 'failed'],
      default: 'queued'
    },
    error: { type: String }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Video', videoSchema);
