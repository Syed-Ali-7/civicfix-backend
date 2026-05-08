/**
 * SLA Escalation Background Service
 * Runs every hour to find issues that have breached their SLA deadline
 * and automatically escalates them.
 */

const cron = require('node-cron');
const { Op } = require('sequelize');
const { Issue, User } = require('../models');
const logger = require('../utils/logger');
const { sendPushNotification } = require('../utils/notificationService');
const { sendEscalationEmail } = require('../services/emailService');

const LEVEL_2_OFFICER_EMAIL = 'officer3@example.com';

/**
 * SLA TRACKER — Escalation job logic
 * Finds all unresolved, non-escalated issues past their sla_deadline
 * and marks them as Escalated.
 */
async function runEscalationCheck() {
  try {
    const now = new Date();

    // ESCALATION SYSTEM: preload designated officers
    const level2Officer = await User.findOne({
      where: { email: LEVEL_2_OFFICER_EMAIL },
    });

    // ESCALATION SYSTEM: only unresolved issues that can still escalate
    const pendingIssues = await Issue.findAll({
      where: {
        status: { [Op.ne]: 'Resolved' },
        escalation_level: 1,
      },
    });

    if (pendingIssues.length === 0) {
      logger.info('[SLA] Escalation check complete — 0 issues updated');
      return 0;
    }

    let updatedCount = 0;

    for (const issue of pendingIssues) {
      try {
        const createdAt = new Date(issue.created_at || issue.createdAt);
        const daysElapsed = (now - createdAt) / (1000 * 60 * 60 * 24);
        const severity = (issue.severity || 'low').toLowerCase();

        // 2-LEVEL ESCALATION
        const isHighBreach = severity === 'high' && daysElapsed >= 7;
        const isLowBreach = severity !== 'high' && daysElapsed >= 15;

        if (issue.escalation_level === 1 && (isHighBreach || isLowBreach)) {
          if (!level2Officer) {
            logger.warn('[SLA] No level 2 officer found for escalation');
            continue;
          }

          await issue.update({
            escalation_level: 2,
            escalation_label: 'Level 2',
            assigned_to: level2Officer.id,
            escalated: true,
            escalated_at: now,
            status: 'Escalated',
          });

          try {
            const reporter = issue.reporter_id
              ? await User.findByPk(issue.reporter_id)
              : null;
            await sendPushNotification(
              reporter?.push_token,
              'Issue Update',
              'Your pothole report has been escalated to a senior officer for faster resolution.',
              { issueId: issue.id, screen: 'IssueDetail' }
            );
          } catch (notifyError) {
            logger.warn('[SLA] Escalation notification failed', {
              message: notifyError.message,
            });
          }

          // EMAIL ESCALATION
          try {
            const supervisor = await User.findOne({
              where: { designation: 'supervisor' },
            });
            if (supervisor) {
              await sendEscalationEmail(issue, supervisor);
            }
          } catch (emailError) {
            logger.warn('[SLA] Escalation email failed', {
              message: emailError.message,
            });
          }

          const logDay = isHighBreach ? 7 : 15;
          const logSeverity = isHighBreach ? 'HIGH' : 'LOW';
          logger.info(
            `[SLA] Issue #${issue.id} -> Level 2 — Day ${logDay} breach (${logSeverity})`
          );
          updatedCount += 1;
        }
      } catch (updateErr) {
        logger.error(`[SLA] Failed to process issue #${issue.id}`, {
          message: updateErr.message,
        });
      }
    }

    logger.info(`[SLA] Escalation check complete — ${updatedCount} issues updated`);
    return updatedCount;
  } catch (err) {
    logger.error('[SLA] Escalation job error', { message: err.message });
    return 0;
  }
}

/**
 * Start the SLA escalation cron job.
 * Runs at the start of every hour: 0 * * * *
 */
function start() {
  logger.info('[SLA] Starting SLA escalation service (runs every hour)');

  // Run immediately on startup to catch any missed escalations
  runEscalationCheck();

  // SLA TRACKER: Schedule hourly escalation checks
  cron.schedule('0 * * * *', () => {
    logger.info('[SLA] Running scheduled escalation check...');
    runEscalationCheck();
  });
}

module.exports = { start, runEscalationCheck };
