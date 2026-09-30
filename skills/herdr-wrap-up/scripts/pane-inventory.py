#!/usr/bin/env python3
"""Read-only inventory of every Herdr pane, one TSV row per pane.

Columns: pane, workspace, tab, tab_label, label, kind, name, status, session,
rss_mb, foreground, input, cwd, title.

`input` classifies the pane's input box from its visible screen:
  empty        nothing typed
  suggestion   Claude Code's greyed (dim) suggestion, not user text
  placeholder  Codex / Cursor placeholder, not user text
  TEXT: ...    typed-but-unsent text at normal brightness: keep the pane
  ?: ...       not recognised (a dialog, another CLI): read the pane yourself

It only runs `herdr ... list`, `herdr pane process-info`, `herdr pane read
--source visible` and `ps`. It changes nothing. Proven on Herdr 0.9.1 with the
Claude Code, Codex and Cursor Agent screens of September 2026; after any of
those CLIs changes its input box, check a few rows by eye.

Usage: pane-inventory.py [--workspace <id>] > panes.tsv
"""

import json
import re
import subprocess
import sys

SGR = re.compile(r"\x1b\[([0-9;:]*)m")
OTHER_ESC = re.compile(r"\x1b\[[0-9;?]*[A-Za-ln-z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)")
RULE_CHAR = "─"
PROMPT_ONLY = {"❯", "$", "%", "#", ">", "›"}


def herdr(*args):
    out = subprocess.run(["herdr", *args], capture_output=True, text=True)
    if out.returncode != 0:
        return None
    return out.stdout


def herdr_json(*args):
    raw = herdr(*args)
    try:
        return json.loads(raw) if raw else None
    except json.JSONDecodeError:
        return None


def cells(line):
    """Printable characters of one ANSI line, each as (char, dim, reverse)."""
    line = OTHER_ESC.sub("", line)
    out, dim, rev, pos = [], False, False, 0
    for m in SGR.finditer(line):
        out.extend((ch, dim, rev) for ch in line[pos:m.start()])
        params = [p for p in re.split(r"[;:]", m.group(1))] or ["0"]
        i = 0
        while i < len(params):
            p = params[i] or "0"
            if p in ("38", "48", "58") and i + 1 < len(params):
                i += 5 if params[i + 1] == "2" else 3 if params[i + 1] == "5" else 1
                continue
            if p == "0":
                dim = rev = False
            elif p == "2":
                dim = True
            elif p == "22":
                dim = False
            elif p == "7":
                rev = True
            elif p == "27":
                rev = False
            i += 1
        pos = m.end()
    out.extend((ch, dim, rev) for ch in line[pos:])
    return out


def text(cs):
    return "".join(c for c, _, _ in cs)


def classify_box(box_cells, glyphs):
    """Classify the cells after the prompt glyph: empty, dim-only, or user text."""
    body = [c for c in box_cells if c[0] not in glyphs]
    visible = [c for c in body if not c[0].isspace() and c[0] != "\xa0"]
    if not visible:
        return "empty", ""
    typed = [c for c in visible if not c[1] and not c[2]]
    shown = text(body).strip()
    if not typed:
        return "dim", shown
    return "text", shown


