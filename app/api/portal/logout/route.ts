import { clearPortalSessionCookie } from '@/lib/portal-auth'

export async function POST() {
  await clearPortalSessionCookie()
  return Response.json({ success: true })
}
