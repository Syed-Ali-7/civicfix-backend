const { validationResult } = require('express-validator');
const { Issue, statuses } = require('../models');
const { reverseGeocode } = require('../utils/geocoding');
const path = require('path');

// EXIF + geo distance validation
// We use exiftool to read EXIF metadata from uploaded images (if present)
// and geolib to compute distance between EXIF GPS and device GPS.
const { ExifTool } = require('exiftool-vendored');
const exiftool = new ExifTool({ taskTimeoutMillis: 5000 });
const { getDistance } = require('geolib');

const createIssue = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, latitude, longitude, status } = req.body;

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
      console.log('File uploaded:', { filename: req.file.filename, photoUrl });
    } else if (req.body.photo_url) {
      // Fallback to photo_url if provided (for backward compatibility)
      photoUrl = req.body.photo_url;
    }
    console.log('photoUrl final:', photoUrl);

    // Flag to mark issues that require manual review (e.g. when EXIF GPS is missing)
    let needs_review = false;

    // If user provided a remote photo URL (no uploaded file), we won't have EXIF data.
    // Mark this for manual review so admins can validate the report.
    if (!req.file && req.body.photo_url) {
      needs_review = true;
    }

    // Reverse geocode coordinates to get address
    let address = null;
    try {
      if (latitude && longitude) {
        address = await reverseGeocode(latitude, longitude);
      }
    } catch (geocodeError) {
      // Set a user-friendly message instead of leaving address null
      address = 'Address lookup pending';
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

        // More lenient EXIF validation - check for any common field
        const hasExif =
          exif &&
          (exif.Make ||
            exif.Model ||
            exif.Software ||
            gpsFields.length > 0 ||
            exif.DateTimeOriginal ||
            exif.CreateDate ||
            exif.ModifyDate);

        if (!hasExif) {
          return res.status(400).json({
            message:
              'The image lacks required metadata. Please capture a new photo with your device camera.',
          });
        }

        // Try multiple date fields and formats
        const possibleDates = [
          exif.DateTimeOriginal,
          exif.CreateDate,
          exif.ModifyDate,
          exif.DateTime,
          exif.FileModifyDate,
          exif.FileCreateDate,
        ].filter(Boolean);

        if (possibleDates.length === 0) {
          needs_review = true;
        } else {
          // Try to parse the most recent date
          const dates = possibleDates
            .map((dateStr) => {
              try {
                // Handle various date formats
                const normalized = String(dateStr)
                  .replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
                  .replace(
                    /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/,
                    '$1-$2-$3T$4:$5:$6'
                  );
                return new Date(normalized);
              } catch (e) {
                return null;
              }
            })
            .filter((d) => d && !isNaN(d.getTime()));

          if (dates.length > 0) {
            const mostRecent = new Date(
              Math.max(...dates.map((d) => d.getTime()))
            );
            const ageMs = Date.now() - mostRecent.getTime();
            const maxAgeMs = 48 * 60 * 60 * 1000; // 48 hours

            if (ageMs > maxAgeMs) {
              return res.status(400).json({
                message:
                  'Photo is older than 48 hours. Please take a new photo.',
              });
            }
          }
        }

        // More flexible GPS extraction
        let exifLat = null;
        let exifLon = null;
        let gpsRef = { lat: 'N', lon: 'E' };

        // Try different GPS field combinations
        if (exif.GPSLatitude !== undefined && exif.GPSLongitude !== undefined) {
          exifLat = exif.GPSLatitude;
          exifLon = exif.GPSLongitude;
          gpsRef.lat = exif.GPSLatitudeRef || 'N';
          gpsRef.lon = exif.GPSLongitudeRef || 'E';
        } else if (exif.GPSPosition) {
          // Some devices store GPS as a single string
          const [lat, lon] = exif.GPSPosition.split(' ').map(Number);
          exifLat = lat;
          exifLon = lon;
        }

        // Process GPS data if available
        if (exifLat !== null && exifLon !== null) {
          let exifLatNum = Number(exifLat);
          let exifLonNum = Number(exifLon);

          // Apply the reference (N/S, E/W)
          if (gpsRef.lat === 'S') exifLatNum *= -1;
          if (gpsRef.lon === 'W') exifLonNum *= -1;

          const deviceLatNum = parseFloat(latitude);
          const deviceLonNum = parseFloat(longitude);

          if (
            !Number.isNaN(exifLatNum) &&
            !Number.isNaN(exifLonNum) &&
            !Number.isNaN(deviceLatNum) &&
            !Number.isNaN(deviceLonNum)
          ) {
            const distanceMeters = getDistance(
              { latitude: exifLatNum, longitude: exifLonNum },
              { latitude: deviceLatNum, longitude: deviceLonNum }
            );

            // More lenient distance check for testing
            if (distanceMeters > 1000) {
              // Temporarily increased from 200m to 1km
              return res.status(400).json({
                message:
                  `Photo location (${exifLatNum.toFixed(6)}, ${exifLonNum.toFixed(6)}) ` +
                  `is too far from reported location (${deviceLatNum.toFixed(6)}, ${deviceLonNum.toFixed(6)}). ` +
                  `Distance: ${distanceMeters}m`,
              });
            }
          } else {
            needs_review = true;
          }
        } else {
          needs_review = true;
        }
      } catch (exifErr) {
        // For robustness, mark for manual review instead of hard rejecting
        needs_review = true;
      }
    }

    const issue = await Issue.create({
      title,
      description,
      photo_url: photoUrl,
      latitude,
      longitude,
      address,
      status,
      needs_review,
    });
    return res.status(201).json(issue);
  } catch (error) {
    return next(error);
  }
};

const getIssues = async (req, res, next) => {
  try {
    const issues = await Issue.findAll({ order: [['created_at', 'DESC']] });
    return res.json(issues);
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

    const issue = await Issue.findByPk(req.params.id);
    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
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

    await issue.update(updates);
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

module.exports = {
  createIssue,
  getIssues,
  getIssueById,
  updateIssue,
  deleteIssue,
};
