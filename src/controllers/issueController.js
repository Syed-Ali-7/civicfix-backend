const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Issue, User, statuses } = require('../models');
const { reverseGeocode } = require('../utils/geocoding');
const { computePHash, findSimilarImages } = require('../utils/phash');
const { runAIPipeline } = require('../utils/aiPipelineService');
const { calculateDistanceMeters } = require('../utils/distance');
const logger = require('../utils/logger');
const { sendPushNotification } = require('../utils/notificationService');
const { sendEscalationEmail } = require('../services/emailService');
const path = require('path');
const fs = require('fs');

const LEVEL_1_OFFICER_EMAIL = 'officer1@example.com';
const LEVEL_2_OFFICER_EMAIL = 'officer3@example.com';

// EXIF + geo distance validation
// We use exiftool to read EXIF metadata from uploaded images (if present)
// and geolib to compute distance between EXIF GPS and device GPS.
const { ExifTool } = require('exiftool-vendored');
const exiftool = new ExifTool({ taskTimeoutMillis: 5000 });
const { getDistance } = require('geolib');

const enrichIssue = (issueLike) => {
  const data =
    typeof issueLike.toJSON === 'function' ? issueLike.toJSON() : issueLike;
  const now = new Date();

  if (data.sla_deadline) {
    const deadline = new Date(data.sla_deadline);
    const diffMs = deadline - now;
    data.time_remaining_hours = Math.round(diffMs / (1000 * 60 * 60));
    data.is_overdue = diffMs < 0 && data.status !== 'Resolved';
  } else {
    data.time_remaining_hours = null;
    data.is_overdue = false;
  }

  data.assigned_to_name = data.assignedOfficer?.name || null;
  return data;
};

