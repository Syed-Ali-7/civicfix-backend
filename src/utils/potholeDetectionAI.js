/**
 * Advanced Pothole Detection using Custom Python Model
 * High accuracy pothole detection built from scratch
 */

const PythonModelBridge = require('./pythonModelBridge');
const path = require('path');

const pythonBridge = new PythonModelBridge(
  path.join(__dirname, '../../../ai/pothole_model.keras')
);

/**
 * Load trained pothole detection model
 * Try to load from: /backend/models/pothole-model/
 */
async function loadTrainedModel() {
  if (trainedModel) return trainedModel;

  try {
    const modelPath = path.join(
      __dirname,
      '../../models/pothole-model/model.json'
    );

    if (fs.existsSync(modelPath)) {
      console.log('🚀 Loading trained pothole model...');
      const model = await tf.loadLayersModel(`file://${modelPath}`);
      trainedModel = model;
      console.log('✅ Trained pothole model loaded successfully');
      return model;
    } else {
      console.log(
        'ℹ️  Trained model not found. Using feature-based detection.'
      );
      return null;
    }
  } catch (error) {
    console.error('⚠️  Failed to load trained model:', error.message);
    console.log('ℹ️  Falling back to feature-based detection');
    return null;
  }
}

/**
 * Main pothole detection function
 * Uses custom Python model for high accuracy
 */
async function verifyPothole(imagePath) {
  console.log('🔍 Running pothole detection...');

  try {
    // Check if Python model exists
    if (!pythonBridge.modelExists()) {
      console.log(
        '⚠️  Python model not found. Using feature-based detection instead.'
      );
      // Fallback to feature analysis if model doesn't exist yet
      const Jimp = require('jimp');
      const image = await Jimp.read(imagePath);
      return detectWithAdvancedAnalysis(image);
    }

    // Use Python model for prediction
    console.log('🐍 Using custom Python model for prediction...');
    const result = await pythonBridge.predictImage(imagePath);

    return {
      isPothole: result.isPothole,
      confidence: result.confidence,
      label: result.isPothole ? 'pothole' : 'not_pothole',
      reason: result.isPothole
        ? `Pothole detected (${result.percentage} confidence)`
        : `Not a pothole (${result.percentage} confidence)`,
      method: result.method,
    };
  } catch (error) {
    console.error('❌ Detection error:', error.message);
    console.log('⚠️  Falling back to feature-based detection...');

    try {
      const Jimp = require('jimp');
      const image = await Jimp.read(imagePath);
      return detectWithAdvancedAnalysis(image);
    } catch (fallbackError) {
      return {
        isPothole: false,
        confidence: 0.0,
        label: 'not_pothole',
        reason: 'Detection error: ' + error.message,
        method: 'error',
      };
    }
  }
}

/**
 * Preprocess image for CNN input
 * Resize to 224x224 and normalize
 */
function preprocessImage(image) {
  // Resize to 224x224
  image.resize(224, 224);

  // Convert Jimp bitmap to tensor properly
  const tensor = tf.tidy(() => {
    // Jimp bitmap.data is a Uint8Array in RGBA format
    const imageData = {
      data: image.bitmap.data,
      width: image.bitmap.width,
      height: image.bitmap.height,
    };

    // Create tensor from image data (RGBA)
    const imgTensor = tf.tensor4d(
      new Uint8ClampedArray(imageData.data),
      [imageData.height, imageData.width, 4],
      'int32'
    );

    // Extract RGB channels (drop alpha)
    const rgbTensor = imgTensor.slice([0, 0, 0], [-1, -1, 3]);

    // Dispose intermediate tensor
    imgTensor.dispose();

    // Normalize to [-1, 1] (MobileNetV2 expects this)
    const normalized = rgbTensor.div(tf.scalar(127.5)).sub(tf.scalar(1));

    // Add batch dimension
    return normalized.expandDims(0);
  });

  return tensor;
}

/**
 * Prediction with trained model
 */
async function predictWithTrainedModel(model, imageData) {
  try {
    const predictions = await model.predict(imageData);
    const scores = await predictions.data();
    const confidence = Math.min(1, Math.max(0, scores[0]));

    predictions.dispose();
    imageData.dispose();

    const isPothole = confidence > 0.45;

    console.log(
      `✅ Trained Model Prediction: ${isPothole ? 'POTHOLE' : 'NOT POTHOLE'} (confidence: ${(confidence * 100).toFixed(1)}%)`
    );

    return {
      isPothole,
      confidence: isPothole
        ? Math.min(0.95, confidence)
        : Math.max(0.05, 1 - confidence),
      label: isPothole ? 'pothole' : 'not_pothole',
      reason: isPothole
        ? `Pothole detected (${(confidence * 100).toFixed(1)}% confidence)`
        : 'Not a pothole',
      method: 'trained_cnn_model',
    };
  } catch (error) {
    console.error('❌ Trained model prediction failed:', error.message);
    imageData.dispose();
    throw error; // Re-throw to trigger fallback
  }
}

