const { sequelize } = require('../src/models');

async function addPHashColumn() {
  try {
    // Check if column exists
    const [results] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='issues' AND column_name='phash'
    `);

    if (results.length === 0) {
      // Column doesn't exist, so add it
      await sequelize.query(`
        ALTER TABLE issues 
        ADD COLUMN phash VARCHAR(255)
      `);
      console.log('✅ Successfully added phash column');
    } else {
      console.log('ℹ️  phash column already exists');
    }

    await sequelize.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addPHashColumn();
