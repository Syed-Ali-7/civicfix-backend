const https = require('https');

/**
 * Reverse geocoding: Convert coordinates (lat, lng) to human-readable address
 * Uses OpenStreetMap Nominatim API (free, no API key required)
 * @param {number} latitude - Latitude coordinate
 * @param {number} longitude - Longitude coordinate
 * @returns {Promise<string>} - Formatted address string
 */
const reverseGeocode = async (latitude, longitude) => {
  // Ensure we have valid numbers
  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lon)) {
    throw new Error('Invalid coordinates provided');
  }

  return new Promise((resolve, reject) => {
    // Add delay to respect rate limits (1 request per second)
    setTimeout(() => {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;

      https
        .get(
          url,
          {
            headers: {
              'User-Agent': 'CivicFixApp/1.0',
              'Accept-Language': 'en',
            },
            timeout: 5000, // 5 second timeout
          },
          (res) => {
            let data = '';

            // Handle HTTP status
            if (res.statusCode === 429) {
              reject(new Error('Rate limit exceeded. Please try again later.'));
              return;
            }

            if (res.statusCode !== 200) {
              reject(
                new Error(`Geocoding service returned status ${res.statusCode}`)
              );
              return;
            }

            res.on('data', (chunk) => {
              data += chunk;
            });

            res.on('end', () => {
              try {
                const result = JSON.parse(data);

                if (result.error) {
                  reject(new Error(result.error));
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
                console.error(
                  'Geocoding parse error:',
                  error,
                  'Raw data:',
                  data
                );
                reject(
                  new Error(
                    `Failed to parse geocoding response: ${error.message}`
                  )
                );
              }
            });
          }
        )
        .on('error', (error) => {
          console.error('Geocoding network error:', error.message);
          reject(new Error(`Geocoding request failed: ${error.message}`));
        });
    }, 1000); // 1 second delay
  });
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

module.exports = {
  reverseGeocode,
  formatAddress,
};
