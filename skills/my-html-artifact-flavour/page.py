#!/usr/bin/env python3
"""Wrap a hand-written HTML body in a complete offline flavour page; Python standard library only.

The body fragment holds the page content (normally one <main class="wrap">). This script adds
the CSP, the embedded fonts and licences, the foundation CSS and behaviours, and a top bar with
the page name, the theme switch and, when the body has disclosures, Expand all / Collapse all.
"""
import argparse
import html
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # keep installed skill folders free of __pycache__
import flavour  # noqa: E402

TEMPLATE = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="{csp}">
<meta name="flavour-storage" content="{storage}">
<title>{title}</title>
<style>
{fonts}
{css}
{extra_css}
</style>
<script>{theme}</script>
<script id="font-license" type="application/json">{licences}</script>
<script>{js}</script>
<script>document.addEventListener('DOMContentLoaded',function(){{window.Flavour.enhance(document);}});</script>
</head>
<body>
<div class="bar"><div class="wrap"><span class="bar-title">{title}</span><label class="theme-control">Theme <select id="theme" aria-label="Theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>{folds}</div></div>
{body}
</body>
</html>
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('body', help='HTML fragment for the page body')
    parser.add_argument('output')
    parser.add_argument('--title', required=True, help='Page name of two to four words')
    parser.add_argument('--css', help='Extra page CSS that uses the foundation tokens')
    parser.add_argument('--storage', default='html-flavour', help='localStorage prefix for the theme choice')
    parser.add_argument('--forbid-host', action='append', default=[])
    args = parser.parse_args()
    body = Path(args.body).read_text()
    assert not re.search(r'<(script|link|iframe|object|embed)\b', body, re.I), 'Keep scripts and external resources out of the body'
    assert not re.search(r'\ssrc=["\'](?!data:)', body, re.I), 'Embed images as data URIs'
    faces, licences = flavour.fonts()
    folds = ('<button id="expand" type="button">Expand all</button><button id="collapse" type="button">Collapse all</button>'
             if 'data-persist' in body else '')
    output = TEMPLATE.format(csp=flavour.CSP, storage=html.escape(args.storage), title=html.escape(args.title), fonts=faces,
                             css=flavour.css(), extra_css=Path(args.css).read_text() if args.css else '',
                             theme=flavour.theme_script(), licences=flavour.script_json(licences), js=flavour.js(),
                             folds=folds, body=body)
    for host in args.forbid_host:
        assert host not in output, f'Forbidden hostname: {host}'
    Path(args.output).write_text(output)
    print(f'{len(output.encode()):,} bytes; output: {args.output}')
    if warning := flavour.title_warning(args.title):
        print('WARN ' + warning)
    low = [r for r in flavour.contrast_report(output) if r[3] < 4.5]
    print('Contrast: all token pairs >= 4.5:1' if not low else 'Contrast below 4.5:1: ' + ', '.join(f'{t} {a}/{b} {r:.2f}' for t, a, b, r in low))
    return 1 if low else 0


if __name__ == '__main__':
    sys.exit(main())