const createIssue = async (req, res, next) => {
  try {
    logger.request('POST', '/api/issues', {
      hasFile: !!req.file,
      bodyKeys: Object.keys(req.body),
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, latitude, longitude, status } = req.body;

    // Convert latitude and longitude to numbers if they're strings
    let lat = parseFloat(latitude);
    let lon = parseFloat(longitude);

    // Validate location coordinates
    if (
      isNaN(lat) ||
      isNaN(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return res.status(400).json({
        message: `Invalid location coordinates. Latitude: ${lat}, Longitude: ${lon}`,
      });
    }

    // Handle file upload - get photo URL from uploaded file
    let photoUrl = null;
    if (req.file) {
      // Construct full URL to the uploaded image.
      // If API_HOST is set (e.g., for mobile/tunnel access), use it so the app
      // always gets a consistent, reachable URL. Otherwise fall back to req.host.
      let host = req.get('host');
      if (process.env.API_HOST) {
        host = process.env.API_HOST;
      }
      const protocol =
        process.env.API_PROTOCOL ||
        req.protocol ||
        req.headers['x-forwarded-proto'] ||
        'http';
      photoUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    } else if (req.body.photo_url) {
      // Fallback to photo_url if provided (for backward compatibility)
      photoUrl = req.body.photo_url;
    }

    // Flag to mark issues that require manual review (e.g. when EXIF GPS is missing)
    let needs_review = false;

    // If user provided a remote photo URL (no uploaded file), we won't have EXIF data.
    // Mark this for manual review so admins can validate the report.
    if (!req.file && req.body.photo_url) {
      needs_review = true;
    }

    // AI PIPELINE INTEGRATION — runs after EXIF + pHash checks (see below)
    // Fields set by the pipeline; initialise safe defaults here
    let ai_verified = null;
    let ai_confidence = null;
    let ai_label = null;
    let severity = 'low';
    let sla_deadline = null;
    let ai_message = null;

    // Reverse geocode coordinates to get address
    let address = null;
    try {
      if (latitude && longitude) {
        address = await reverseGeocode(latitude, longitude);
      }
    } catch (geocodeError) {
      // Even if geocoding fails, we have the coordinates
      // The geocoding function already returns a fallback, but handle errors here
      console.warn('⚠️  Geocoding error:', geocodeError.message);
      address = null; // Will be set by reverseGeocode function
    }
    if (req.file) {
      const uploadedPath =
        req.file.path ||
        path.join(__dirname, '../../uploads', req.file.filename);

      try {
        // Read EXIF metadata from the uploaded file
        const exif = await exiftool.read(uploadedPath);

        // Look for various forms of GPS data
        const gpsFields = Object.keys(exif).filter((key) =>
          key.startsWith('GPS')
        );

        // EXIF VALIDATION
        // Accept camera photos (with Make/Model) or gallery photos (without Make/Model)
        // 1. REJECT if no EXIF data or only has minimal/generic fields
        // Check for meaningful EXIF data - at least one of: Make/Model (camera), DateTimeOriginal, GPS
        const hasMakeOrModel = !!(exif.Make || exif.Model);
        const hasDateTimeOriginal = !!exif.DateTimeOriginal;
        const hasGPS = gpsFields.length > 0;
        const hasSignificantExif =
          hasMakeOrModel || hasDateTimeOriginal || hasGPS;

        if (!exif || Object.keys(exif).length === 0 || !hasSignificantExif) {
          return res.status(400).json({
            message:
              'Photo has no camera metadata. Please capture a new photo directly with your device camera or select from your device photo which has accurate location information.',
          });
        }

        // ========== DATE VALIDATION ==========
        // Try to get photo date from DateTimeOriginal (camera photos) or file date (gallery)
        let photoDate = null;
        if (exif.DateTimeOriginal) {
          try {
            const normalized = String(exif.DateTimeOriginal)
              .replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
              .replace(
                /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/,
                '$1-$2-$3T$4:$5:$6'
              );
            const parsed = new Date(normalized);
            if (!isNaN(parsed.getTime())) {
              photoDate = parsed;
            }
          } catch (e) {
            // Fall through to FileModifyDate
          }
        }

        // If no DateTimeOriginal, try FileModifyDate (for gallery photos)
        if (!photoDate && exif.FileModifyDate) {
          try {
            const normalized = String(exif.FileModifyDate)
              .replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
              .replace(
                /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/,
                '$1-$2-$3T$4:$5:$6'
              );
            const parsed = new Date(normalized);
            if (!isNaN(parsed.getTime())) {
              photoDate = parsed;
            }
          } catch (e) {
            // Fall through
          }
        }

        // 2. REJECT if no valid date can be found
        if (!photoDate) {
          return res.status(400).json({
            message:
              'Photo has no date metadata. Please capture a new photo or select one with date information.',
          });
        }

        const ageMs = Date.now() - photoDate.getTime();
        const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours for both camera and gallery

        // 3. REJECT if older than 24 hours
        if (ageMs > maxAgeMs) {
          return res.status(400).json({
            message:
              'Photo is older than 24 hours. Please capture a fresh photo or select a recent one.',
          });
        }

        // ========== GPS VALIDATION ==========
        let exifLat = null;
        let exifLon = null;
        let gpsRef = { lat: 'N', lon: 'E' };
        let hasRealEmbeddedGPS = false; // True only if photo has actual GPS coordinates

        // Try multiple ways to extract GPS from EXIF
        // Method 1: Direct GPS fields (usually works for camera photos)
        if (
          exif.GPSLatitude !== undefined &&
          exif.GPSLongitude !== undefined &&
          !isNaN(exif.GPSLatitude) &&
          !isNaN(exif.GPSLongitude)
        ) {
          exifLat = exif.GPSLatitude;
          exifLon = exif.GPSLongitude;
          gpsRef.lat = exif.GPSLatitudeRef || 'N';
          gpsRef.lon = exif.GPSLongitudeRef || 'E';
          hasRealEmbeddedGPS = true; // This is real GPS data
        }
        // Method 2: GPSPosition string (sometimes used)
        else if (exif.GPSPosition && typeof exif.GPSPosition === 'string') {
          const coords = exif.GPSPosition.split(' ').map(Number);
          if (coords.length >= 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            exifLat = coords[0];
            exifLon = coords[1];
            hasRealEmbeddedGPS = true; // This is real GPS data
          }
        }
        // Method 3: Gallery photos without GPS - use device location
        else {
          exifLat = lat;
          exifLon = lon;
          hasRealEmbeddedGPS = false; // Using device location as fallback
        }

        const deviceLatNum = lat;
        const deviceLonNum = lon;

        // 4. If no EXIF GPS at all, use device location (for gallery photos)
        // This was already handled above in Method 3

        // Handle GPS coordinate formats (can be array or string or number)
        let exifLatNum = null;
        let exifLonNum = null;

        if (Array.isArray(exifLat)) {
          // GPS format: [degrees, minutes, seconds]
          exifLatNum = exifLat[0] + exifLat[1] / 60 + exifLat[2] / 3600;
        } else {
          exifLatNum = Number(exifLat);
        }

        if (Array.isArray(exifLon)) {
          // GPS format: [degrees, minutes, seconds]
          exifLonNum = exifLon[0] + exifLon[1] / 60 + exifLon[2] / 3600;
        } else {
          exifLonNum = Number(exifLon);
        }

        // Apply GPS reference directions (N/S, E/W)
        if (gpsRef.lat === 'S') exifLatNum *= -1;
        if (gpsRef.lon === 'W') exifLonNum *= -1;

        // 5. REJECT if GPS coordinates are invalid
        if (
          isNaN(exifLatNum) ||
          isNaN(exifLonNum) ||
          isNaN(deviceLatNum) ||
          isNaN(deviceLonNum)
        ) {
          return res.status(400).json({
            message:
              'Location coordinates are invalid. Please try again with valid coordinates.',
          });
        }

        const distanceMeters = getDistance(
          { latitude: exifLatNum, longitude: exifLonNum },
          { latitude: deviceLatNum, longitude: deviceLonNum }
        );

        // 6. REJECT if photo location is more than 200m from device location
        // BUT: Only check if we have ACTUAL embedded GPS from the photo itself
        // If photo came from gallery without GPS, we trust the device location instead
        if (distanceMeters > 200 && hasRealEmbeddedGPS) {
          return res.status(400).json({
            message:
              `Photo was taken ${distanceMeters.toFixed(0)}m away from reported location. ` +
              `Photo GPS: (${exifLatNum.toFixed(6)}, ${exifLonNum.toFixed(6)}), ` +
              `Reported: (${deviceLatNum.toFixed(6)}, ${deviceLonNum.toFixed(6)}). ` +
              `Please use a photo taken at the exact location of the issue.`,
          });
        }
      } catch (exifErr) {
        console.error('⚠️  EXIF read error:', exifErr.message);
        return res.status(400).json({
          message:
            'Unable to read photo metadata. Please capture a new photo with your device camera.',
        });
      }
    }

    // ==================== pHash DUPLICATE DETECTION ====================
    // Compute pHash for the uploaded image and check for duplicates
    let phash = null;
    if (req.file) {
      try {
        const uploadedPath =
          req.file.path ||
          path.join(__dirname, '../../uploads', req.file.filename);

        phash = await computePHash(uploadedPath);

        // Fetch all existing pHashes from the database
        const existingIssues = await Issue.findAll({
          attributes: ['id', 'phash'],
          where: { phash: { [Op.ne]: null } },
        });

        // Find similar images (>= 85% similarity)
        // 85% = ~10 bits different out of 64, allows for minor cropping/compression
        const SIMILARITY_THRESHOLD = 80;
        const similarImages = findSimilarImages(
          phash,
          existingIssues,
          SIMILARITY_THRESHOLD
        );

        if (similarImages.length > 0) {
          const duplicateInfo = similarImages.map((img) => ({
            issueId: img.id,
            similarity: img.similarity.toFixed(1),
          }));

          // REJECT duplicate images - don't allow the upload
          return res.status(400).json({
            message:
              '❌ This image appears to be a duplicate of an existing report. ' +
              'Please check if this pothole has already been reported.',
            duplicateInfo: duplicateInfo,
            action:
              'Please upload a different photo or check existing reports before submitting.',
          });
        }
      } catch (phashErr) {
        // If pHash computation fails, log but don't block the upload
        console.warn('⚠️  pHash computation failed:', phashErr.message);
        // We don't set needs_review here - let EXIF validation handle it
      }
    }

    // ==================== AI PIPELINE INTEGRATION ====================
    // Run the Python AI pipeline (pothole detection + severity) AFTER all
    // validation checks, so we only pay the cost for valid, non-duplicate images.
    if (req.file) {
      const uploadedPath =
        req.file.path ||
        path.join(__dirname, '../../uploads', req.file.filename);

      // AI PIPELINE INTEGRATION — Step A: get absolute image path
      const absoluteImagePath = path.resolve(uploadedPath);

      // AI PIPELINE INTEGRATION — Step B: call pipeline
      const aiResult = await runAIPipeline(absoluteImagePath);

      // AI PIPELINE INTEGRATION — Step C: reject non-potholes
      if (aiResult.success && aiResult.is_pothole === false) {
        try {
          await fs.promises.unlink(absoluteImagePath);
        } catch (_) { /* ignore deletion errors */ }
        return res.status(400).json({
          success: false,
          message: 'Submitted image does not appear to contain a pothole.',
        });
      }

      // AI PIPELINE INTEGRATION — Step D: is_pothole true, save severity + deadline
      if (aiResult.is_pothole !== false) {
        ai_verified = true;
        ai_confidence = aiResult.detection_confidence || null;
        ai_label = 'pothole';
        severity = aiResult.severity || 'low';
        ai_message =
          aiResult.message ||
          (severity === 'high'
            ? 'High severity pothole — SLA: 7 days'
            : 'Low severity pothole — SLA: 15 days');

        const sla_days = aiResult.sla_days || 15;
        sla_deadline = new Date();
        sla_deadline.setDate(sla_deadline.getDate() + sla_days);
      }

      // AI PIPELINE INTEGRATION — Step E: pipeline failure fallback
      if (!aiResult.success) {
        logger.info('[AI] Pipeline unavailable — using defaults');
        ai_verified = true;
        severity = 'low';
        ai_message = 'AI pipeline unavailable — using defaults';
        sla_deadline = new Date();
        sla_deadline.setDate(sla_deadline.getDate() + 15);
      }
    } else {
      // No file uploaded — set default SLA
      severity = 'low';
      ai_message = 'No image uploaded — default SLA applied';
      sla_deadline = new Date();
      sla_deadline.setDate(sla_deadline.getDate() + 15);
    }
    // =================================================================

    const issue = await Issue.create({
      title,
      description,
      photo_url: photoUrl,
      latitude,
      longitude,
      address,
      status,
      reporter_id: req.user?.userId || null,
      needs_review: false, // Only valid potholes reach here
      phash,
      ai_verified: ai_verified !== null ? ai_verified : true,
      ai_confidence: ai_confidence,
      ai_label: ai_label || 'pothole',
      // SLA TRACKER: persist AI-determined severity + deadline
      severity,
      sla_deadline,
    });

    // ESCALATION SYSTEM: assign freshly created issue to level 1 officer
    const level1Officer = await User.findOne({
      where: { email: LEVEL_1_OFFICER_EMAIL },
    });

    if (level1Officer) {
      await issue.update({
        assigned_to: level1Officer.id,
        escalation_level: 1,
        escalation_label: 'Level 1',
      });
      const refreshed = await Issue.findByPk(issue.id);
      console.log('[VERIFY] assigned_to in DB:', refreshed.assigned_to);
      console.log(
        `[ASSIGN] Issue #${issue.id} assigned to Level 1 ${level1Officer.name}`
      );
    } else {
      console.log('[ASSIGN] No level 1 officer found');
    }
    
    logger.success('Issue created', { id: issue.id, severity, sla_deadline });
    return res.status(201).json({
      ...issue.toJSON(),
      // AI PIPELINE INTEGRATION: return AI fields in response
      severity,
      sla_deadline,
      ai_message,
    });
  } catch (error) {
    logger.error('CREATE ISSUE ERROR', {
      message: error.message,
      stack: error.stack,
    });
    return next(error);
  }
};

const getIssues = async (req, res, next) => {
  try {
    const include = [
      {
        model: User,
        as: 'assignedOfficer',
        attributes: ['id', 'name', 'email', 'designation'],
        required: false,
      },
    ];

    // Keep citizen/mobile feed behavior when no authenticated user is present.
    if (!req.user) {
      const publicIssues = await Issue.findAll({
        include,
        order: [['created_at', 'DESC']],
      });
      return res.json(publicIssues.map(enrichIssue));
    }

    const role = req.user.role;
    const designation = req.user.designation;
    const userId = req.user.userId;
    const userEmail = (req.user.email || '').toLowerCase();

    if (role === 'citizen' || !designation) {
      const allIssues = await Issue.findAll({
        include,
        order: [['created_at', 'DESC']],
      });
      return res.json(allIssues.map(enrichIssue));
    }

    // ESCALATION SYSTEM: designation-based issue visibility
    const where = {};

    if (userEmail === LEVEL_1_OFFICER_EMAIL) {
      where.escalation_level = 1;
      where.assigned_to = userId;
    } else if (userEmail === LEVEL_2_OFFICER_EMAIL) {
      where.escalation_level = { [Op.in]: [1, 2] };
    } else if (designation !== 'supervisor' && role !== 'admin') {
      return res.status(403).json({
        message: 'Forbidden: invalid designation for dashboard access',
      });
    }

    const issues = await Issue.findAll({
      where,
      include,
      order: [['created_at', 'DESC']],
    });

    const enriched = issues.map(enrichIssue);

    if (designation === 'supervisor' || role === 'admin' || userEmail === LEVEL_2_OFFICER_EMAIL) {
      return res.json({
        issues: enriched,
        level_1_count: enriched.filter((i) => i.escalation_level === 1).length,
        level_2_count: enriched.filter((i) => i.escalation_level === 2).length,
      });
    }

    return res.json(enriched);
  } catch (error) {
    return next(error);
  }
};

const getIssueById = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const issue = await Issue.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'assignedOfficer',
          attributes: ['id', 'name', 'email', 'designation'],
          required: false,
        },
      ],
    });
    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    return res.json(enrichIssue(issue));
  } catch (error) {
    return next(error);
  }
};

