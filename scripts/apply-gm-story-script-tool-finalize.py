from pathlib import Path

html = Path('public/gm/index.html')
text = html.read_text()
needle = '  <script type="module" src="/assets/gm-attack-profiles.js"></script>\n'
insert = needle + '  <script type="module" src="/assets/gm-story-script-tool.js"></script>\n'
if 'gm-story-script-tool.js' not in text:
    if needle not in text:
        raise SystemExit('GM module insertion anchor missing')
    text = text.replace(needle, insert, 1)
html.write_text(text)

contract = Path('tests/deployment-contract.test.mjs')
text = contract.read_text()
old = "  /^\\s*\"main\"\\s*:\\s*\"\\.\\/src\\/runtime-object-gateway\\.js\"\\s*,?\\s*$/m,"
new = "  /^\\s*\"main\"\\s*:\\s*\"\\.\\/src\\/story-script-gateway\\.js\"\\s*,?\\s*$/m,"
if old not in text:
    raise SystemExit('Deployment Wrangler main assertion anchor missing')
text = text.replace(old, new, 1)
contract.write_text(text)
