const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { User, roles } = require('../models');
const { createOtp, verifyOtp } = require('../services/otpService');
const { sendOTPEmail } = require('../services/emailService');

const buildToken = (user) =>
  jwt.sign(
    {
      userId: user.id,
      role: user.role,
      designation: user.designation || null,
      name: user.name,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
    expiresIn: '12h',
    }
  );

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  designation: user.designation || null,
});

const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password } = req.body;
    const requestedRole = req.body.role || 'citizen';

    if (requestedRole !== 'citizen') {
      return res
        .status(403)
        .json({ message: 'Only citizen registrations are allowed via this route' });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'citizen',
    });

    const token = buildToken(user);
    return res.status(201).json({ user: sanitizeUser(user), token });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = buildToken(user);
    return res.json({ user: sanitizeUser(user), token });
  } catch (error) {
    return next(error);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'role', 'designation', 'created_at', 'updated_at'],
      order: [['created_at', 'DESC']],
    });
    return res.json({ users, count: users.length });
  } catch (error) {
    return next(error);
  }
};

const checkUser = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const existingUser = await User.findOne({
      where: { email: normalizedEmail, role: 'citizen' },
    });

    return res.json({ exists: !!existingUser });
  } catch (error) {
    return next(error);
  }
};

const sendOtp = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email } = req.body;
    const trimmedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const otp = createOtp(normalizedEmail);

    try {
      await sendOTPEmail(normalizedEmail, otp);
      return res.json({ success: true, message: 'OTP sent successfully' });
    } catch (emailError) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again later.',
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP. Please try again later.',
    });
  }
};

const verifyOtpLogin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, otp } = req.body;
    const trimmedName = String(name || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const verification = verifyOtp(normalizedEmail, otp);
    if (!verification.valid) {
      return res.status(400).json({ message: verification.message });
    }

    let user = await User.findOne({ where: { email: normalizedEmail } });
    if (!user) {
      if (!trimmedName) {
        return res.status(400).json({ message: 'Name is required for new users' });
      }
      user = await User.create({
        name: trimmedName,
        email: normalizedEmail,
        role: 'citizen',
        designation: null,
      });
    } else {
      // Always clear designation for citizens
      if (user.role === 'citizen' && user.designation) {
        await user.update({ designation: null });
      }
      if (trimmedName && (!user.name || user.name === 'Citizen')) {
        await user.update({ name: trimmedName });
      }
    }

    const token = buildToken(user);
    return res.json({ user: sanitizeUser(user), token });
  } catch (error) {
    return next(error);
  }
};

const updatePushToken = async (req, res, next) => {
  try {
    const { push_token } = req.body || {};

    await User.update(
      { push_token: push_token || null },
      { where: { id: req.user.userId } }
    );

    return res.json({ success: true, message: 'Push token saved' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  login,
  getUsers,
  updatePushToken,
  checkUser,
  sendOtp,
  verifyOtpLogin,
};

