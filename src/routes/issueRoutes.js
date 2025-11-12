const express = require('express');
const { body, param } = require('express-validator');
const {
  createIssue,
  getIssues,
  getIssueById,
  updateIssue,
  deleteIssue,
} = require('../controllers/issueController');
const {
  authenticateToken,
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
    .isIn(['Open', 'In Progress', 'Resolved'])
    .withMessage('Status must be Open, In Progress, or Resolved'),
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
    .isIn(['Open', 'In Progress', 'Resolved'])
    .withMessage('Status must be Open, In Progress, or Resolved'),
];

router.post(
  '/',
  authenticateToken,
  upload.single('photo'),
  createIssueValidation,
  createIssue
);
router.get('/', getIssues);
router.get('/:id', issueIdValidation, getIssueById);
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('staff', 'admin'),
  upload.single('photo'),
  issueIdValidation,
  updateIssueValidation,
  updateIssue
);
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('admin'),
  issueIdValidation,
  deleteIssue
);

module.exports = router;
