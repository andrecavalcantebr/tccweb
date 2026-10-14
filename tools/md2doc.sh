#!/usr/bin/env bash
# Converte um .md do projeto em HTML ou PDF, com os diagramas mermaid
# renderizados de verdade.
#
#   tools/md2doc.sh docs/deploy-joomla.md            -> docs/deploy-joomla.html
#   tools/md2doc.sh docs/deploy-joomla.md pdf        -> docs/deploy-joomla.pdf
#   tools/md2doc.sh docs/diagrams/*.md pdf           -> um PDF por arquivo
#
# Requer: pandoc, google-chrome. O mermaid vem do CDN, então o PDF precisa de
# rede na primeira geração.
set -euo pipefail

FORMAT=html
ARGS=()
for a in "$@"; do
  case "$a" in
    pdf|html) FORMAT="$a" ;;
    *) ARGS+=("$a") ;;
  esac
done
[ ${#ARGS[@]} -gt 0 ] || { echo "uso: $0 <arquivo.md>... [html|pdf]" >&2; exit 1; }

DIR=$(mktemp -d); trap 'rm -rf "$DIR"' EXIT

cat > "$DIR/head.html" <<'EOF'
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  // O pandoc emite <pre class="mermaid"><code>…</code></pre> e o mermaid lê o
  // innerHTML: sem desembrulhar, as tags <code> entram no texto do diagrama.
  document.querySelectorAll('pre.mermaid > code').forEach(c => {
    c.parentElement.textContent = c.textContent;
  });
  await mermaid.run({ querySelector: 'pre.mermaid' });
</script>
<style>
  :root { color-scheme: light }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         max-width: 46em; margin: 0 auto; padding: 2.5em 1.5em; line-height: 1.6;
         color: #1a1a1a; background: #fff }
  h1, h2, h3 { line-height: 1.25; margin-top: 1.8em }
  h1 { border-bottom: 2px solid #0d6efd; padding-bottom: .3em }
  h2 { border-bottom: 1px solid #e0e0e0; padding-bottom: .2em }
  code { background: #f4f4f6; padding: .15em .35em; border-radius: 3px;
         font-size: .9em; font-family: ui-monospace, "Cascadia Code", Consolas, monospace }
  pre { background: #f7f7f9; border: 1px solid #e5e5e8; border-radius: 6px;
        padding: 1em; overflow-x: auto; line-height: 1.45 }
  pre code { background: none; padding: 0 }
  pre.mermaid { background: none; border: none; text-align: center }
  pre.mermaid svg { max-width: 100%; height: auto; max-height: 20cm }
  table { border-collapse: collapse; width: 100%; margin: 1.2em 0; font-size: .95em }
  th, td { border: 1px solid #ddd; padding: .5em .7em; text-align: left; vertical-align: top }
  th { background: #f4f4f6 }
  blockquote { border-left: 4px solid #0d6efd; margin: 1.2em 0; padding: .2em 1em;
               background: #f8f9fc; color: #333 }
  a { color: #0d6efd }
  hr { border: none; border-top: 1px solid #e0e0e0; margin: 2.5em 0 }
  @media print {
    body { max-width: none; padding: 0 }
    h1, h2, h3 { break-after: avoid }
    pre, table, blockquote { break-inside: avoid }
    a { color: #1a1a1a; text-decoration: none }
  }
</style>
EOF

for SRC in "${ARGS[@]}"; do
  BASE="${SRC%.md}"
  TITLE=$(sed -n 's/^# //p' "$SRC" | head -1)
  [ -n "$TITLE" ] || TITLE=$(basename "$BASE")

  pandoc "$SRC" -o "$DIR/page.html" --standalone --no-highlight \
    --variable pagetitle="$TITLE" --include-in-header="$DIR/head.html"

  if [ "$FORMAT" = html ]; then
    cp "$DIR/page.html" "$BASE.html"
    echo "$BASE.html"
  else
    google-chrome --headless --disable-gpu --no-sandbox \
      --user-data-dir="$DIR/chrome" --virtual-time-budget=20000 \
      --print-to-pdf="$BASE.pdf" --no-pdf-header-footer \
      "file://$DIR/page.html" >/dev/null 2>&1
    echo "$BASE.pdf"
  fi
done
