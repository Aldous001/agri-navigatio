import { buildSnapshot, SOURCE_URL } from './sync.mjs';
import schedulerConfig from './scheduler-config.json' with { type: 'json' };

const base = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers = {apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'};
async function rest(path: string, options: RequestInit = {}) {
  const response = await fetch(`${base}/rest/v1/${path}`, {...options,
    headers: {...headers, ...options.headers}, signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`数据库请求失败 ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body),
  {status, headers: {'Content-Type': 'application/json'}});

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return reply({message:'仅允许POST请求'}, 405);
  const token = request.headers.get('x-sync-token') || '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (!token || hash !== schedulerConfig.tokenSha256) return reply({message:'未获授权'}, 401);
  const startedAt = new Date().toISOString();
  try {
    const records = await rest('nav_snapshots?id=eq.current&select=payload,updated_at');
    if (records.length !== 1) throw new Error('没有当前数据快照');
    const response = await fetch(SOURCE_URL, {signal: AbortSignal.timeout(60000), cache:'no-store'});
    if (!response.ok) throw new Error(`来源请求失败 ${response.status}`);
    const text = await response.text();
    if (text.length > 30000000) throw new Error('来源文件超出大小限制');
    const payload = buildSnapshot(text, records[0].payload, startedAt);
    const updated = await rest(`nav_snapshots?id=eq.current&updated_at=eq.${encodeURIComponent(records[0].updated_at)}`,
      {method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify({payload,updated_at:startedAt})});
    if (!updated?.length) throw new Error('快照已被其他任务更新，本次未覆盖');
    await rest('nav_sync_runs', {method:'POST', body:JSON.stringify({started_at:startedAt,
      finished_at:new Date().toISOString(),status:'success',source_generated:payload.generated,model_count:payload.models.length})});
    return reply({status:'success',generated:payload.generated,models:payload.models.length,checkedAt:startedAt});
  } catch (error) {
    const message = error instanceof Error ? error.message : '同步失败';
    try { await rest('nav_sync_runs', {method:'POST',body:JSON.stringify({started_at:startedAt,
      finished_at:new Date().toISOString(),status:'failed',error:message.slice(0,500)})}); } catch { console.error('同步失败且日志写入失败'); }
    return reply({status:'failed',message}, 500);
  }
});
