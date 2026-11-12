const express = require('express');
const router = express.Router();
const {
  uploadVideo,
  getVideos,
  getVideoById,
  deleteVideo
} = require('../controllers/videoController');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/upload', auth, upload.single('video'), uploadVideo);
router.get('/', auth, getVideos);
router.get('/:id', auth, getVideoById);
router.delete('/:id', auth, deleteVideo);

module.exports = router;
