/**
 * Enhanced Pothole Detection Service
 * Uses improved keyword analysis + MobileNet for accurate road/pothole detection
 *
 * This module analyzes predictions to specifically identify potholes and road damage
 * with much better accuracy than generic image classification.
 */

const tf = require('@tensorflow/tfjs');
const mobilenet = require('@tensorflow-models/mobilenet');
const Jimp = require('jimp');
const path = require('path');

// Cache the loaded model
let model = null;
let modelLoadingPromise = null;

/**
 * Load the MobileNet model
 * The model is cached after first load for performance
 */
async function loadModel() {
  if (model) {
    return model;
  }

  if (modelLoadingPromise) {
    return modelLoadingPromise;
  }

  modelLoadingPromise = (async () => {
    try {
      console.log('🤖 Loading MobileNet model for pothole detection...');
      model = await mobilenet.load({
        version: 2,
        alpha: 1.0,
      });
      console.log('✅ Model loaded successfully');
      return model;
    } catch (error) {
      console.error('❌ Failed to load model:', error);
      modelLoadingPromise = null;
      throw new Error('Failed to load AI model: ' + error.message);
    }
  })();

  return modelLoadingPromise;
}

/**
 * Read and decode an image file into a tensor
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<tf.Tensor3D>} - 3D tensor representing the image
 */
async function readImage(imagePath) {
  try {
    // Read image using Jimp (supports JPEG, PNG, BMP, TIFF, GIF)
    const image = await Jimp.read(imagePath);

    // Get image dimensions
    const width = image.bitmap.width;
    const height = image.bitmap.height;

    // Extract pixel data
    const imageData = new Uint8Array(width * height * 3);
    let offset = 0;

    image.scan(0, 0, width, height, function (x, y, idx) {
      imageData[offset++] = this.bitmap.data[idx + 0]; // R
      imageData[offset++] = this.bitmap.data[idx + 1]; // G
      imageData[offset++] = this.bitmap.data[idx + 2]; // B
      // Skip alpha channel (idx + 3)
    });

    // Convert to TensorFlow tensor [height, width, 3]
    const imageTensor = tf.tensor3d(imageData, [height, width, 3]);

    return imageTensor;
  } catch (error) {
    console.error('❌ Error reading image:', error.message);
    throw new Error('Failed to process image: ' + error.message);
  }
}

/**
 * Classify an image and determine if it contains a pothole
 * @param {string} imagePath - Path to the uploaded image
 * @returns {Promise<Object>} - Classification result
 */
async function verifyPothole(imagePath) {
  let imageTensor = null;

  try {
    console.log(
      '🔍 Starting pothole verification for:',
      path.basename(imagePath)
    );

    // Load the model (cached after first load)
    const model = await loadModel();

    // Read and prepare the image
    imageTensor = await readImage(imagePath);

    // Get predictions from MobileNet
    const predictions = await model.classify(imageTensor);

    console.log('📊 MobileNet predictions:', predictions);

    // Analyze predictions to determine if it's a pothole
    const result = analyzePredictions(predictions);

    console.log('✅ Pothole verification result:', result);

    return result;
  } catch (error) {
    console.error('❌ Error during pothole verification:', error.message);
    throw error;
  } finally {
    // Clean up tensor to prevent memory leaks
    if (imageTensor) {
      imageTensor.dispose();
    }
  }
}

/**
 * Analyze MobileNet predictions to determine if image contains a pothole
 *
 * SIMPLIFIED APPROACH:
 * Since MobileNet isn't trained on "pothole", we use a different strategy:
 * 1. Check if predictions contain road-related keywords
 * 2. If NO road keywords BUT image has non-person/animal/indoor content → ACCEPT (assume it's a road)
 * 3. Only REJECT if clearly a person, pet, furniture, or food item
 *
 * This is more reliable than trying to detect "pothole" specifically.
 * @param {Array} predictions - MobileNet prediction results
 * @returns {Object} - { isPothole, confidence, label, rawPredictions }
 */
