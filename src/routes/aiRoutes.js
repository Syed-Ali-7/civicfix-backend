/**
 * AI Routes
 * Endpoints for AI-based pothole verification
 */

const express = require('express');
const { param, body } = require('express-validator');
const {
  verifyPotholeImage,
  batchVerifyPotholes,
  getAIModelInfo,
  getAIStats,
} = require('../controllers/aiController');
const {
  authenticateToken,
  authorizeRoles,
} = require('../middleware/authMiddleware');

const router = express.Router();

// Validation middleware
const issueIdValidation = [
  param('issueId').isUUID().withMessage('Issue ID must be a valid UUID'),
];

const batchVerifyValidation = [
  body('issueIds')
    .isArray({ min: 1 })
    .withMessage('issueIds must be a non-empty array'),
  body('issueIds.*').isUUID().withMessage('Each issue ID must be a valid UUID'),
];

/**
 * POST /api/ai/verify-pothole/:issueId
 * Verify a single issue's image for pothole detection
 * Requires authentication (officer or admin)
 */
router.post(
  '/verify-pothole/:issueId',
  authenticateToken,
  authorizeRoles('officer', 'admin'),
  issueIdValidation,
  verifyPotholeImage
);

/**
 * POST /api/ai/batch-verify
 * Batch verify multiple issues
 * Requires admin authentication
 */
router.post(
  '/batch-verify',
  authenticateToken,
  authorizeRoles('admin'),
  batchVerifyValidation,
  batchVerifyPotholes
);

/**
 * GET /api/ai/model-info
 * Get AI model information
 * Public endpoint for transparency
 */
router.get('/model-info', getAIModelInfo);

/**
 * GET /api/ai/stats
 * Get AI verification statistics
 * Requires authentication
 */
router.get(
  '/stats',
  authenticateToken,
  authorizeRoles('officer', 'admin'),
  getAIStats
);

module.exports = router;
