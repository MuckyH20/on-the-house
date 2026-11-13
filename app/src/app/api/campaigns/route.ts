import { HttpError, jsonError } from '@/lib/server';
import { launch, LaunchBody } from '@/lib/launch';

/**
 * Launch a promo.
 *  - No `merchant` → the server's demo merchant signs and the promo is live when this returns (used by scripts).
 *  - `merchant` = the owner's wallet → returns a transaction the owner co-signs, then POST it to /api/submit.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const parsed = LaunchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    return Response.json(await launch(parsed.data));
  } catch (e) {
    return jsonError(e);
  }
}
