const { sequelize } = require('../src/config/db');
require('dotenv').config();

async function fixAddressColumn() {
  try {
    console.log('🔧 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    console.log('🔍 Checking if address column exists...');
    
    // Check if the column exists
    const tableName = 'issues';
    const columnName = 'address';
    
    // Get table information
    const tableInfo = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = '${tableName}' 
      AND column_name = '${columnName}'
    `, { type: sequelize.QueryTypes.SELECT });

    if (tableInfo.length === 0) {
      console.log(`❌ Column '${columnName}' not found in table '${tableName}'`);
      console.log('📝 Adding address column to issues table...');
      
      // Add the column
      await sequelize.query(`
        ALTER TABLE ${tableName} 
        ADD COLUMN ${columnName} TEXT;
      `);
      
      console.log('✅ Address column added successfully!');
    } else {
      console.log(`✅ Column '${columnName}' already exists in table '${tableName}'`);
    }

    console.log('\n🔄 Syncing Sequelize models...');
    await sequelize.sync();
    console.log('✅ Database sync completed!');

    console.log('\n🎉 Fix completed successfully!');
    console.log('You can now restart your backend server.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing address column:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Make sure database is running');
    console.error('   2. Check DATABASE_URL in .env is correct');
    console.error('   3. Ensure you have proper database permissions');
    process.exit(1);
  }
}

fixAddressColumn();