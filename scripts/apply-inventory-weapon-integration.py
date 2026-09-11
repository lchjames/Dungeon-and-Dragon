from pathlib import Path

changed = []

# Fix Weapon Definition compatibility mirror: character_inventory has no
# updated_at column in the platform table, so all three Definition updates must
# stay in the same successful D1 batch without a failing compatibility probe.
path = Path('src/inventory-weapon-authority.js')
text = path.read_text()
old = """    env.DB.prepare(`UPDATE character_inventory SET name = ?, updated_at = COALESCE(updated_at, ?)\n      WHERE item_definition_id = ? AND custom_name IS NULL`).bind(value.name, now, itemId)\n  ]).catch(async error => {\n    // Older compatibility tables do not have updated_at. Retry the display mirror only.\n    if (!String(error?.message || error).includes('updated_at')) throw error;\n    await env.DB.prepare('UPDATE character_inventory SET name = ? WHERE item_definition_id = ? AND custom_name IS NULL').bind(value.name, itemId).run();\n  });"""
new = """    env.DB.prepare(`UPDATE character_inventory SET name = ?\n      WHERE item_definition_id = ? AND custom_name IS NULL`).bind(value.name, itemId)\n  ]);"""
if old not in text:
    raise SystemExit('Inventory authority Definition mirror patch anchor missing')
path.write_text(text.replace(old, new, 1))
changed.append(str(path))

# Load dedicated GM and Player Inventory surfaces without coupling them to the
# old Attack Profile or Character-detail renderers.
path = Path('public/gm/index.html')
text = path.read_text()
needle = '  <script type="module" src="/assets/gm-attack-profiles.js"></script>\n'
insert = needle + '  <script type="module" src="/assets/gm-inventory-weapons.js"></script>\n'
if 'gm-inventory-weapons.js' not in text:
    if needle not in text:
        raise SystemExit('GM Inventory module insertion anchor missing')
    text = text.replace(needle, insert, 1)
path.write_text(text)
changed.append(str(path))

path = Path('public/player/index.html')
text = path.read_text()
needle = '  <script type="module" src="/assets/player.js"></script>\n'
insert = needle + '  <script type="module" src="/assets/player-inventory-weapons.js"></script>\n'
if 'player-inventory-weapons.js' not in text:
    if needle not in text:
        raise SystemExit('Player Inventory module insertion anchor missing')
    text = text.replace(needle, insert, 1)
text = text.replace('Quantity can be updated by the player', 'Canonical Item ownership / Weapon equipment')
path.write_text(text)
changed.append(str(path))

# Inventory / Weapon is a thin new top-level gateway over Story Script and the
# existing Runtime chain.
path = Path('wrangler.jsonc')
text = path.read_text()
old_main = '  "main": "./src/story-script-gateway.js",\n'
new_main = '  "main": "./src/inventory-weapon-gateway.js",\n'
if old_main not in text:
    raise SystemExit('Wrangler Story Script main anchor missing')
text = text.replace(old_main, new_main, 1)
marker = '// Delegated downstream contracts: '
if marker not in text:
    raise SystemExit('Wrangler delegated chain marker missing')
if '"main": "./src/inventory-weapon-gateway.js"' not in text.split('\n', 5)[3]:
    text = text.replace(marker, marker + '"main": "./src/inventory-weapon-gateway.js", ', 1)
path.write_text(text)
changed.append(str(path))

# Production safety aggregate remains plan-only unless the operator explicitly
# supplies execute=1 + GM credentials.
path = Path('scripts/production-alpha-e2e.mjs')
text = path.read_text()
needle = "  runComponent('Production GM Story Script Tool E2E', './production-alpha-story-script-tool-e2e.mjs');\n"
insert = needle + "  runComponent('Production Inventory / Weapon Foundation E2E', './production-alpha-inventory-weapon-e2e.mjs');\n"
if 'production-alpha-inventory-weapon-e2e.mjs' not in text:
    if needle not in text:
        raise SystemExit('Production aggregate runner insertion anchor missing')
    text = text.replace(needle, insert, 1)
needle_component = "      'gm-story-script-tool',\n"
insert_component = needle_component + "      'inventory-weapon-foundation',\n"
if "'inventory-weapon-foundation'" not in text:
    if needle_component not in text:
        raise SystemExit('Production aggregate component insertion anchor missing')
    text = text.replace(needle_component, insert_component, 1)
path.write_text(text)
changed.append(str(path))

# Update only contracts that assert the exact top-level Wrangler main property.
old = r'^\s*"main"\s*:\s*"\.\/src\/story-script-gateway\.js"\s*,?\s*$'
new = r'^\s*"main"\s*:\s*"\.\/src\/inventory-weapon-gateway\.js"\s*,?\s*$'
contract_changes = []
for test in sorted(Path('tests').glob('*.mjs')):
    body = test.read_text()
    if old in body:
        test.write_text(body.replace(old, new))
        contract_changes.append(str(test))
        changed.append(str(test))

if not contract_changes:
    raise SystemExit('No stale Story Script top-level Wrangler assertions found')

print('Inventory / Weapon integration patched:')
for item in changed:
    print(f'- {item}')
