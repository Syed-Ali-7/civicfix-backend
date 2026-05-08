const { sequelize } = require('../src/config/db');

async function run() {
  try {
    await sequelize.authenticate();

    await sequelize.query(
      'ALTER TABLE issues ADD COLUMN IF NOT EXISTS reopen_count INTEGER DEFAULT 0;'
    );
    await sequelize.query(
      'ALTER TABLE issues ADD COLUMN IF NOT EXISTS rejection_photo_url TEXT;'
    );
    await sequelize.query(
      'ALTER TABLE issues ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP NULL;'
    );
    await sequelize.query(
      'ALTER TABLE issues ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP NULL;'
    );

    await sequelize.query(
      `DO $$
       BEGIN
         ALTER TYPE "enum_issues_status" ADD VALUE IF NOT EXISTS 'Closed';
       EXCEPTION
         WHEN duplicate_object THEN NULL;
       END $$;`
    );

    await sequelize.query(
      `DO $$
       BEGIN
         ALTER TYPE "enum_issues_status" ADD VALUE IF NOT EXISTS 'Reopened';
       EXCEPTION
         WHEN duplicate_object THEN NULL;
       END $$;`
    );

    console.log('Migration complete: feedback columns and enum values are in place.');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

run();
