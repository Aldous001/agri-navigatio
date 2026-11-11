-- 先在 Vault 创建 navigation_sync_token，令牌与服务函数 scheduler-config.json 中的 SHA256 对应。
-- 实际令牌不可提交到仓库。可通过本机 private/sync-token.txt 备份恢复。
select cron.schedule('navigation-source-daily', '30 2 * * *', $job$
  select net.http_post(
    url := 'https://awdvpgpldqprkbjdvlaq.supabase.co/functions/v1/navigation-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-token',
      (select decrypted_secret from vault.decrypted_secrets where name = 'navigation_sync_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
$job$);
-- 暂停：select cron.unschedule('navigation-source-daily');
-- 查看：select jobname, schedule, active from cron.job;
-- 结果：select * from public.nav_sync_runs order by id desc limit 20;
