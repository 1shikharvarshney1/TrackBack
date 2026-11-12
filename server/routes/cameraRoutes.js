const express = require('express');
const router = express.Router();
const { createCamera, getCameras, getCameraById } = require('../controllers/cameraController');
const auth = require('../middleware/auth');

router.post('/', auth, createCamera);
router.get('/', auth, getCameras);
router.get('/:id', auth, getCameraById);

module.exports = router;

