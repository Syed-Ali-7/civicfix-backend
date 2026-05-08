/**
 * Python Model Bridge for Node.js Backend
 * Communicates with Python pothole detection model
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class PythonModelBridge {
  constructor(modelPath = 'pothole_model.keras', pythonPath = 'python') {
    // Resolve absolute paths from project root
    this.modelPath = path.isAbsolute(modelPath)
      ? modelPath
      : path.join(__dirname, '../../../', modelPath);
    this.pythonPath = pythonPath;
    this.scriptPath = path.join(__dirname, '../../../pothole_model.py');
  }

  /**
   * Predict pothole in image using Python model
   */
  async predictImage(imagePath) {
    return new Promise((resolve, reject) => {
      console.log(`🐍 Calling Python model for: ${imagePath}`);

      const python = spawn(this.pythonPath, [
        this.scriptPath,
        '--predict',
        imagePath,
        '--model',
        this.modelPath,
      ]);

      let output = '';
      let error = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        error += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('❌ Python error:', error);
          reject(
            new Error(`Python process exited with code ${code}: ${error}`)
          );
          return;
        }

        try {
          // Parse output to find prediction (new format without emoji)
          const isPotholeMatch = output.match(/Is Pothole: (YES|NO)/);
          const confidenceMatch = output.match(/Confidence: ([\d.]+%)/);

          if (!isPotholeMatch || !confidenceMatch) {
            console.log('Debug output:', output);
            throw new Error('Could not parse Python output');
          }

          const result = {
            isPothole: isPotholeMatch[1] === 'YES',
            confidence: parseFloat(confidenceMatch[1]) / 100,
            percentage: confidenceMatch[1],
            method: 'custom_python_model',
          };

          console.log('✅ Python prediction:', result);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Train model with dataset
   */
  async trainModel(dataDir, epochs = 25) {
    return new Promise((resolve, reject) => {
      console.log(
        `🧠 Starting Python model training with data from: ${dataDir}`
      );

      const python = spawn(this.pythonPath, [
        this.scriptPath,
        '--train',
        '--data-dir',
        dataDir,
        '--epochs',
        epochs.toString(),
        '--model',
        this.modelPath,
      ]);

      let output = '';
      let error = '';

      python.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log('[Python]', text.trim());
      });

      python.stderr.on('data', (data) => {
        const text = data.toString();
        error += text;
        console.error('[Python Error]', text.trim());
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error('❌ Training failed with error:', error);
          reject(new Error(`Training failed: ${error}`));
          return;
        }

        resolve({
          success: true,
          message: 'Training completed successfully',
          modelPath: this.modelPath,
        });
      });
    });
  }

  /**
   * Check if model exists
   */
  modelExists() {
    return fs.existsSync(this.modelPath);
  }

  /**
   * Get model info
   */
  getModelInfo() {
    const metadataPath = this.modelPath.replace('.h5', '_metadata.json');

    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      return metadata;
    }

    return null;
  }
}

module.exports = PythonModelBridge;
