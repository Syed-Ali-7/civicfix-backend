const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { User, roles } = require('../models');

const buildToken = (user) =>
  jwt.sign(
    {
      userId: user.id,
      role: user.role,
      designation: user.designation || null,
      name: user.name,
      email: user.email,
      phone: user.phone || null,
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
  phone: user.phone || null,
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

const firebaseCheck = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // FIREBASE OTP AUTH
    const { phone } = req.query || {};
    const normalizedPhone = String(phone || '').trim();

    if (!normalizedPhone) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const existingUser = await User.findOne({ where: { phone: normalizedPhone } });
    return res.json({ exists: !!existingUser });
  } catch (error) {
    return next(error);
  }
};

const firebaseLogin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // FIREBASE OTP AUTH
    const { phone, name } = req.body;
    const normalizedPhone = String(phone || '').trim();

    if (!normalizedPhone) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    let user = await User.findOne({ where: { phone: normalizedPhone } });
    const trimmedName = name ? String(name).trim() : '';

    if (!user) {
      user = await User.create({
        name: trimmedName || 'Citizen',
        phone: normalizedPhone,
        role: 'citizen',
      });
    } else if (trimmedName && (!user.name || user.name === 'Citizen')) {
      await user.update({ name: trimmedName });
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
  firebaseCheck,
  firebaseLogin,
};