const updateIssueStatus = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status } = req.body || {};
    const issue = await Issue.findByPk(id);

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    if (!statuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status provided' });
    }

    const updates = { status };
    if (status === 'Resolved' && !issue.resolved_at) {
      updates.resolved_at = new Date();
    }

    const shouldNotifyResolved =
      updates.status === 'Resolved' && issue.status !== 'Resolved';
    const shouldEmailEscalated =
      updates.status === 'Escalated' && issue.status !== 'Escalated';

    await issue.update(updates);

    if (shouldNotifyResolved) {
      // EXPO PUSH NOTIFICATIONS
      // Token saved per device per user
      // Notifications fire on: Escalated, Resolved only
      // Never fire for: Open status changes
      try {
        const reporter = issue.reporter_id
          ? await User.findByPk(issue.reporter_id)
          : null;
        await sendPushNotification(
          reporter?.push_token,
          'Issue Resolved',
          'Your pothole report has been resolved. Please confirm if the issue is fixed.',
          { issueId: issue.id, screen: 'IssueDetail' }
        );
      } catch (notifyError) {
        logger.warn('[ISSUE] Resolved notification failed', {
          message: notifyError.message,
        });
      }
    }

    if (shouldEmailEscalated) {
      logger.info('[ISSUE] Manual escalation detected, sending email', {
        issueId: issue.id,
        status: updates.status,
      });
      try {
        const supervisor = await User.findOne({
          where: { designation: 'supervisor' },
        });
        await sendEscalationEmail(issue, supervisor);
      } catch (emailError) {
        logger.warn('[ISSUE] Escalation email failed', {
          message: emailError.message,
        });
      }
    }
    return res.json(issue);
  } catch (error) {
    return next(error);
  }
};

