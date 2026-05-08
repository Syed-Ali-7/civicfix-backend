/**
 * Test script for pHash duplicate detection
 * Run with: node scripts/test-phash.js
 */

const {
  computePHash,
  calculateSimilarity,
  findSimilarImages,
} = require('../src/utils/phash');
const path = require('path');
const fs = require('fs');

async function testPHash() {
  console.log('\n📋 pHash Duplicate Detection Test\n');

  // Get sample images from uploads directory
  const uploadsDir = path.join(__dirname, '../uploads');

  if (!fs.existsSync(uploadsDir)) {
    console.log('❌ No uploads directory found');
    return;
  }

  const files = fs.readdirSync(uploadsDir).slice(0, 3);

  if (files.length === 0) {
    console.log('❌ No image files found in uploads/');
    return;
  }

  console.log(`Found ${files.length} image(s) to test\n`);

  const hashes = [];

  // Compute hashes for each image
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(uploadsDir, file);

    try {
      console.log(`[${i + 1}/${files.length}] Computing pHash for: ${file}`);
      const hash = await computePHash(filePath);
      console.log(`      Hash: ${hash}\n`);

      hashes.push({ id: `image-${i + 1}`, phash: hash });
    } catch (error) {
      console.error(`      ❌ Error: ${error.message}\n`);
    }
  }

  // Compare hashes
  if (hashes.length >= 2) {
    console.log('📊 Similarity Analysis:\n');

    for (let i = 0; i < hashes.length; i++) {
      for (let j = i + 1; j < hashes.length; j++) {
        const hash1 = hashes[i].phash;
        const hash2 = hashes[j].phash;
        const similarity = calculateSimilarity(hash1, hash2);

        console.log(
          `${hashes[i].id} vs ${hashes[j].id}: ${similarity.toFixed(1)}% similar`
        );

        if (similarity >= 90) {
          console.log('   ⚠️  DUPLICATE DETECTED! (>= 90% threshold)\n');
        }
      }
    }
  }

  console.log('✅ Test completed!\n');
}

testPHash().catch(console.error);
