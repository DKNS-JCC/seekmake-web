// Supabase Edge Function: trigger-rebuild
//
// Validates that the caller is an authenticated admin and dispatches a
// `rebuild` event to the GitHub Actions workflow, which runs `deploy-pages.yml`
// and republishes the static site.
//
// ── Required environment variables (set with `supabase secrets set`) ──
//   GITHUB_PAT      A GitHub Personal Access Token with `repo` scope (or a
//                   fine-grained PAT with Contents: Read & Actions: Read+Write
//                   on the target repository).
//   GITHUB_REPO     "<owner>/<repo>", e.g. "DKNS-JCC/seekmake-web".
//
// ── Deploy ──
//   supabase functions deploy trigger-rebuild
//   supabase secrets set GITHUB_PAT=ghp_xxx GITHUB_REPO=DKNS-JCC/seekmake-web
//
// ── Test ──
//   curl -X POST 'https://<project-ref>.supabase.co/functions/v1/trigger-rebuild' \
//     -H 'Authorization: Bearer <user-jwt>'

// @ts-nocheck — this file targets Deno (Supabase Edge runtime), not Node.
// The Node TypeScript compiler doesn't understand URL imports nor `Deno.*`.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ── 1. Verify caller is an authenticated admin ──
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Missing Authorization header' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: 'Invalid session' }, 401);
  }

  const isAdmin = Boolean((userData.user.app_metadata as any)?.is_admin);
  if (!isAdmin) {
    return json({ error: 'Forbidden — admin only' }, 403);
  }

  // ── 2. Fetch config ──
  const pat = Deno.env.get('GITHUB_PAT');
  const repo = Deno.env.get('GITHUB_REPO');
  if (!pat || !repo) {
    return json(
      {
        error:
          'Server not configured. Set GITHUB_PAT and GITHUB_REPO with `supabase secrets set`.'
      },
      500
    );
  }

  // ── 3. Dispatch the GitHub workflow ──
  const ghRes = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': '3dcc-rebuild-trigger'
    },
    body: JSON.stringify({
      event_type: 'rebuild',
      client_payload: {
        triggered_by: userData.user.email ?? userData.user.id,
        at: new Date().toISOString()
      }
    })
  });

  if (!ghRes.ok) {
    const detail = await ghRes.text();
    return json(
      { error: 'GitHub API failed', status: ghRes.status, detail },
      502
    );
  }

  // GitHub returns 204 No Content on success — there's nothing to read.
  return json({
    ok: true,
    message: 'Rebuild triggered. New deploy should be live in ~2 minutes.'
  });
});
