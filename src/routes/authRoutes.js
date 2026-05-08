const express = require('express');
const { body, query } = require('express-validator');
const { register, login, getUsers, firebaseLogin, firebaseCheck } = require('../controllers/authController');
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
  '/firebase-login',
  [body('phone').trim().notEmpty().withMessage('Phone number is required')],
  firebaseLogin
);
router.get(
  '/firebase-check',
  [query('phone').trim().notEmpty().withMessage('Phone number is required')],
  firebaseCheck
);
router.get('/users', authenticateToken, authorizeRoles('admin'), getUsers);

module.exports = router;