/**
 * Advanced rule-based detection (fallback)
 * Analyzes multiple features to detect potholes
 */
function detectWithAdvancedAnalysis(image) {
  const features = analyzeImageFeatures(image);

  console.log('📊 Feature Analysis:', {
    edgeIntensity: features.edgeIntensity.toFixed(3),
    darkSpotDensity: features.darkSpotDensity.toFixed(3),
    contrastVariance: features.contrastVariance.toFixed(3),
    circularPatterns: features.circularPatterns,
    textureComplexity: features.textureComplexity.toFixed(3),
  });

  // Decision logic: BALANCED STRICT MODE
  // Require strong indicators for pothole (reject plain roads, accept potholes)
  const hasDarkSpots = features.darkSpotDensity > 0.3; // 30% dark pixels
  const hasHighContrast = features.contrastVariance > 0.3; // 0.30+ contrast variance
  const hasEdges = features.edgeIntensity > 0.2; // 20% edge intensity
  const hasComplexTexture = features.textureComplexity > 0.4; // 40%+ texture complexity
  const hasCircularPatterns = features.circularPatterns > 2; // 2+ circular patterns

  // Count how many features are present
  let featureCount = 0;
  if (hasDarkSpots) featureCount++;
  if (hasHighContrast) featureCount++;
  if (hasEdges) featureCount++;
  if (hasComplexTexture) featureCount++;
  if (hasCircularPatterns) featureCount++;

  // Score: Average of activated features
  let score = 0;
  if (hasDarkSpots) score += features.darkSpotDensity * 0.35; // 35% weight
  if (hasHighContrast) score += features.contrastVariance * 0.3; // 30% weight
  if (hasEdges) score += features.edgeIntensity * 0.15; // 15% weight
  if (hasComplexTexture) score += features.textureComplexity * 0.12; // 12% weight
  if (hasCircularPatterns)
    score += Math.min(1, features.circularPatterns / 10) * 0.08; // 8% weight

  // REQUIRE AT LEAST 2+ features with decent score for pothole detection
  // Allows real potholes while filtering plain roads
  const isPothole =
    (featureCount >= 2 && score > 0.45) || (featureCount >= 3 && score > 0.35);
  const confidence = Math.min(1, Math.max(0, score));

  console.log(
    `✅ Analysis Result: ${isPothole ? 'POTHOLE' : 'NOT POTHOLE'} (score: ${(score * 100).toFixed(1)}%, features: ${featureCount}/5)`
  );

  return {
    isPothole,
    confidence: isPothole
      ? Math.min(0.95, confidence)
      : Math.max(0.05, 1 - confidence),
    label: isPothole ? 'pothole' : 'not_pothole',
    reason: isPothole
      ? `Pothole detected (${featureCount} features confirmed)`
      : `Not a pothole (${featureCount}/5 features)`,
    features: {
      edgeIntensity: features.edgeIntensity.toFixed(3),
      darkSpotDensity: features.darkSpotDensity.toFixed(3),
      contrastVariance: features.contrastVariance.toFixed(3),
      circularPatterns: features.circularPatterns,
      textureComplexity: features.textureComplexity.toFixed(3),
      finalScore: score.toFixed(3),
      featuresDetected: featureCount,
    },
    method: 'advanced_feature_analysis',
  };
}

/**
 * Analyze image features for pothole detection
 */
function analyzeImageFeatures(image) {
  const pixels = image.bitmap.data;
  const width = image.bitmap.width;
  const height = image.bitmap.height;

  // Feature 1: Edge intensity (Sobel edge detection)
  const edgeIntensity = calculateEdgeIntensity(pixels, width, height);

  // Feature 2: Dark spot density (areas significantly darker than surroundings)
  const darkSpotDensity = calculateDarkSpotDensity(pixels, width, height);

  // Feature 3: Contrast variance (variation in local contrast)
  const contrastVariance = calculateContrastVariance(pixels, width, height);

  // Feature 4: Circular patterns (potholes are often circular)
  const circularPatterns = detectCircularPatterns(pixels, width, height);

  // Feature 5: Texture complexity (detailed surface irregularities)
  const textureComplexity = calculateTextureComplexity(pixels, width, height);

  return {
    edgeIntensity,
    darkSpotDensity,
    contrastVariance,
    circularPatterns,
    textureComplexity,
  };
}

/**
 * Calculate edge intensity using Sobel operator
 */
