#!/usr/bin/env python3
"""Render one offline checklist page from reviewed JSON; Python standard library only.

Layers such as a UAT guide import this file, add their own validation, and pass a
pattern extension script and a storage prefix to build().
"""
import argparse
import base64
import copy
import html
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

sys.dont_write_bytecode = True  # keep installed skill folders free of __pycache__
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))
import flavour  # noqa: E402

RISKS = ('high', 'med', 'low')
DETAIL_TEXT = ('data', 'expect', 'failure', 'why')
DETAIL_LISTS = ('how', 'cleanup')


def extract(file):
    """Return the content JSON embedded in an earlier page."""
    text = Path(file).read_text()
    match = re.search(r'<script\b[^>]*\bid="guide-data"[^>]*>(.*?)</script>', text, re.S)
    if not match:
        raise ValueError('Source page has no guide-data JSON script')
    return json.loads(match.group(1))


def rows(data):
    return [step for area in data['outcomes'] for step in area['steps']]


def commands(data):
    """Every command in content, in page order: helpers first, then procedure items."""
    found = [h['code'] for h in data.get('helpers', [])]

    def walk(items):
        for item in items or []:
            if isinstance(item, dict):
                if item.get('command') is not None:
                    found.append(item['command'])
                walk(item.get('steps'))
    walk(data.get('walkNotes'))
    for area in data['outcomes']:
        walk(area.get('setupPoints'))
        for step in area['steps']:
            walk(step.get('detail', {}).get('how'))
            walk(step.get('detail', {}).get('cleanup'))
    return found


def check_procedure(items, where):
    assert isinstance(items, list) and items, f'Empty procedure: {where}'
    for item in items:
        assert isinstance(item, dict) and str(item.get('lead', '')).strip(), f'Procedure item needs a lead: {where}'
        has = [k for k in ('text', 'steps', 'command') if item.get(k)]
        assert has, f"Procedure item needs text, steps or command: {where} / {item['lead']}"
        if item.get('command') is not None:
            assert isinstance(item['command'], str) and item['command'].strip(), f'Empty command: {where}'
        if item.get('steps'):
            check_procedure(item['steps'], where)


def validate(data, origin=None):
    """Generic checks for every checklist page; returns the flat list of checks."""
    assert str(data.get('title', '')).strip(), 'Missing title'
    assert data.get('outcomes'), 'Content has no areas'
    steps = rows(data)
    assert steps, 'Content has no checks'
    ids = [str(s['n']) for s in steps]
    assert len(ids) == len(set(ids)), 'Duplicate check IDs'
    assert all(re.fullmatch(r'[A-Za-z0-9-]+', n) for n in ids), 'Use plain letters, digits and hyphens for IDs'
    base = data.get('baseUrl', '').rstrip('/')
    if origin:
        expected = urlsplit(origin)
        assert expected.scheme == 'https' and expected.netloc, 'Expected origin must be HTTPS'
        assert base == origin.rstrip('/'), 'Wrong base URL'
    for area in data['outcomes']:
        for field in ('key', 'heading', 'risk'):
            assert str(area.get(field, '')).strip(), f"Area needs {field}: {area.get('heading')}"
        assert area['risk'] in RISKS, f"Risk must be high, med or low: {area['heading']}"
        assert area.get('steps'), f"Area has no checks: {area['heading']}"
        if area.get('setupPoints'):
            check_procedure(area['setupPoints'], area['heading'] + ' setup')
    for step in steps:
        n = step['n']
        for field in ('displayAction', 'displayMust'):
            assert str(step.get(field, '')).strip(), f'Missing {field}: {n}'
        if step.get('route') is not None:
            route = step['route'].removeprefix('<base>')
            assert base, f'Check {n} has a route but content has no baseUrl'
            assert route.startswith('/') and not route.startswith('//'), f'Invalid route: {n}'
            link = urlsplit(base + route)
            assert (link.scheme, link.netloc) == urlsplit(base)[:2], f'Wrong origin: {n}'
        detail = step.get('detail', {})
        for field in DETAIL_TEXT:
            if field in detail:
                assert len(detail[field].strip()) >= 20, f'Missing substantive {field}: {n}'
        for field in DETAIL_LISTS:
            if field in detail:
                check_procedure(detail[field], f'{n} {field}')
        if 'changes' in step:
            assert step['changes'] is True or step['changes'] is False or (isinstance(step['changes'], str) and step['changes'].strip()), f'changes must be true, false or a label: {n}'
        if 'later' in step:
            assert isinstance(step['later'], str) and step['later'].strip(), f'later must say when the check runs: {n}'
        if step.get('screenshot'):
            assert step['screenshot'] in data.get('screenshots', {}), f'Unknown screenshot: {n}'
    if data.get('walkNotes'):
        check_procedure(data['walkNotes'], 'walkNotes')
    for helper in data.get('helpers', []):
        assert helper.get('label') and isinstance(helper.get('code'), str), 'Helpers need a label and code'
    legend = data.get('riskLegend', {})
    assert isinstance(legend, dict) and set(legend) <= set(RISKS), 'riskLegend keys are high, med and low'
    assert sum(len(o.get('diagrams', [])) for o in data['outcomes']) <= 1, 'Keep at most one useful diagram'
    return steps


