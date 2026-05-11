const OTP_EXPIRY_MS = 5 * 60 * 1000;
const otpStore = new Map();

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const createOtp = (email) => {
  const normalizedEmail = normalizeEmail(email);
  const otp = generateOtp();
  const expiresAt = Date.now() + OTP_EXPIRY_MS;
  otpStore.set(normalizedEmail, { otp, expiresAt });
  return otp;
};

const verifyOtp = (email, otpInput) => {
  const normalizedEmail = normalizeEmail(email);
  const entry = otpStore.get(normalizedEmail);

  if (!entry) {
    return { valid: false, message: 'OTP not found. Please request a new code.' };
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(normalizedEmail);
    return { valid: false, message: 'OTP expired. Please request a new code.' };
  }

  const normalizedOtp = String(otpInput || '').trim();
  if (entry.otp !== normalizedOtp) {
    return { valid: false, message: 'Invalid OTP. Please try again.' };
  }

  otpStore.delete(normalizedEmail);
  return { valid: true };
};

const cleanupExpiredOtps = () => {
  const now = Date.now();
  for (const [email, entry] of otpStore.entries()) {
    if (now > entry.expiresAt) {
      otpStore.delete(email);
    }
  }
};

setInterval(cleanupExpiredOtps, 60 * 1000);

module.exports = {
  createOtp,
  verifyOtp,
};
