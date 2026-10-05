"""Shared build helpers for my-html-artifact-flavour pages; Python standard library only.

Used by page.py and by every pattern renderer. Fonts come from fonts/manifest.json and
are checked against their SHA-256 before they are embedded as WOFF2 data URIs.
"""
import base64
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
FONT_NAMES = {'ibm-plex-sans': 'IBM Plex Sans', 'ibm-plex-serif': 'IBM Plex Serif', 'ibm-plex-mono': 'IBM Plex Mono'}
CSP = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; "
       "font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'")
# Text/background pairs that must reach 4.5:1 in both themes.
CONTRAST_PAIRS = [('text', 'bg'), ('muted', 'bg'), ('accent', 'bg'), ('text', 'surface'), ('muted', 'surface'),
                  ('risk-high', 'risk-high-bg'), ('risk-med', 'risk-med-bg'), ('risk-low', 'risk-low-bg'),
                  ('text', 'soft'), ('accent', 'soft'), ('risk-high', 'bg'), ('risk-med', 'bg')]


def fonts():
    """Return (@font-face CSS, licence map) for the four embedded faces."""
    font_dir = HERE / 'fonts'
    manifest = json.loads((font_dir / 'manifest.json').read_text())
    faces, licences = [], {}
    for font in manifest:
        raw = (font_dir / font['file']).read_bytes()
        assert raw[:4] == b'wOF2', f"Invalid WOFF2 file: {font['file']}"
        assert hashlib.sha256(raw).hexdigest() == font['sha256'], f"Font checksum changed: {font['file']}"
        uri = 'data:font/woff2;base64,' + base64.b64encode(raw).decode()
        faces.append('@font-face{font-family:"' + FONT_NAMES[font['family']] + '";font-style:normal;font-weight:'
                     + str(font['weight']) + ';font-display:swap;src:url("' + uri + '") format("woff2")}')
        licences[font['family']] = (font_dir / font['license']).read_text()
    assert len({f['weight'] for f in manifest}) <= 3, 'Use at most three weights'
    return '\n'.join(faces), licences


def css():
    return (HERE / 'foundation' / 'flavour.css').read_text()


def js():
    return (HERE / 'foundation' / 'flavour.js').read_text()


def script_json(value):
    """JSON that is safe inside a <script type="application/json"> element."""
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
            .replace('\u2028', '\\u2028').replace('\u2029', '\\u2029'))


def theme_script():
    """Restore the saved theme before first paint; the storage prefix comes from the flavour-storage meta tag."""
    return ("try{var m=document.querySelector('meta[name=\"flavour-storage\"]'),t=localStorage.getItem((m&&m.content||'html-flavour')+':theme');"
            "if(['system','light','dark'].includes(t))document.documentElement.dataset.theme=t;}catch(e){}")


def tokens(stylesheet):
    """Light and dark token maps from a stylesheet that contains the foundation CSS."""
    def block(pattern):
        match = re.search(pattern, stylesheet)
        found = dict(re.findall(r'--([\w-]+):(#[0-9a-fA-F]{3,6})(?=;|$)', match.group(1))) if match else {}
        return {k: '#' + ''.join(c * 2 for c in v[1:]) if len(v) == 4 else v for k, v in found.items()}
    return {'Light': block(r':root\{([^}]+)\}'), 'Dark': block(r':root\[data-theme="dark"\]\{([^}]+)\}')}


def contrast(a, b):
    def luminance(colour):
        rgb = [int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        rgb = [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in rgb]
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
    x, y = luminance(a), luminance(b)
    return (max(x, y) + .05) / (min(x, y) + .05)


def contrast_report(stylesheet):
    """List of (theme, foreground, background, ratio) for every required pair."""
    return [(theme, fg, bg, contrast(t[fg], t[bg])) for theme, t in tokens(stylesheet).items() for fg, bg in CONTRAST_PAIRS]


def title_warning(title):
    """The artifact page contract asks for a <title> of two to four words."""
    words = re.findall(r'[\w’\'-]+', title)
    return None if 2 <= len(words) <= 4 else f'<title> has {len(words)} words; the page contract asks for 2 to 4 (set pageTitle)'
