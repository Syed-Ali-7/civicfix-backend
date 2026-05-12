const bcrypt = require('bcryptjs');
const { sequelize } = require('../src/config/db');
const { User } = require('../src/models');
require('dotenv').config();

async function createOfficerAccounts() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    const officers = [
      {
        name: 'Officer A',
        email: 'officer1@example.com',
        password: 'password123',
        role: 'admin',
        designation: 'level_1'
      },
      {
        name: 'Officer B',
        email: 'officer2@example.com',
        password: 'password123',
        role: 'admin',
        designation: 'zonal_officer'
      },
      {
        name: 'Officer C',
        email: 'officer3@example.com',
        password: 'password123',
        role: 'admin',
        designation: 'supervisor'
      }
    ];

    console.log('📝 Creating officer accounts...\n');

    for (const officer of officers) {
      try {
        const existingUser = await User.findOne({ where: { email: officer.email } });
        
        if (existingUser) {
          if (!existingUser.designation) {
            await existingUser.update({
              designation: officer.designation,
            });
            console.log(
              `✅ Updated designation for ${officer.name} (${officer.email})`
            );
          } else {
            console.log(`⚠️  Officer ${officer.name} already exists`);
          }
          continue;
        }

        const hashedPassword = await bcrypt.hash(officer.password, 10);
        
        await User.create({
          name: officer.name,
          email: officer.email,
          password: hashedPassword,
          role: officer.role,
          designation: officer.designation,
        });

        console.log(`✅ Created officer: ${officer.name} (${officer.email})`);
      } catch (error) {
        console.log(`❌ Failed to create ${officer.name}: ${error.message}`);
      }
    }

    console.log('\n🎉 Officer accounts creation completed!');
    console.log('\n📋 Officer Login Credentials:');
    console.log('═══════════════════════════════════════════════════════════════');
    officers.forEach(officer => {
      console.log(`Email: ${officer.email}`);
      console.log(`Password: ${officer.password}`);
      console.log('───────────────────────────────────────────────────────────────');
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating officer accounts:', error.message);
    process.exit(1);
  }
}

createOfficerAccounts();