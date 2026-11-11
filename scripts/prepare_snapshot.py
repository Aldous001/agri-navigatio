"""Build a private snapshot from the public index and reviewed model catalogue."""
import argparse
import json
from pathlib import Path
import re
from urllib.request import urlopen


def normalize(value):
    return re.sub(r'\s+', '', value).replace('（', '(').replace('）', ')')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--catalog', required=True, type=Path)
    parser.add_argument('--output', default='private/snapshot.json', type=Path)
    args = parser.parse_args()
    catalog = json.loads(args.catalog.read_text(encoding='utf-8-sig'))
    raw = urlopen('https://sky9606.github.io/agri-subsidy-dashboard/data.js', timeout=90).read().decode('utf-8-sig')
    data = json.loads(raw.split('=', 1)[1].strip().rstrip(';'))
    index = {row[0]: row for row in data['search']['m']}
    models = []
    for reviewed in catalog['sheets']['导航名单']:
        factory, model, raw_factory = reviewed[:3]
        row = index.get(model)
        if row is None or normalize(row[1]) != normalize(raw_factory):
            continue
        models.append({
            'factory': factory, 'model': model, 'quantity': row[2],
            'amount': row[3], 'averagePrice': round(row[3]/row[2],2) if row[2] else 0,
            'provinceCount': row[6], 'sourceFactory': row[1],
            'yearly': dict(zip(map(str, data['meta']['years']), row[4])),
            'regions': [{'name': data['meta']['units'][province], 'quantity': quantity} for province, quantity in row[5]],
            'sourceTitle': reviewed[5], 'sourceUrl': reviewed[7], 'note': reviewed[8]
        })
    if not models:
        raise RuntimeError('没有匹配到核实型号，保留现有快照。')
    # Whitespace-only model aliases share one aggregate in the upstream index.
    seen = set()
    unique = []
    for model in models:
        key = normalize(model['model'])
        if key not in seen:
            unique.append(model)
            seen.add(key)
    payload = {
        'generated': data['meta']['generated'], 'verifiedDate': '2026-11-03',
        'years': data['meta']['years'], 'models': unique,
        'quantityLabel': '网站按型号汇总，含该型号各厂家记录',
        'notice': '仅纳入已有导航类别依据且厂家对应的型号。台套数沿用原站型号汇总口径。',
        'sourceNote': '省份图按原站每型号公开的主要省份汇总，未覆盖全部省份。纯空格差异型号已合并。数据源为 sky9606/agri-subsidy-dashboard。'
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    temporary.replace(args.output)
    print(f'已生成 {len(unique)} 个型号的私有快照，来源时间 {payload["generated"]}')


if __name__ == '__main__':
    main()
