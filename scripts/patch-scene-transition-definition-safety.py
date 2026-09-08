from pathlib import Path

path = Path('src/scene-transition-definition.js')
text = path.read_text(encoding='utf-8')

anchor = "} from './story-event-rules.js';\n"
addition = anchor + "import { ensureRuntimeSceneTransitionSchema } from './runtime-scene-transition.js';\n"
assert text.count(anchor) == 1
text = text.replace(anchor, addition, 1)

anchor = """export async function ensureSceneTransitionDefinitionSchema(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  if (!schemaPromise) {
"""
replacement = """export async function ensureSceneTransitionDefinitionSchema(env) {
  if (!env?.DB) throw new Error('D1 binding DB is unavailable.');
  await ensureRuntimeSceneTransitionSchema(env);
  if (!schemaPromise) {
"""
assert text.count(anchor) == 1
text = text.replace(anchor, replacement, 1)
path.write_text(text, encoding='utf-8')
