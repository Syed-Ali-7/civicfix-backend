const express = require('express');
const { body } = require('express-validator');
const { register, login, getUsers, checkUser, sendOtp, verifyOtpLogin } = require('../controllers/authController');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  body('role')
    .optional()
    .isIn(['citizen', 'staff', 'admin'])
    .withMessage('Role must be citizen, staff, or admin'),
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post(
  '/check-user',
  [body('email').isEmail().withMessage('Valid email is required')],
  checkUser
);
router.post(
  '/send-otp',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('name').optional().trim(),
  ],
  sendOtp
);
router.post(
  '/verify-otp',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
    body('name').optional().trim(),
  ],
  verifyOtpLogin
);
router.get('/users', authenticateToken, authorizeRoles('admin'), getUsers);

module.exports = router;