def classify(kind, screen):
    lines = screen.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    rows = [cells(l) for l in lines]
    plain = [text(r) for r in rows]
    nonblank = [i for i, t in enumerate(plain) if t.strip()]
    last = plain[nonblank[-1]].strip() if nonblank else ""

    if kind == "claude":
        rules = [i for i, t in enumerate(plain)
                 if len(t.strip()) >= 10 and set(t.strip()) == {RULE_CHAR}]
        if len(rules) < 2:
            return "?: no input box (dialog or scrolled): " + last[:60]
        box = [c for r in rows[rules[-2] + 1:rules[-1]] for c in r]
        state, shown = classify_box(box, {"❯"})
        return {"empty": "empty", "dim": "suggestion"}.get(state, "TEXT: " + shown[:80])

    if kind == "codex":
        idx = [i for i, t in enumerate(plain) if t.strip().startswith("›")]
        if not idx:
            return "?: no composer line: " + last[:60]
        state, shown = classify_box(rows[idx[-1]], {"›"})
        return {"empty": "empty", "dim": "placeholder"}.get(state, "TEXT: " + shown[:80])

    if kind == "cursor":
        idx = [i for i, t in enumerate(plain) if t.strip().startswith("→")]
        if not idx:
            return "?: no composer line: " + last[:60]
        state, shown = classify_box(rows[idx[-1]], {"→"})
        if state == "dim" or shown == "Add a follow-up":
            return "placeholder"
        return "empty" if state == "empty" else "TEXT: " + shown[:80]

    if kind is None:
        if last in PROMPT_ONLY:
            return "empty"
        if last[:1] in PROMPT_ONLY:
            return "TEXT: " + last[1:].strip()[:80]
        return "?: shell shows: " + last[:60]

    return "?: " + str(kind) + " not recognised: " + last[:60]


def rss_by_root():
    """Map pid -> (ppid, rss_kb) from one ps snapshot."""
    out = subprocess.run(["ps", "-axo", "pid=,ppid=,rss="], capture_output=True, text=True).stdout
    procs = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            procs[int(parts[0])] = (int(parts[1]), int(parts[2]))
    return procs


def tree_rss_kb(procs, roots):
    children = {}
    for pid, (ppid, _) in procs.items():
        children.setdefault(ppid, []).append(pid)
    seen, stack = set(), [r for r in roots if r in procs]
    while stack:
        pid = stack.pop()
        if pid in seen:
            continue
        seen.add(pid)
        stack.extend(children.get(pid, []))
    return sum(procs[p][1] for p in seen)


def main():
    ws_filter = None
    if len(sys.argv) == 3 and sys.argv[1] == "--workspace":
        ws_filter = sys.argv[2]
    elif len(sys.argv) != 1:
        sys.exit(__doc__)

    panes = (herdr_json("pane", "list") or {}).get("result", {}).get("panes", [])
    agents = {a["pane_id"]: a for a in
              (herdr_json("agent", "list") or {}).get("result", {}).get("agents", [])}
    workspaces = (herdr_json("workspace", "list") or {}).get("result", {}).get("workspaces", [])
    tab_labels = {}
    for w in workspaces:
        tabs = (herdr_json("tab", "list", "--workspace", w["workspace_id"]) or {})
        for t in tabs.get("result", {}).get("tabs", []):
            tab_labels[t["tab_id"]] = t.get("label") or ""
    procs = rss_by_root()

    cols = ["pane", "workspace", "tab", "tab_label", "label", "kind", "name", "status",
            "session", "rss_mb", "foreground", "input", "cwd", "title"]
    print("\t".join(cols))
    for p in panes:
        pid = p["pane_id"]
        if ws_filter and p.get("workspace_id") != ws_filter:
            continue
        a = agents.get(pid, {})
        kind = p.get("agent")
        info = (herdr_json("pane", "process-info", "--pane", pid) or {}) \
            .get("result", {}).get("process_info", {})
        fg = info.get("foreground_processes") or []
        roots = [info.get("shell_pid")] + [f.get("pid") for f in fg]
        rss_mb = round(tree_rss_kb(procs, [r for r in roots if r]) / 1024)
        screen = herdr("pane", "read", pid, "--source", "visible", "--format", "ansi") or ""
        row = [
            pid,
            p.get("workspace_id", ""),
            p.get("tab_id", ""),
            tab_labels.get(p.get("tab_id"), ""),
            p.get("label") or "",
            kind or "shell",
            a.get("name") or "",
            p.get("agent_status") or "",
            (p.get("agent_session") or {}).get("value") or "",
            str(rss_mb),
            ",".join(f.get("argv0", "") for f in fg),
            classify(kind, screen),
            p.get("cwd") or "",
            p.get("terminal_title_stripped") or "",
        ]
        print("\t".join(c.replace("\t", " ").replace("\n", " ") for c in row))


if __name__ == "__main__":
    main()
