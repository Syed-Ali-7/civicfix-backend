/**
 * AI Controller
 * Handles AI-based pothole verification requests
 */

const { Issue } = require('../models');
const { verifyPothole } = require('../utils/potholeDetectionAI');
const path = require('path');
const catchAsync = require('../utils/catchAsync');

/**
 * POST /api/ai/verify-pothole/:issueId
 * Verify if an issue's image contains a pothole using AI
 */
const verifyPotholeImage = catchAsync(async (req, res) => {
  const { issueId } = req.params;

  console.log('🤖 AI Verification Request for issue:', issueId);

  // Find the issue
  const issue = await Issue.findByPk(issueId);

  if (!issue) {
    return res.status(404).json({
      success: false,
      message: 'Issue not found',
    });
  }

  if (!issue.photo_url) {
    return res.status(400).json({
      success: false,
      message: 'Issue has no photo to verify',
    });
  }

  // Extract filename from photo URL
  const photoUrlParts = issue.photo_url.split('/');
  const filename = photoUrlParts[photoUrlParts.length - 1];
  const imagePath = path.join(__dirname, '../../uploads', filename);

  try {
    // Run AI verification
    const result = await verifyPothole(imagePath);

    // Update issue with AI verification results
    await issue.update({
      ai_verified: result.isPothole,
      ai_confidence: result.confidence,
      ai_label: result.label,
      needs_review: !result.isPothole || result.confidence < 0.5,
    });

    console.log('✅ AI Verification completed:', {
      issueId,
      isPothole: result.isPothole,
      confidence: result.confidence,
    });

    res.json({
      success: true,
      message: result.isPothole
        ? 'Pothole detected successfully'
        : 'No pothole detected in image',
      data: {
        issueId,
        ai_verified: result.isPothole,
        ai_confidence: result.confidence,
        ai_label: result.label,
        needs_review: !result.isPothole || result.confidence < 0.5,
        details: {
          topPrediction: result.topPrediction,
          topConfidence: result.topConfidence,
          rawPredictions: result.rawPredictions,
          analysis: result.analysis,
        },
      },
    });
  } catch (error) {
    console.error('❌ AI Verification error:', error.message);

    // Mark as needs_review on AI failure
    await issue.update({
      ai_verified: false,
      needs_review: true,
      ai_label: 'error',
    });

    res.status(500).json({
      success: false,
      message: 'AI verification failed',
      error: error.message,
    });
  }
});

/**
 * POST /api/ai/batch-verify
 * Batch verify multiple issues
 */
const batchVerifyPotholes = catchAsync(async (req, res) => {
  const { issueIds } = req.body;

  if (!Array.isArray(issueIds) || issueIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'issueIds array is required',
    });
  }

  console.log(`🤖 Batch AI Verification for ${issueIds.length} issues`);

  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (const issueId of issueIds) {
    try {
      const issue = await Issue.findByPk(issueId);

      if (!issue || !issue.photo_url) {
        results.push({
          issueId,
          success: false,
          message: 'Issue not found or has no photo',
        });
        failureCount++;
        continue;
      }

      const photoUrlParts = issue.photo_url.split('/');
      const filename = photoUrlParts[photoUrlParts.length - 1];
      const imagePath = path.join(__dirname, '../../uploads', filename);

      const result = await verifyPothole(imagePath);

      await issue.update({
        ai_verified: result.isPothole,
        ai_confidence: result.confidence,
        ai_label: result.label,
        needs_review: !result.isPothole || result.confidence < 0.5,
      });

      results.push({
        issueId,
        success: true,
        ai_verified: result.isPothole,
        ai_confidence: result.confidence,
        ai_label: result.label,
      });

      successCount++;
    } catch (error) {
      console.error(
        `❌ Verification failed for issue ${issueId}:`,
        error.message
      );

      results.push({
        issueId,
        success: false,
        message: error.message,
      });

      failureCount++;
    }
  }

  res.json({
    success: true,
    message: `Batch verification completed: ${successCount} success, ${failureCount} failed`,
    data: {
      total: issueIds.length,
      successCount,
      failureCount,
      results,
    },
  });
});

/**
 * GET /api/ai/model-info
 * Get information about the loaded AI model
 */
const getAIModelInfo = catchAsync(async (req, res) => {
  res.json({
    success: true,
    data: {
      model: 'YOLOv8',
      version: '8.0',
      framework: 'TensorFlow.js + ONNX Runtime',
      purpose: 'Real-time pothole/road damage detection',
      expectedAccuracy: '90-95%',
      speed: '100-200ms per image',
      status: 'Active',
    },
  });
});

/**
 * GET /api/ai/stats
 * Get AI verification statistics
 */
const getAIStats = catchAsync(async (req, res) => {
  const totalIssues = await Issue.count();
  const verifiedIssues = await Issue.count({
    where: { ai_verified: true },
  });
  const unverifiedIssues = await Issue.count({
    where: { ai_verified: false },
  });
  const pendingIssues = await Issue.count({
    where: { ai_verified: null },
  });
  const needsReview = await Issue.count({
    where: { needs_review: true },
  });

  res.json({
    success: true,
    data: {
      totalIssues,
      verifiedIssues,
      unverifiedIssues,
      pendingIssues,
      needsReview,
      verificationRate:
        totalIssues > 0
          ? ((verifiedIssues / totalIssues) * 100).toFixed(2) + '%'
          : '0%',
    },
  });
});

module.exports = {
  verifyPotholeImage,
  batchVerifyPotholes,
  getAIModelInfo,
  getAIStats,
};
