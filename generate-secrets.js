/**
 * Generate random secrets for your .env file
 * Run with: node generate-secrets.js
 */

const crypto = require('crypto');

function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

console.log('\n=== Generated Secrets for .env ===\n');
console.log('Copy these values to your .env file:\n');
console.log(`CRON_SECRET=${generateSecret(32)}`);
console.log(`NEXTAUTH_SECRET=${generateSecret(32)}`);
console.log('\n=================================\n');
console.log('Note: Keep these secrets safe and never commit them to version control!\n');
