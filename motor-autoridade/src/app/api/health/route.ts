export const runtime = 'nodejs';

export async function GET() {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env_check: {
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓' : '✗',
      supabase_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓' : '✗',
      anthropic_key: process.env.ANTHROPIC_API_KEY ? '✓' : '✗',
    }
  });
}
