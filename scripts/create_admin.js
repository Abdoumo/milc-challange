#!/usr/bin/env node
// CLI script to create an Admin account for MLIC CHALLENGE
// Usage:
//   Interactive:  node scripts/create_admin.js
//   Arguments:    node scripts/create_admin.js --name "Admin Name" --email "admin@mlic.com" --password "yourpassword" --org "MLIC Board"

require('../server/env');
const readline = require('node:readline');
const crypto = require('node:crypto');
const db = require('../server/db');
const { hashPassword } = require('../server/auth');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--name' && args[i + 1]) result.name = args[++i];
    else if (arg === '--email' && args[i + 1]) result.email = args[++i];
    else if (arg === '--password' && args[i + 1]) result.password = args[++i];
    else if (arg === '--org' && args[i + 1]) result.organization = args[++i];
  }

  // Fallback positional arguments: email, password, name
  if (!result.email && args[0] && args[0].includes('@')) {
    result.email = args[0];
    if (args[1]) result.password = args[1];
    if (args[2]) result.name = args[2];
  }

  return result;
}

function prompt(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

async function main() {
  console.log(`=======================================================`);
  console.log(`👑 MLIC CHALLENGE - Create Administrator Account`);
  console.log(`Database: ${db.isPostgres ? 'PostgreSQL (' + process.env.DATABASE_URL.split('@')[1] + ')' : 'Local SQLite Storage'}`);
  console.log(`=======================================================`);

  await db.initDatabase();

  const parsed = parseArgs();
  let name = parsed.name;
  let email = parsed.email;
  let password = parsed.password;
  let organization = parsed.organization || 'MLIC Challenge Organizing Committee';

  if (!email) {
    email = await prompt('Enter Admin Email: ');
  }
  if (!name) {
    name = await prompt('Enter Admin Full Name: ');
  }
  if (!password) {
    password = await prompt('Enter Admin Password: ');
  }

  if (!email || !email.includes('@')) {
    console.error('❌ Error: A valid email address is required.');
    process.exit(1);
  }
  if (!password || password.length < 6) {
    console.error('❌ Error: Password must be at least 6 characters.');
    process.exit(1);
  }
  if (!name) {
    name = 'System Administrator';
  }

  const cleanEmail = email.toLowerCase().trim();
  const passHash = hashPassword(password);
  const now = new Date().toISOString();

  try {
    const existing = await db.get('SELECT id, name, role FROM users WHERE email = ?', [cleanEmail]);

    if (existing) {
      await db.run(
        'UPDATE users SET password_hash = ?, role = ?, is_approved = 1, name = ?, organization = ? WHERE id = ?',
        [passHash, 'admin', name, organization, existing.id]
      );
      console.log(`\n✅ Existing user '${cleanEmail}' has been upgraded to ADMIN with your new password!`);
    } else {
      const id = 'user_admin_' + crypto.randomUUID().slice(0, 8);
      await db.run(`
        INSERT INTO users (id, name, email, password_hash, role, organization, bio, is_approved, created_at)
        VALUES (?, ?, ?, ?, 'admin', ?, 'المشرف العام على مسابقة MLIC CHALLENGE', 1, ?)
      `, [id, name, cleanEmail, passHash, organization, now]);
      console.log(`\n✅ Administrator account created successfully!`);
    }

    console.log(`=======================================================`);
    console.log(`👑 Name:         ${name}`);
    console.log(`📧 Email:        ${cleanEmail}`);
    console.log(`🔑 Role:         admin (Full administrative access & Lajna approvals)`);
    console.log(`🏢 Organization: ${organization}`);
    console.log(`=======================================================`);
    console.log(`You can now sign in at http://localhost:${process.env.PORT || 3000}\n`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to create admin account:', err.message);
    process.exit(1);
  }
}

main();
