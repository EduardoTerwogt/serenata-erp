/**
 * Utility to generate a secure scrypt hash for a password.
 * Usage: npx tsx scripts/hash-password.ts <password>
 *
 * Use the output as the "passwordHash" value in AUTH_USERS env var.
 */
import { hashPassword } from '../lib/auth-utils'

async function main() {
  const password = process.argv[2]
  if (!password) {
    console.error('Usage: npx tsx scripts/hash-password.ts <password>')
    process.exit(1)
  }
  const hash = await hashPassword(password)
  console.log(hash)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