const updateIssue = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    // Only enforce validation errors if there's no file upload.
    // When uploading a file, we skip strict field validation since
    // multipart form fields may not serialize the same way as JSON.
    if (!errors.isEmpty() && !req.file) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const issue = await Issue.findByPk(id);

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    // req.body may be undefined when the request is multipart/form-data
    // (for example when uploading a file only). Safely default to an
    // empty object so destructuring doesn't throw.
    const body = req.body || {};
    let { title, description, photo_url, latitude, longitude, status } = body;

    // When status is sent as a multipart form field, it may be a string.
    // Ensure we're comparing against the correct value.
    if (typeof status === 'string') {
      status = status.trim();
    }

    // Build updates from provided fields
    const updates = {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(photo_url !== undefined && { photo_url }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(status !== undefined && { status }),
    };

    // If a file was uploaded (multipart request), construct the public URL
    // and include it in the updates. This keeps the update logic compatible
    // with both JSON and multipart/form-data requests.
    if (req.file) {
      let host = req.get('host');
      if (process.env.API_HOST) {
        host = process.env.API_HOST;
      }
      const protocol =
        process.env.API_PROTOCOL ||
        req.protocol ||
        req.headers['x-forwarded-proto'] ||
        'http';
      const uploadedUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

      // Determine if this should be stored as a resolved photo.
      // Check: (1) if status is being set to Resolved in this request,
      // or (2) if the issue is already Resolved in the database.
      const statusToCheck = status || issue.status;
      const willBeResolved = statusToCheck === 'Resolved';

      if (willBeResolved) {
        updates.resolved_photo_url = uploadedUrl;
      } else {
        updates.photo_url = uploadedUrl;
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: 'No updates provided' });
    }

    if (updates.status && !statuses.includes(updates.status)) {
      return res.status(400).json({ message: 'Invalid status provided' });
    }

    // SLA TRACKER: Track resolution timestamp when issue is resolved
    if (updates.status === 'Resolved' && !issue.resolved_at) {
      updates.resolved_at = new Date();
    }

    const shouldNotifyResolved =
      updates.status === 'Resolved' && issue.status !== 'Resolved';

    await issue.update(updates);

    if (shouldNotifyResolved) {
      // EXPO PUSH NOTIFICATIONS
      // Token saved per device per user
      // Notifications fire on: Escalated, Resolved only
      // Never fire for: Open status changes
      try {
        const reporter = issue.reporter_id
          ? await User.findByPk(issue.reporter_id)
          : null;
        await sendPushNotification(
          reporter?.push_token,
          'Issue Resolved',
          'Your pothole report has been resolved. Please confirm if the issue is fixed.',
          { issueId: issue.id, screen: 'IssueDetail' }
        );
      } catch (notifyError) {
        logger.warn('[ISSUE] Resolved notification failed', {
          message: notifyError.message,
        });
      }
    }
    return res.json(issue);
  } catch (error) {
    return next(error);
  }
};

