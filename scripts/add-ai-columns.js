/**
 * Migration script to add AI verification columns to existing issues table
 * Run this once after updating the Issue model
 */

const { sequelize } = require('../src/config/db');

async function addAIColumns() {
  try {
    console.log('🔧 Starting AI columns migration...');

    // Check if ai_verified column already exists
    const [results] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='issues' 
      AND column_name='ai_verified'
    `);

    if (results.length > 0) {
      console.log('✅ AI columns already exist. Skipping migration.');
      return;
    }

    // Add ai_verified column
    await sequelize.query(`
      ALTER TABLE issues 
      ADD COLUMN IF NOT EXISTS ai_verified BOOLEAN DEFAULT NULL
    `);
    console.log('✅ Added ai_verified column');

    // Add ai_confidence column
    await sequelize.query(`
      ALTER TABLE issues 
      ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(5, 4) DEFAULT NULL
    `);
    console.log('✅ Added ai_confidence column');

    // Add ai_label column
    await sequelize.query(`
      ALTER TABLE issues 
      ADD COLUMN IF NOT EXISTS ai_label VARCHAR(100) DEFAULT NULL
    `);
    console.log('✅ Added ai_label column');

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run migration
addAIColumns()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
