const https = require('https');

// In-memory cache for geocoding results
// Key: "lat,lon" (rounded to 4 decimal places for consistency)
// Value: { address, timestamp }
const geocodingCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_MAX_SIZE = 1000; // Max entries to prevent memory leak

/**
 * Get cache key from coordinates
 * Rounds to 4 decimal places (~11m accuracy) to group nearby locations
 */
const getCacheKey = (latitude, longitude) => {
  const lat = parseFloat(latitude).toFixed(4);
  const lon = parseFloat(longitude).toFixed(4);
  return `${lat},${lon}`;
};

/**
 * Clean expired cache entries
 */
const cleanCache = () => {
  const now = Date.now();
  for (const [key, value] of geocodingCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      geocodingCache.delete(key);
    }
  }

  // If cache is too large, clear oldest entries
  if (geocodingCache.size > CACHE_MAX_SIZE) {
    const entriesToDelete = geocodingCache.size - CACHE_MAX_SIZE + 100;
    let deleted = 0;
    for (const [key] of geocodingCache.entries()) {
      if (deleted >= entriesToDelete) break;
      geocodingCache.delete(key);
      deleted++;
    }
    console.log(`🗑️  Geocoding cache cleared ${deleted} old entries`);
  }
};

/**
 * Reverse geocoding with retry logic and caching
 * @param {number} latitude - Latitude coordinate
 * @param {number} longitude - Longitude coordinate
 * @param {number} retries - Number of retries (default 2)
 * @returns {Promise<string>} - Formatted address string
 */
const reverseGeocode = async (latitude, longitude, retries = 2) => {
  // Ensure we have valid numbers
  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lon)) {
    throw new Error('Invalid coordinates provided');
  }

  // Check cache first
  const cacheKey = getCacheKey(lat, lon);
  if (geocodingCache.has(cacheKey)) {
    const cached = geocodingCache.get(cacheKey);
    console.log(`✓ Geocoding cache hit for ${cacheKey}`);
    return cached.address;
  }

  // Try with retries
  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const address = await performGeocode(lat, lon, attempt);

      // Cache the result
      geocodingCache.set(cacheKey, {
        address,
        timestamp: Date.now(),
      });

      // Periodically clean cache
      if (geocodingCache.size % 50 === 0) {
        cleanCache();
      }

      return address;
    } catch (error) {
      lastError = error;

      // Calculate delay with exponential backoff
      if (attempt <= retries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.warn(
          `⚠️  Geocoding attempt ${attempt}/${retries + 1} failed. ` +
            `Retrying in ${delayMs}ms... Error: ${error.message}`
        );
        await delay(delayMs);
      }
    }
  }

  // All retries failed - return fallback with coordinates
  console.error(
    `❌ Geocoding failed after ${retries + 1} attempts:`,
    lastError.message
  );

  // Return formatted coordinates as fallback
  const fallbackAddress = formatCoordinatesAsAddress(lat, lon);

  // Cache the fallback too (shorter TTL)
  geocodingCache.set(cacheKey, {
    address: fallbackAddress,
    timestamp: Date.now(),
  });

  return fallbackAddress;
};

/**
 * Actually perform the geocoding request
 * @private
 */
const performGeocode = (latitude, longitude, attemptNumber = 1) => {
  return new Promise((resolve, reject) => {
    // Calculate delay: first attempt is immediate, then exponential backoff
    const initialDelay = attemptNumber === 1 ? 100 : 0;
    const rateLimitDelay = 500; // Respectful rate limiting
    const totalDelay = initialDelay + rateLimitDelay;

    setTimeout(() => {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;

      const request = https.get(
        url,
        {
          headers: {
            'User-Agent': 'CivicFixApp/1.0',
            'Accept-Language': 'en',
          },
          timeout: 8000, // Increased timeout from 5s to 8s
        },
        (res) => {
          let data = '';

          // Handle HTTP status
          if (res.statusCode === 429) {
            reject(new Error('Nominatim rate limited (429)'));
            return;
          }

          if (res.statusCode === 503) {
            reject(new Error('Nominatim service unavailable (503)'));
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Nominatim returned ${res.statusCode}`));
            return;
          }

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const result = JSON.parse(data);

              if (result.error) {
                reject(new Error(`Nominatim error: ${result.error}`));
                return;
              }

              if (!result.address) {
                resolve('Location details not available');
                return;
              }

              // Format address from OpenStreetMap response
              const address = formatAddress(result.address);
              resolve(address);
            } catch (error) {
              console.error('Geocoding parse error:', error.message);
              reject(new Error(`Failed to parse geocoding response`));
            }
          });
        }
      );

      request.on('error', (error) => {
        reject(new Error(`Network error: ${error.message}`));
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Nominatim request timeout'));
      });
    }, totalDelay);
  });
};

/**
 * Simple helper to add delay
 * @private
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Format coordinates as a fallback address string
 * Used when geocoding service fails
 */
const formatCoordinatesAsAddress = (latitude, longitude) => {
  const lat = latitude.toFixed(4);
  const lon = longitude.toFixed(4);
  return `Location (${lat}, ${lon})`;
};

/**
 * Format address object from OpenStreetMap into readable string
 * @param {Object} addressObj - Address object from OpenStreetMap
 * @returns {string} - Formatted address string
 */
const formatAddress = (addressObj) => {
  if (!addressObj) {
    return 'Address not available';
  }

  const parts = [];

  // Building/Street level
  if (addressObj.house_number && addressObj.road) {
    parts.push(`${addressObj.house_number} ${addressObj.road}`);
  } else if (addressObj.road) {
    parts.push(addressObj.road);
  } else if (addressObj.pedestrian) {
    parts.push(addressObj.pedestrian);
  }

  // Neighborhood/Suburb
  if (addressObj.suburb) {
    parts.push(addressObj.suburb);
  } else if (addressObj.neighbourhood) {
    parts.push(addressObj.neighbourhood);
  }

  // City/Town
  if (addressObj.city) {
    parts.push(addressObj.city);
  } else if (addressObj.town) {
    parts.push(addressObj.town);
  } else if (addressObj.village) {
    parts.push(addressObj.village);
  }

  // State/Region
  if (addressObj.state) {
    parts.push(addressObj.state);
  }

  // Country
  if (addressObj.country) {
    parts.push(addressObj.country);
  }

  // Postal code
  if (addressObj.postcode) {
    parts.push(addressObj.postcode);
  }

  // If we have parts, join them; otherwise return a fallback
  if (parts.length > 0) {
    return parts.join(', ');
  }

  // Fallback: try to get display_name if available
  return addressObj.display_name || 'Address not available';
};

/**
 * Get geocoding cache statistics (for debugging)
 */
const getCacheStats = () => {
  return {
    size: geocodingCache.size,
    maxSize: CACHE_MAX_SIZE,
    ttlHours: CACHE_TTL / (60 * 60 * 1000),
  };
};

module.exports = {
  reverseGeocode,
  formatAddress,
  getCacheStats,
  formatCoordinatesAsAddress,
};
