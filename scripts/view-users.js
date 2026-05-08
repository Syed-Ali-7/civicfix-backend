const { sequelize } = require('../src/config/db');
const { User } = require('../src/models');
require('dotenv').config();

async function viewUsers() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'role', 'created_at', 'updated_at'],
      order: [['created_at', 'DESC']],
    });

    if (users.length === 0) {
      console.log('📭 No users found in the database.');
      process.exit(0);
    }

    console.log(`📊 Found ${users.length} user(s):\n`);
    console.log('═'.repeat(80));
    
    users.forEach((user, index) => {
      console.log(`\n👤 User #${index + 1}`);
      console.log('─'.repeat(80));
      console.log(`   ID:        ${user.id}`);
      console.log(`   Name:      ${user.name}`);
      console.log(`   Email:     ${user.email}`);
      console.log(`   Role:      ${user.role}`);
      console.log(`   Created:   ${user.created_at}`);
      console.log(`   Updated:   ${user.updated_at}`);
    });

    console.log('\n' + '═'.repeat(80));
    console.log(`\n✅ Total users: ${users.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fetching users:', error.message);
    console.error('\n💡 Make sure:');
    console.error('   1. Database is running');
    console.error('   2. DATABASE_URL is set correctly in .env');
    console.error('   3. Backend server has connected to database at least once');
    process.exit(1);
  }
}

viewUsers();