def pack(data, source_dir):
    """Copy content and embed screenshot files as PNG data URIs."""
    packed = copy.deepcopy(data)
    for shot in packed.get('screenshots', {}).values():
        for key in ('source', 'caption', 'alt', 'date'):
            assert shot.get(key), f'Screenshot requires {key}'
        assert re.fullmatch(r'\d{4}-\d{2}-\d{2}', shot['date']), 'Screenshot date must be YYYY-MM-DD'
        if shot.get('path'):
            file = Path(shot.pop('path'))
            if not file.is_absolute():
                file = Path(source_dir) / file
            content = file.read_bytes()
            assert content.startswith(b'\x89PNG\r\n\x1a\n'), 'Screenshots must be PNG'
            shot['data'] = 'data:image/png;base64,' + base64.b64encode(content).decode()
        assert re.fullmatch(r'data:image/png;base64,[A-Za-z0-9+/=]+', shot.get('data', '')), 'Screenshot must be embedded PNG'
    return packed


def build(data, source_dir, extension='', storage='html-flavour', forbid_hosts=()):
    """Return the complete page as a string."""
    assert '</script' not in extension.lower(), 'Extension must not close its script element'
    faces, licences = flavour.fonts()
    page = (HERE / 'template.html').read_text()
    for token, value in (('__GUIDE_FONTS__', faces), ('__FLAVOUR_CSS__', flavour.css()), ('__FLAVOUR_JS__', flavour.js()),
                         ('__GUIDE_FONT_LICENSE__', flavour.script_json(licences)), ('__STORAGE_PREFIX__', html.escape(storage)),
                         ('__PATTERN_EXTENSION__', extension or '/* none */'),
                         ('__GUIDE_TITLE__', html.escape(data.get('pageTitle') or data['title']))):
        page = page.replace(token, value)
    assert '__GUIDE_DATA__' in page and not re.search(r'__(GUIDE|FLAVOUR|PATTERN|STORAGE)_(?!DATA__)', page), 'Unfilled template token'
    output = page.replace('__GUIDE_DATA__', flavour.script_json(pack(data, source_dir)))
    for forbidden in forbid_hosts:
        assert forbidden not in output, f'Forbidden hostname: {forbidden}'
    return output


def report(steps, output, path, data):
    with_shot = [str(s['n']) for s in steps if s.get('screenshot')]
    without = [str(s['n']) for s in steps if not s.get('screenshot')]
    print(f'{len(steps)} checks; {len(commands(data))} command boxes; {len(output.encode()):,} bytes; output: {path}')
    print('Screenshot references: ' + ', '.join(with_shot))
    print('No screenshot: ' + ', '.join(without))
    if warning := flavour.title_warning(data.get('pageTitle') or data['title']):
        print('WARN ' + warning)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    e = sub.add_parser('extract', help='Copy embedded JSON from an earlier page')
    e.add_argument('html'); e.add_argument('output')
    r = sub.add_parser('render', help='Validate reviewed content and render the offline page')
    r.add_argument('data'); r.add_argument('output')
    r.add_argument('--origin', help='HTTPS origin that every check link must use')
    r.add_argument('--storage', default='html-flavour', help='localStorage prefix for theme and results')
    r.add_argument('--forbid-host', action='append', default=[])
    args = parser.parse_args()
    if args.command == 'extract':
        Path(args.output).write_text(json.dumps(extract(args.html), ensure_ascii=False, indent=2) + '\n')
        return
    source = Path(args.data).resolve()
    data = json.loads(source.read_text())
    steps = validate(data, args.origin)
    output = build(data, source.parent, storage=args.storage, forbid_hosts=args.forbid_host)
    Path(args.output).write_text(output)
    report(steps, output, args.output, data)


if __name__ == '__main__':
    main()
