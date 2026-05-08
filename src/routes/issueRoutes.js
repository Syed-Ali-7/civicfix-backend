const express = require('express');
const { body, param } = require('express-validator');
const {
  createIssue,
  getIssues,
  getIssueById,
  updateIssueStatus,
  updateIssue,
  deleteIssue,
  testAIPipeline,
  submitIssueFeedback,
} = require('../controllers/issueController');
const {
  authenticateToken,
  optionalAuthenticateToken,
  authorizeRoles,
} = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

const router = express.Router();

const issueIdValidation = [
  param('id').isUUID().withMessage('Issue id must be a valid UUID'),
];

const createIssueValidation = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('photo_url')
    .optional({ nullable: true, checkFalsy: true })
    .isURL()
    .withMessage('Photo URL must be valid'),
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude is invalid'),
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude is invalid'),
  body('status')
    .optional()
    .isIn(['Open', 'Resolved', 'Escalated', 'Closed', 'Reopened'])
    .withMessage('Status must be Open, Resolved, Escalated, Closed, or Reopened'),
];

const updateIssueValidation = [
  body('title')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Title cannot be empty'),
  body('description')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Description cannot be empty'),
  body('photo_url').optional().isURL().withMessage('Photo URL must be valid'),
  body('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude is invalid'),
  body('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude is invalid'),
  body('status')
    .optional()
    .isIn(['Open', 'Resolved', 'Escalated', 'Closed', 'Reopened'])
    .withMessage('Status must be Open, Resolved, Escalated, Closed, or Reopened'),
];

// AI PIPELINE INTEGRATION — Protected test route (admin only, dev use)
router.post(
  '/test-ai',
  authenticateToken,
  authorizeRoles('admin'),
  testAIPipeline
);

router.post(
  '/',
  authenticateToken,
  upload.single('image'),
  createIssueValidation,
  createIssue
);
router.get('/', optionalAuthenticateToken, getIssues);

router.post(
  '/:id/feedback',
  authenticateToken,
  issueIdValidation,
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
  ]),
  submitIssueFeedback
);

router.patch(
  '/:id/status',
  authenticateToken,
  authorizeRoles('staff', 'admin'),
  issueIdValidation,
  [
    body('status')
      .isIn(['Open', 'Resolved', 'Escalated'])
      .withMessage('Status must be Open, Resolved, or Escalated'),
  ],
  updateIssueStatus
);

router.get('/:id', issueIdValidation, getIssueById);
router.patch(
  '/:id',
  authenticateToken,
  authorizeRoles('staff', 'admin'),
  upload.single('image'),
  issueIdValidation,
  updateIssueValidation,
  updateIssue
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('staff', 'admin'),
  upload.single('image'),
  issueIdValidation,
  updateIssueValidation,
  updateIssue
);
router.delete(
  '/:id',
  authenticateToken,
  issueIdValidation,
  deleteIssue
);

module.exports = router;
