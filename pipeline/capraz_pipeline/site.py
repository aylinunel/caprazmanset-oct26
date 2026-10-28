"""Assemble the static site: one HTML page (styles, logo, loader, app scripts) + the data packs.

The page has no build-time data in it; everything the app shows comes from data/*.bin, so a new
build (older dates, a live run) only replaces the data folder.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from .config import REPO, SCORER

SITE = REPO / "site"


def assemble(data_dir: Path, dest: Path, title: str = "Çapraz Manşet 5.0", fragment: bool = False) -> Path:
    """fragment=True: no doctype/html/head/body wrapper (claude.ai artifacts add their own)."""
    rules = SCORER.read_text(encoding="utf-8")
    app = (SITE / "js" / "app.js").read_text(encoding="utf-8")
    assert "/*@@RULES@@*/" in app, "app.js lost its shared-rules marker"
    app = app.replace("/*@@RULES@@*/", rules)
    code = lambda s: s.replace("</script", "<\\/script")  # keep inline code from closing its tag
    html = "\n".join([
        "<!doctype html>", '<html lang="tr">', "<head>", '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
        f"<title>{title}</title>", (SITE / "head.html").read_text(encoding="utf-8"),
        "<style>", (SITE / "styles.css").read_text(encoding="utf-8"), "</style>", "</head>", "<body>",
        '<div id="app"></div>', '<div class="tip" id="tip"></div>',
        '<script type="application/json" id="cm-logo">' + (SITE / "logo.json").read_text(encoding="utf-8").strip() + "</script>",
        "<script>" + code((SITE / "js" / "loader.js").read_text(encoding="utf-8")) + "</script>",
        '<script type="text/x-cm">' + code((SITE / "js" / "turkish-layer.js").read_text(encoding="utf-8")) + "</script>",
        '<script type="text/x-cm">' + code(app) + "</script>",
        "</body>", "</html>", ""])
    if fragment:
        for tag in ("<!doctype html>", '<html lang="tr">', "<head>", "</head>", "<body>", "</body>", "</html>"):
            html = html.replace(tag + "\n", "", 1)
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "index.html").write_text(html, encoding="utf-8")
    if data_dir.resolve() != (dest / "data").resolve():
        shutil.copytree(data_dir, dest / "data", dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns("events-members.json", "report.json"))
    return dest / "index.html"
