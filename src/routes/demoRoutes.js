const express = require('express');
const {
  authenticateToken,
  authorizeRoles,
} = require('../middleware/authMiddleware');
const { Issue, User } = require('../models');
const { sendEscalationEmail } = require('../services/emailService');

const router = express.Router();

// DEMO CONTROLS: protect all demo routes by auth + admin role
router.use(authenticateToken, authorizeRoles('admin'));

// DEMO CONTROLS: supervisor-only designation guard for all demo routes
router.use((req, res, next) => {
  if (req.user.designation !== 'supervisor') {
    return res.status(403).json({
      success: false,
      message: 'Only supervisors can access demo controls',
    });
  }
  return next();
});

// DEMO CONTROLS: reset issue back to Level 1 baseline
router.post('/reset-issue', async (req, res, next) => {
  try {
    const { issueId } = req.body || {};
    if (!issueId) {
      return res.status(400).json({ success: false, message: 'issueId is required' });
    }

    const issue = await Issue.findByPk(issueId);
    if (!issue) {
      return res.status(404).json({ success: false, message: 'Issue not found' });
    }

    const level1Officer = await User.findOne({
      where: { email: 'officer1@example.com' },
    });

    if (!level1Officer) {
      return res.status(404).json({
        success: false,
        message: 'No level 1 officer found',
      });
    }

    const now = new Date();
    const severity = (issue.severity || 'low').toLowerCase() === 'high' ? 'high' : 'low';
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + (severity === 'high' ? 7 : 15));

    await issue.update({
      escalation_level: 1,
      escalation_label: 'Level 1',
      assigned_to: level1Officer.id,
      escalated: false,
      escalated_at: null,
      status: 'Open',
      severity,
      created_at: now,
      sla_deadline: deadline,
    });

    return res.json({
      success: true,
      message: 'Issue reset to Level 1',
      issue,
    });
  } catch (error) {
    return next(error);
  }
});

// DEMO CONTROLS: simulate day-based SLA breach state
router.post('/simulate-breach', async (req, res, next) => {
  try {
    const { issueId, day } = req.body || {};
    if (!issueId || ![7, 15].includes(Number(day))) {
      return res.status(400).json({
        success: false,
        message: 'issueId and day (7 or 15) are required',
      });
    }

    const issue = await Issue.findByPk(issueId);
    if (!issue) {
      return res.status(404).json({ success: false, message: 'Issue not found' });
    }

    const now = new Date();

    const level2Officer = await User.findOne({
      where: { email: 'officer3@example.com' },
    });

    if (!level2Officer) {
      return res.status(404).json({
        success: false,
        message: 'No level 2 officer found',
      });
    }

    const isHigh = Number(day) === 7;
    const dayCount = isHigh ? 7 : 15;
    const createdAt = new Date(now.getTime() - dayCount * 24 * 60 * 60 * 1000);
    const breachedAt = new Date(now.getTime() - 60 * 60 * 1000);

    await issue.update({
      created_at: createdAt,
      sla_deadline: breachedAt,
      severity: isHigh ? 'high' : 'low',
      escalation_level: 2,
      escalation_label: 'Level 2',
      assigned_to: level2Officer.id,
      escalated: true,
      escalated_at: breachedAt,
      status: 'Escalated',
    });

    try {
      const supervisor = await User.findOne({
        where: { designation: 'supervisor' },
      });
      await sendEscalationEmail(issue, supervisor);
    } catch (emailError) {
      console.warn('[DEMO] Escalation email failed', emailError.message);
    }

    return res.json({
      success: true,
      message: isHigh
        ? 'Day 7 simulated — assigned to Level 2'
        : 'Day 15 simulated — assigned to Level 2',
    });
  } catch (error) {
    return next(error);
  }
});

// DEMO CONTROLS: undo previous demo action using captured previous state
router.post('/undo', async (req, res, next) => {
  try {
    const { issueId, previousState } = req.body || {};
    if (!issueId || !previousState) {
      return res.status(400).json({
        success: false,
        message: 'issueId and previousState are required',
      });
    }

    const issue = await Issue.findByPk(issueId);
    if (!issue) {
      return res.status(404).json({ success: false, message: 'Issue not found' });
    }

    await issue.update({
      escalation_level: previousState.escalation_level,
      escalation_label: previousState.escalation_label,
      assigned_to: previousState.assigned_to,
      escalated: previousState.escalated,
      escalated_at: previousState.escalated_at,
      status: previousState.status,
      severity: previousState.severity,
      created_at: previousState.created_at,
      sla_deadline: previousState.sla_deadline,
    });

    return res.json({
      success: true,
      message: 'Action undone',
      issue,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
