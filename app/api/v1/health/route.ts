export const runtime = 'nodejs';
export async function GET() {
  return Response.json({ok:true, service:'mobicom-pay', version:'0.2.0', time:new Date().toISOString()});
}
