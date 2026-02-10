import { NextResponse } from 'next/server';
import { z } from 'zod';

const BodySchema = z.object({
  kind: z.enum(['action']).default('action'),
  id: z.string().min(1),
});

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

async function getMgmtApiToken() {
  const domain = requireEnv('AUTH0_DOMAIN');
  const clientId = requireEnv('AUTH0_CLIENT_ID');
  const clientSecret = requireEnv('AUTH0_CLIENT_SECRET');

  const tokenRes = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
  });

  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token as string | undefined;
  if (!accessToken) throw new Error('No access_token');

  return { domain, accessToken };
}

export async function POST(req: Request) {
  try {
    const mode = (process.env.MAINTENANCE_MODE || 'vercel').toLowerCase();
    if (mode !== 'local') {
      return NextResponse.json({ ok: false, error: 'Cleanup endpoint supported only in local mode.' }, { status: 400 });
    }

    const body = BodySchema.parse(await req.json());
    const { domain, accessToken } = await getMgmtApiToken();

    if (body.kind === 'action') {
      const res = await fetch(`https://${domain}/api/v2/actions/actions/${encodeURIComponent(body.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });

      const text = await res.text().catch(() => '');
      return NextResponse.json({ ok: res.ok, status: res.status, responsePreview: text.slice(0, 800) });
    }

    return NextResponse.json({ ok: false, error: 'Unknown cleanup kind' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 400 });
  }
}
