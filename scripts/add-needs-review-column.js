const { sequelize } = require('../src/models');

async function addNeedsReviewColumn() {
  try {
    // Check if column exists
    const [results] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='issues' AND column_name='needs_review'
    `);

    if (results.length === 0) {
      // Column doesn't exist, so add it
      await sequelize.query(`
        ALTER TABLE issues 
        ADD COLUMN needs_review boolean NOT NULL DEFAULT false
      `);
      console.log('Successfully added needs_review column');
    } else {
      console.log('needs_review column already exists');
    }

    await sequelize.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addNeedsReviewColumn();
