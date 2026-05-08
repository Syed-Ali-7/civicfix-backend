/**
 * Test script for geocoding performance and caching
 * Run with: node scripts/test-geocoding.js
 */

const {
  reverseGeocode,
  getCacheStats,
  formatCoordinatesAsAddress,
} = require('../src/utils/geocoding');

async function testGeocoding() {
  console.log('\n📍 GEOCODING SYSTEM TEST\n');
  console.log('='.repeat(60));

  // Test coordinates
  const testLocations = [
    { name: 'Springfield Downtown', lat: 39.7684, lon: -89.6502 },
    { name: 'Chicago Loop', lat: 41.8781, lon: -87.6298 },
    { name: 'Springfield Downtown (Cache)', lat: 39.7684, lon: -89.6502 }, // Same as first
  ];

  for (const location of testLocations) {
    console.log(`\n🔍 Testing: ${location.name}`);
    console.log(`   Coordinates: (${location.lat}, ${location.lon})`);

    const startTime = Date.now();

    try {
      const address = await reverseGeocode(location.lat, location.lon);
      const duration = Date.now() - startTime;

      console.log(`✅ Address: ${address}`);
      console.log(`⏱️  Time: ${duration}ms`);
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }

    // Show cache stats
    const stats = getCacheStats();
    console.log(`📊 Cache: ${stats.size}/${stats.maxSize} entries`);
  }

  console.log('\n' + '='.repeat(60));
  const stats = getCacheStats();
  console.log(`\n📈 FINAL CACHE STATS:`);
  console.log(`   Entries: ${stats.size}/${stats.maxSize}`);
  console.log(`   TTL: ${stats.ttlHours} hours`);
  console.log(`\n✅ Test completed!\n`);
}

testGeocoding().catch(console.error);
