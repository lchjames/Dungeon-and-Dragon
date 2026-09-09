from pathlib import Path

# New Story Script gateway is now the actual Wrangler entry point. Update only
# contracts that assert that exact top-level main property; do not touch
# downstream runtime-object gateway chain assertions.
old = r'^\s*"main"\s*:\s*"\.\/src\/runtime-object-gateway\.js"\s*,?\s*$'
new = r'^\s*"main"\s*:\s*"\.\/src\/story-script-gateway\.js"\s*,?\s*$'
changed = []
for path in sorted(Path('tests').glob('*.mjs')):
    text = path.read_text()
    if old in text:
        text = text.replace(old, new)
        path.write_text(text)
        changed.append(str(path))

if not changed:
    raise SystemExit('No stale top-level Wrangler main assertions found')

# The compiler owns the 24k size limit. The HTTP gateway must not silently
# truncate source before compilation, because that could publish a different
# Event than the GM submitted.
gateway = Path('src/story-script-gateway.js')
text = gateway.read_text()
old_compile = """function compileBody(body) {\n  const source = cleanText(body?.script, 24000);\n  if (!source) throw Object.assign(new Error('Story script is required.'), { status: 400, code: 'STORY_SCRIPT_EMPTY' });\n  try {\n    return { source, compiled: compileStoryScript(source) };\n"""
new_compile = """function compileBody(body) {\n  const source = String(body?.script ?? '').replace(/\\r\\n?/g, '\\n');\n  if (!source.trim()) throw Object.assign(new Error('Story script is required.'), { status: 400, code: 'STORY_SCRIPT_EMPTY' });\n  try {\n    return { source, compiled: compileStoryScript(source) };\n"""
if old_compile not in text:
    raise SystemExit('Story Script compileBody truncation anchor missing')
text = text.replace(old_compile, new_compile, 1)
gateway.write_text(text)

print('Updated top-level Wrangler assertions:')
for path in changed:
    print(f'- {path}')
print('- src/story-script-gateway.js: removed pre-compiler truncation')
