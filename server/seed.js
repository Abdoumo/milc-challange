// Seed script for MLIC CHALLENGE
// Production mode: Initial settings only (NO mock users or fake submissions)

const { initDatabase } = require('./db');

async function seed() {
  await initDatabase();
  console.log('[Seed] Production database initialized with clean tables.');
}

module.exports = { seed };

if (require.main === module) {
  seed().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
