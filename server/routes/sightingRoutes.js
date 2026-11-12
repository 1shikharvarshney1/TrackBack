const express = require('express');
const router = express.Router();
const {
  searchByPlate,
  getSightings,
  getSightingById,
  getStats
} = require('../controllers/sightingController');
const auth = require('../middleware/auth');

router.get('/search', auth, searchByPlate);
router.get('/stats', auth, getStats);
router.get('/', auth, getSightings);
router.get('/:id', auth, getSightingById);

module.exports = router;

