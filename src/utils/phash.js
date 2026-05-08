const { imageHash } = require('image-hash');
const fs = require('fs').promises;

/**
 * Compute perceptual hash (pHash) for an image file.
 * Uses a 8x8 grid for 64-bit hash, which is standard for pHash.
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<string>} - Hex string representation of the hash
 */
async function computePHash(imagePath) {
  try {
    // Check if file exists
    await fs.access(imagePath);

    // image-hash v5.x uses callback-based API
    // Parameters: imagePath, bits (8 for 64-bit), hash_type (false for pHash)
    return new Promise((resolve, reject) => {
      imageHash(imagePath, 8, false, (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data); // data is already a hex string
        }
      });
    });
  } catch (error) {
    console.error('Error computing pHash for', imagePath, ':', error.message);
    throw error;
  }
}

/**
 * Calculate Hamming distance between two hashes.
 * Hamming distance = number of differing bits between two hashes.
 * @param {string} hash1 - Hex string hash 1
 * @param {string} hash2 - Hex string hash 2
 * @returns {number} - Hamming distance (0-64 for 64-bit hashes)
 */
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2) {
    return 64; // Maximum distance if either hash is missing
  }

  if (hash1.length !== hash2.length) {
    return 64; // Maximum distance if hashes have different lengths
  }

  let distance = 0;

  // Convert hex strings to binary and count differing bits
  for (let i = 0; i < hash1.length; i++) {
    const bits1 = parseInt(hash1[i], 16).toString(2).padStart(4, '0');
    const bits2 = parseInt(hash2[i], 16).toString(2).padStart(4, '0');

    for (let j = 0; j < bits1.length; j++) {
      if (bits1[j] !== bits2[j]) {
        distance++;
      }
    }
  }

  return distance;
}

/**
 * Calculate similarity percentage between two hashes.
 * Similarity = (1 - hamming_distance / 64) * 100
 * @param {string} hash1 - Hex string hash 1
 * @param {string} hash2 - Hex string hash 2
 * @returns {number} - Similarity percentage (0-100)
 */
function calculateSimilarity(hash1, hash2) {
  const distance = hammingDistance(hash1, hash2);
  const similarity = (1 - distance / 64) * 100;
  return Math.round(similarity * 10) / 10; // Round to 1 decimal place
}

/**
 * Find similar images in database based on pHash.
 * Returns all images with similarity >= threshold.
 * @param {string} currentHash - Hash of the image to compare
 * @param {Array} existingHashes - Array of {id, phash} objects from database
 * @param {number} threshold - Similarity threshold (0-100, default 90)
 * @returns {Array} - Array of {id, similarity} for similar images
 */
function findSimilarImages(currentHash, existingHashes, threshold = 90) {
  if (!currentHash || !existingHashes || existingHashes.length === 0) {
    return [];
  }

  const similar = [];

  for (const record of existingHashes) {
    if (!record.phash) continue; // Skip if no hash

    const similarity = calculateSimilarity(currentHash, record.phash);

    if (similarity >= threshold) {
      similar.push({
        id: record.id,
        similarity: similarity,
      });
    }
  }

  return similar;
}

module.exports = {
  computePHash,
  hammingDistance,
  calculateSimilarity,
  findSimilarImages,
};
