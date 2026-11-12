const express = require('express');
const router = express.Router();
const { getPlateReport } = require('../controllers/reportController');
const auth = require('../middleware/auth');

router.get('/plate/:plate', auth, getPlateReport);

module.exports = router;

