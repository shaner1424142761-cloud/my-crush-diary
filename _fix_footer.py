# one-off: remove broken tail from footer-quote.js
from pathlib import Path
p = Path(__file__).parent / "js/ui/footer-quote.js"
s = p.read_text(encoding="utf-8")
needle = "\n        { text: '从别后，忆相逢，几回魂梦与君同。', cite: '晏几道《鹧鸪天》' },\n        PLACEHOLDER_REMOVE_BULK"
cut = s.find(needle)
j = s.find("    var pick =")
if cut < 0 or j < 0:
    raise SystemExit(f"markers not found cut={cut} j={j}")
out = s[:cut] + "\n    ];\n\n    " + s[j:]
p.write_text(out, encoding="utf-8")
print("fixed, len", len(out))
