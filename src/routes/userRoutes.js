const express = require('express');
const { updatePushToken } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.patch('/push-token', authenticateToken, updatePushToken);

module.exports = router;
