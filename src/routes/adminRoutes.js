const express = require('express');
const {
  authenticateToken,
  authorizeRoles,
} = require('../middleware/authMiddleware');
const { runEscalationCheck } = require('../services/slaEscalationService');
const { sendEscalationEmail } = require('../services/emailService');
const { Issue, User } = require('../models');

const router = express.Router();

// ESCALATION SYSTEM: manual escalation trigger for demo/admin operations
router.post(
  '/trigger-escalation',
  authenticateToken,
  authorizeRoles('admin'),
  async (req, res, next) => {
    try {
      const escalatedCount = await runEscalationCheck();
      return res.json({
        success: true,
        message: 'Escalation check complete',
        escalated_count: escalatedCount,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  '/test-email',
  authenticateToken,
  authorizeRoles('admin'),
  async (req, res, next) => {
    try {
      const issue = await Issue.findOne({
        where: { status: 'Escalated' },
        order: [['escalated_at', 'DESC']],
      });

      if (!issue) {
        return res.json({
          success: false,
          message: 'No escalated issue found to test with',
        });
      }

      const supervisor = await User.findOne({
        where: { designation: 'supervisor' },
      });

      if (!supervisor) {
        return res.json({
          success: false,
          message: 'No supervisor found to send email',
        });
      }

      await sendEscalationEmail(issue, supervisor);
      return res.json({
        success: true,
        message: `Test email sent to ${process.env.EMAIL_USER}`,
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
