const imageHashModule = require('image-hash');
const path = require('path');
const fs = require('fs');

async function testImageHashAPI() {
  console.log('Module exports:', Object.keys(imageHashModule));
  console.log('Full module:', imageHashModule);

  const uploadsDir = path.join(__dirname, '../uploads');
  const files = fs.readdirSync(uploadsDir).slice(0, 1);

  if (files.length > 0) {
    const imagePath = path.join(uploadsDir, files[0]);
    console.log('\nTesting with:', imagePath);

    try {
      // The module might export a function directly
      if (typeof imageHashModule === 'function') {
        console.log('Module is a function');
        const result = imageHashModule(imagePath);
        console.log('Result:', result);
      } else if (imageHashModule.imageHash) {
        console.log(
          'Module.imageHash exists:',
          typeof imageHashModule.imageHash
        );
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
}

testImageHashAPI();
