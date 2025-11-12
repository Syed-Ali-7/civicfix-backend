const { sequelize } = require('../src/models');

async function addResolvedPhotoColumn() {
  try {
    // Check if column exists (Postgres information_schema)
    const [results] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='issues' AND column_name='resolved_photo_url'
    `);

    if (results.length === 0) {
      // Column doesn't exist, so add it
      await sequelize.query(`
        ALTER TABLE issues 
        ADD COLUMN resolved_photo_url varchar(255)
      `);
      console.log('Successfully added resolved_photo_url column');
    } else {
      console.log('resolved_photo_url column already exists');
    }

    await sequelize.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addResolvedPhotoColumn();
