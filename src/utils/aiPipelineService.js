/**
 * AI Pipeline Service
 * Calls the Python ai_pipeline.py script that runs both:
 *   - pothole_model.keras  (detection)
 *   - severity_model.keras (severity classification)
 * Returns structured JSON result to the caller.
 */

const { exec } = require('child_process');
const path = require('path');
const logger = require('./logger');

// Project root — where ai_pipeline.py and the .keras files live
const PROJECT_ROOT = path.join(__dirname, '../../../');
const BACKEND_ROOT = path.join(__dirname, '../../');
const PIPELINE_SCRIPT = path.join(PROJECT_ROOT, 'ai_pipeline.py');
const TIMEOUT_MS = 60000; // 60 seconds

/** @type {{ success: boolean, is_pothole: boolean, severity: string, sla_days: number }} */
const AI_SAFE_DEFAULT = {
  success: false,
  is_pothole: true,
  detection_confidence: 0,
  severity: 'low',
  sla_days: 15,
  message: 'AI pipeline unavailable — using safe defaults',
};

/**
 * Run the AI pipeline for a given image.
 * Never throws — returns safe default on any failure.
 *
 * @param {string} imagePath  Absolute path to the uploaded image
 * @returns {Promise<{ success: boolean, is_pothole: boolean, detection_confidence: number,
 *                     severity: string, sla_days: number, message: string }>}
 */
async function runAIPipeline(imagePath) {
  return new Promise((resolve) => {
    // Wrap path in quotes to handle spaces
    const cmd = `python "${PIPELINE_SCRIPT}" "${imagePath}"`;

    const options = {
      cwd: BACKEND_ROOT,
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 1024, // 1 MB stdout buffer
    };

    logger.info(`[AI] Starting pipeline for: ${path.basename(imagePath)}`);

    exec(cmd, options, (error, stdout, stderr) => {
      if (error) {
        logger.error('[AI] Pipeline exec error', {
          message: error.message,
          stderr: stderr ? stderr.slice(0, 500) : '',
          killed: error.killed,
          code: error.code,
        });
        return resolve({ ...AI_SAFE_DEFAULT });
      }

      if (stderr && stderr.trim()) {
        // TensorFlow / Python warnings go to stderr — log at debug level, not error
        logger.debug('[AI] Python stderr (warnings):', stderr.slice(0, 300));
      }

      const raw = stdout ? stdout.trim() : '';
      if (!raw) {
        logger.error('[AI] Empty stdout from pipeline');
        return resolve({ ...AI_SAFE_DEFAULT });
      }

      // Extract the last JSON object from stdout
      // (Python may print TF loading messages before the JSON line)
      let jsonStr = null;
      const lines = raw.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{')) {
          jsonStr = line;
          break;
        }
      }

      if (!jsonStr) {
        logger.error('[AI] No JSON found in pipeline stdout', { raw: raw.slice(0, 300) });
        return resolve({ ...AI_SAFE_DEFAULT });
      }

      try {
        const result = JSON.parse(jsonStr);
        logger.info('[AI] Pipeline result', {
          is_pothole: result.is_pothole,
          severity: result.severity,
          sla_days: result.sla_days,
          confidence: result.detection_confidence,
        });
        return resolve(result);
      } catch (parseErr) {
        logger.error('[AI] JSON parse error', {
          error: parseErr.message,
          raw: jsonStr.slice(0, 200),
        });
        return resolve({ ...AI_SAFE_DEFAULT });
      }
    });
  });
}

module.exports = { runAIPipeline };