const deleteIssue = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // SUPERVISOR DELETE: only supervisor designation can delete issues
    if (req.user.designation !== 'supervisor') {
      return res.status(403).json({
        message: 'Only supervisors can delete issues',
      });
    }

    const { id } = req.params;
    const deleted = await Issue.destroy({ where: { id } });

    if (!deleted) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
};

/**
 * AI PIPELINE INTEGRATION — Protected test route
 * POST /api/issues/test-ai  (admin only, dev use)
 * Body: { imagePath: "/absolute/path/to/image.jpg" }
 */
const testAIPipeline = async (req, res, next) => {
  try {
    const body = req.body || {};
    let { imagePath } = body;

    // AI PIPELINE INTEGRATION: fallback sample image for development testing
    if (!imagePath) {
      const uploadsDir = path.join(__dirname, '../../uploads');
      const files = await fs.promises.readdir(uploadsDir);
      const sample = files.find((f) => /\.(jpg|jpeg|png|bmp)$/i.test(f));
      if (!sample) {
        return res.status(404).json({
          message:
            'No sample image found in backend/uploads. Pass imagePath in request body.',
        });
      }
      imagePath = path.join(uploadsDir, sample);
    }

    const result = await runAIPipeline(path.resolve(imagePath));
    return res.json({ imagePath, result });
  } catch (error) {
    return next(error);
  }
};

const submitIssueFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, latitude, longitude } = req.body || {};
    const feedbackFile =
      req.file ||
      req.files?.image?.[0] ||
      req.files?.photo?.[0] ||
      null;

    const issue = await Issue.findByPk(id);
    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    if (status === 'confirmed') {
      await issue.update({
        status: 'Closed',
        confirmed_at: new Date(),
      });

      return res.json({
        success: true,
        message: 'Thank you for confirming. Issue is now closed.',
        issue,
      });
    }

    if (status !== 'rejected') {
      return res.status(400).json({
        message: 'Invalid feedback status. Use confirmed or rejected.',
      });
    }

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);
    if (isNaN(userLat) || isNaN(userLon)) {
      return res.status(400).json({
        message: 'Valid latitude and longitude are required for rejection.',
      });
    }

    const distanceMeters = calculateDistanceMeters(
      { latitude: issue.latitude, longitude: issue.longitude },
      { latitude: userLat, longitude: userLon }
    );

    if (distanceMeters > 100) {
      return res.status(400).json({
        message: 'You must be near the issue location',
      });
    }

    if (!feedbackFile) {
      return res.status(400).json({
        message: 'Please upload a new photo for rejection feedback.',
      });
    }

    const level2Officer = await User.findOne({
      where: { email: LEVEL_2_OFFICER_EMAIL },
    });

    if (!level2Officer) {
      return res.status(404).json({ message: 'No level 2 officer found' });
    }

    let host = req.get('host');
    if (process.env.API_HOST) {
      host = process.env.API_HOST;
    }
    const protocol =
      process.env.API_PROTOCOL ||
      req.protocol ||
      req.headers['x-forwarded-proto'] ||
      'http';
    const rejectionPhotoUrl = `${protocol}://${host}/uploads/${feedbackFile.filename}`;

    const now = new Date();
    const newDeadline = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    await issue.update({
      status: 'Reopened',
      reopen_count: Number(issue.reopen_count || 0) + 1,
      rejection_photo_url: rejectionPhotoUrl,
      rejected_at: now,
      escalation_level: 2,
      escalation_label: 'Level 2',
      assigned_to: level2Officer.id,
      escalated: true,
      escalated_at: now,
      sla_deadline: newDeadline,
    });

    return res.json({
      success: true,
      message: 'Issue reopened and escalated to Level 2.',
      issue,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createIssue,
  getIssues,
  getIssueById,
  updateIssueStatus,
  updateIssue,
  deleteIssue,
  testAIPipeline,
  submitIssueFeedback,
};
