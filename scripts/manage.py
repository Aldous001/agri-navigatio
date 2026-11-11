"""Local owner operations. Secrets are read from environment or hidden input."""
import argparse
from datetime import datetime, timezone
from getpass import getpass
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['upload', 'create-user', 'disable-user'])
    parser.add_argument('--snapshot', type=Path, default=Path('private/snapshot.json'))
    parser.add_argument('--email')
    parser.add_argument('--user-id')
    args = parser.parse_args()
    base = os.environ.get('SUPABASE_URL') or input('Supabase 项目 URL > ').strip()
    if not base.startswith('https://') or not base.endswith('.supabase.co'):
        raise ValueError('请使用项目提供的 https://项目编号.supabase.co 地址。')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or getpass('项目服务端密钥（隐藏输入）> ')

    def api(path, method, body):
        request = Request(base + path, method=method, data=json.dumps(body).encode('utf-8'), headers={
            'apikey': key, 'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates'
        })
        try:
            with urlopen(request, timeout=60) as response:
                return json.loads(response.read() or b'null')
        except HTTPError as error:
            # Never print response bodies which can contain submitted data.
            raise RuntimeError(f'服务返回 HTTP {error.code}，请核对项目配置和操作权限。') from None

    if args.operation == 'upload':
        payload = json.loads(args.snapshot.read_text(encoding='utf-8-sig'))
        if not payload.get('models'):
            raise ValueError('快照没有型号，停止上传。')
        api('/rest/v1/nav_snapshots?on_conflict=id', 'POST', {
            'id': 'current', 'payload': payload, 'updated_at': datetime.now(timezone.utc).isoformat()
        })
        print('快照上传成功。')
    elif args.operation == 'create-user':
        email = args.email or input('用户邮箱 > ').strip()
        password = getpass('初始密码（至少6位）> ')
        if len(password) < 6:
            raise ValueError('密码至少6位。')
        user = api('/auth/v1/admin/users', 'POST', {'email': email, 'password': password, 'email_confirm': True})
        try:
            api('/rest/v1/nav_members?on_conflict=user_id', 'POST', {'user_id': user['id'], 'enabled': True})
        except RuntimeError:
            print('账号已创建，访问授权尚未完成。请在数据库 nav_members 表补充此用户 ID，再登录使用。')
            print(user['id'])
            raise
        print('账号已创建并授权。用户 ID ' + user['id'])
    else:
        user_id = args.user_id or input('需停用的用户 ID > ').strip()
        import uuid
        user_id = str(uuid.UUID(user_id))
        api('/rest/v1/nav_members?user_id=eq.' + user_id, 'PATCH', {'enabled': False})
        print('账号访问权限已停用。')


if __name__ == '__main__':
    main()