function calculateEdgeIntensity(pixels, width, height) {
  let edgeSum = 0;
  let edgeCount = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x += 2) {
      const getGray = (px, py) => {
        const idx = (py * width + px) * 4;
        return (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
      };

      // Sobel X kernel
      const sobelX =
        -getGray(x - 1, y - 1) -
        2 * getGray(x - 1, y) -
        getGray(x - 1, y + 1) +
        getGray(x + 1, y - 1) +
        2 * getGray(x + 1, y) +
        getGray(x + 1, y + 1);

      // Sobel Y kernel
      const sobelY =
        -getGray(x - 1, y - 1) -
        2 * getGray(x, y - 1) -
        getGray(x + 1, y - 1) +
        getGray(x - 1, y + 1) +
        2 * getGray(x, y + 1) +
        getGray(x + 1, y + 1);

      const magnitude = Math.sqrt(sobelX * sobelX + sobelY * sobelY) / 255;
      edgeSum += magnitude;
      edgeCount++;
    }
  }

  return edgeCount > 0 ? Math.min(1, edgeSum / edgeCount) : 0;
}

/**
 * Calculate dark spot density
 */
function calculateDarkSpotDensity(pixels, width, height) {
  let darkSpots = 0;
  let totalPixels = 0;

  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 5000)));

  for (let i = 0; i < pixels.length; i += step * 4) {
    const gray = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    totalPixels++;

    // Detect both very dark (shadows) and moderately dark (damage)
    // Pothole areas are typically 30-100 in grayscale
    if (gray < 120) {
      darkSpots++;
    }
  }

  return totalPixels > 0 ? darkSpots / totalPixels : 0;
}

/**
 * Calculate local contrast variance
 */
function calculateContrastVariance(pixels, width, height) {
  let totalVariance = 0;
  let regionCount = 0;

  const regionSize = 32;

  for (let y = 0; y < height; y += regionSize) {
    for (let x = 0; x < width; x += regionSize) {
      const values = [];

      for (let dy = 0; dy < regionSize && y + dy < height; dy++) {
        for (let dx = 0; dx < regionSize && x + dx < width; dx++) {
          const idx = ((y + dy) * width + (x + dx)) * 4;
          const gray = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
          values.push(gray);
        }
      }

      if (values.length > 1) {
        const mean = values.reduce((a, b) => a + b) / values.length;
        const variance =
          values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
          values.length;
        totalVariance += variance;
        regionCount++;
      }
    }
  }

  return regionCount > 0
    ? Math.min(1, Math.sqrt(totalVariance / regionCount) / 128)
    : 0;
}

/**
 * Detect circular patterns (potholes tend to be circular)
 */
function detectCircularPatterns(pixels, width, height) {
  let circularCount = 0;

  const sampleSize = Math.min(width, height);
  const step = Math.max(1, Math.floor(sampleSize / 20));

  for (let radius = 10; radius < sampleSize / 3; radius += step) {
    for (let centerY = radius; centerY < height - radius; centerY += step * 2) {
      for (
        let centerX = radius;
        centerX < width - radius;
        centerX += step * 2
      ) {
        const edgePixels = [];

        // Sample pixels along circle perimeter
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
          const px = Math.round(centerX + radius * Math.cos(angle));
          const py = Math.round(centerY + radius * Math.sin(angle));

          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            const gray = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
            edgePixels.push(gray);
          }
        }

        // Check if edge pixels are darker (pothole edges)
        if (edgePixels.length >= 12) {
          const avgEdge =
            edgePixels.reduce((a, b) => a + b) / edgePixels.length;
          const centerGray = pixels[(centerY * width + centerX) * 4];

          if (avgEdge < centerGray - 20) {
            circularCount++;
          }
        }
      }
    }
  }

  return Math.min(20, circularCount / 5);
}

/**
 * Calculate texture complexity
 */
function calculateTextureComplexity(pixels, width, height) {
  let totalEntropy = 0;
  let regionCount = 0;

  const regionSize = 40;

  for (let y = 0; y < height; y += regionSize) {
    for (let x = 0; x < width; x += regionSize) {
      const histogram = new Array(16).fill(0);

      for (let dy = 0; dy < regionSize && y + dy < height; dy++) {
        for (let dx = 0; dx < regionSize && x + dx < width; dx++) {
          const idx = ((y + dy) * width + (x + dx)) * 4;
          const gray = Math.floor(
            (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3 / 16
          );
          histogram[Math.min(15, gray)]++;
        }
      }

      // Calculate entropy
      const regionSize2 = regionSize * regionSize;
      let entropy = 0;
      for (let i = 0; i < 16; i++) {
        if (histogram[i] > 0) {
          const p = histogram[i] / regionSize2;
          entropy -= p * Math.log2(p);
        }
      }

      totalEntropy += entropy;
      regionCount++;
    }
  }

  return regionCount > 0 ? totalEntropy / (regionCount * 4) : 0; // Normalize by max entropy
}

module.exports = {
  verifyPothole,
  trainModel: async (dataDir, epochs = 25) => {
    return await pythonBridge.trainModel(dataDir, epochs);
  },
  getModelInfo: () => pythonBridge.getModelInfo(),
  modelExists: () => pythonBridge.modelExists(),
};