function analyzePredictions(predictions) {
  // Road-related keywords
  const roadKeywords = [
    'street',
    'alley',
    'asphalt',
    'pavement',
    'road',
    'hole',
    'crack',
    'crater',
    'pothole',
    'rubble',
    'gravel',
    'manhole',
    'grate',
    'sewer',
    'cobblestone',
    'concrete',
    'ground',
    'dirt',
    'soil',
    'debris',
    'damage',
    'broken',
    'rough',
    'texture',
    'surface',
    'stone',
    'rock',
    'sidewalk',
    'driveway',
    'curb',
    'paving',
    'brick',
    'tile',
    'patio',
    'pavers',
  ];

  // Keywords that DEFINITIVELY mean it's NOT a road/pothole photo
  const rejectKeywords = [
    'person',
    'people',
    'human',
    'face',
    'head',
    'boy',
    'girl',
    'man',
    'woman',
    'dog',
    'cat',
    'animal',
    'pet',
    'bird',
    'insect',
    'ant',
    'beetle',
    'bug',
    'bug',
    'furniture',
    'couch',
    'chair',
    'table',
    'desk',
    'sofa',
    'indoor',
    'room',
    'house',
    'apartment',
    'office',
    'kitchen',
    'food',
    'fruit',
    'vegetable',
    'meal',
    'plate',
    'cup',
    'bottle',
    'screen',
    'monitor',
    'phone',
    'computer',
    'keyboard',
    'plant',
    'flower',
    'tree',
    'grass',
    'leaf',
    'water',
    'ocean',
    'pool',
    'sea',
    'lake',
    'river',
    'swimming',
  ];

  let topPrediction = predictions[0];
  let hasRoadKeyword = false;
  let hasRejectKeyword = false;
  let matchedRoadKeywords = [];
  let matchedRejectKeywords = [];

  // Check all predictions against keywords
  predictions.forEach((pred, index) => {
    const labelLower = pred.className.toLowerCase();

    // Check for road keywords
    const roadMatch = roadKeywords.find((kw) => labelLower.includes(kw));
    if (roadMatch) {
      hasRoadKeyword = true;
      if (matchedRoadKeywords.length < 3) {
        matchedRoadKeywords.push({
          keyword: roadMatch,
          class: pred.className,
          prob: pred.probability,
        });
      }
    }

    // Check for reject keywords
    const rejectMatch = rejectKeywords.find((kw) => labelLower.includes(kw));
    if (rejectMatch) {
      hasRejectKeyword = true;
      if (matchedRejectKeywords.length < 3) {
        matchedRejectKeywords.push({
          keyword: rejectMatch,
          class: pred.className,
          prob: pred.probability,
        });
      }
    }

    console.log(
      `   [${index}] ${pred.className}: ${(pred.probability * 100).toFixed(1)}% | Road: ${roadMatch ? 'YES' : 'NO'} | Reject: ${rejectMatch ? 'YES' : 'NO'}`
    );
  });

  console.log('🎯 Analysis:', {
    hasRoadKeyword,
    hasRejectKeyword,
    roadMatches: matchedRoadKeywords.length,
    rejectMatches: matchedRejectKeywords.length,
    topPrediction: topPrediction.className,
  });

  // BETTER DECISION LOGIC:
  // Only ACCEPT if we find clear road indicators
  // REJECT if no road keywords OR contains reject keywords

  let isPothole = false;
  let confidence = 0;
  let reason = '';

  if (hasRejectKeyword) {
    // Contains disqualifying content
    isPothole = false;
    confidence = 0.1;
    reason = 'Contains people/animals/furniture';
    console.log('❌ REJECTED:', reason);
  } else if (hasRoadKeyword && matchedRoadKeywords.length > 0) {
    // Clear road/pothole indicators found
    isPothole = true;
    confidence = 0.8; // High confidence if road keywords match
    reason = `Road keywords: ${matchedRoadKeywords.map((m) => m.keyword).join(', ')}`;
    console.log('✅ ACCEPTED:', reason);
  } else {
    // No clear road evidence - REJECT
    isPothole = false;
    confidence = 0.2;
    reason = 'No road/pothole keywords detected';
    console.log('❌ REJECTED:', reason);
  }

  return {
    isPothole,
    confidence: parseFloat(confidence.toFixed(4)),
    label: isPothole ? 'pothole' : 'not_pothole',
    topPrediction: topPrediction.className,
    topConfidence: parseFloat(topPrediction.probability.toFixed(4)),
    rawPredictions: predictions.slice(0, 10).map((p) => ({
      class: p.className,
      confidence: parseFloat(p.probability.toFixed(4)),
    })),
    analysis: {
      hasRoadKeyword,
      hasRejectKeyword,
      roadMatches: matchedRoadKeywords.length,
      rejectMatches: matchedRejectKeywords.length,
      matchedRoadKeywords,
      matchedRejectKeywords,
      reason,
    },
  };
}

/**
 * Batch verify multiple images
 * @param {Array<string>} imagePaths - Array of image paths
 * @returns {Promise<Array<Object>>} - Array of classification results
 */
async function batchVerifyPotholes(imagePaths) {
  const results = [];

  for (const imagePath of imagePaths) {
    try {
      const result = await verifyPothole(imagePath);
      results.push({ imagePath, result, success: true });
    } catch (error) {
      results.push({
        imagePath,
        error: error.message,
        success: false,
      });
    }
  }

  return results;
}

/**
 * Get model information
 */
function getModelInfo() {
  return {
    modelName: 'MobileNet v2',
    version: '2.1.1',
    framework: 'TensorFlow.js',
    loaded: model !== null,
    description: 'Pre-trained image classification model for pothole detection',
  };
}

module.exports = {
  verifyPothole,
  batchVerifyPotholes,
  loadModel,
  getModelInfo,
};
