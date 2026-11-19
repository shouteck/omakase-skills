import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const errors = [];
const fail = (message) => errors.push(message);
const read = (path) => readFileSync(join(root, path), 'utf8');
const json = (path) => {
  try {
    return JSON.parse(read(path));
  } catch (error) {
    fail(`${path}: ${error.message}`);
    return {};
  }
};

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const skillsDir = join(root, 'skills');
const skills = readdirSync(skillsDir).filter((entry) => statSync(join(skillsDir, entry)).isDirectory());
if (skills.length === 0) fail('skills/: no skill folders');

for (const dir of skills) {
  const path = `skills/${dir}/SKILL.md`;
  let text;
  try {
    text = read(path);
  } catch {
    fail(`${path}: missing`);
    continue;
  }
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    fail(`${path}: no YAML frontmatter`);
    continue;
  }
  const fields = Object.fromEntries(
    match[1].split('\n').map((line) => {
      const at = line.indexOf(':');
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
  );
  const { name = '', description = '' } = fields;
  if (!NAME.test(name) || name.length > 64) fail(`${path}: name "${name}" must be lowercase letters, digits and hyphens, at most 64 characters`);
  if (name !== dir) fail(`${path}: name "${name}" must match its folder "${dir}"`);
  if (!description) fail(`${path}: description is empty`);
  if (description.length > 1024) fail(`${path}: description is ${description.length} characters; the limit is 1024`);
  if (/[<>]/.test(description)) fail(`${path}: description must not contain angle brackets`);
  if (!text.slice(match[0].length).trim()) fail(`${path}: body is empty`);
}

const plugin = json('.claude-plugin/plugin.json');
const marketplace = json('.claude-plugin/marketplace.json');
if (!NAME.test(plugin.name ?? '')) fail('.claude-plugin/plugin.json: invalid name');
if (plugin.license !== 'MIT-0') fail('.claude-plugin/plugin.json: license must be MIT-0');
for (const path of plugin.skills ?? []) {
  try {
    if (!statSync(join(root, path)).isDirectory()) fail(`.claude-plugin/plugin.json: skills path ${path} is not a folder`);
  } catch {
    fail(`.claude-plugin/plugin.json: skills path ${path} does not exist`);
  }
}
if (!NAME.test(marketplace.name ?? '')) fail('.claude-plugin/marketplace.json: invalid name');
const listed = (marketplace.plugins ?? []).find((entry) => entry.name === plugin.name);
if (!listed) fail(`.claude-plugin/marketplace.json: does not list plugin "${plugin.name}"`);
else if (listed.source !== '.' && listed.source !== './') fail('.claude-plugin/marketplace.json: plugin source must be the repository root');

if (!read('LICENSE').startsWith('MIT No Attribution')) fail('LICENSE: must be MIT No Attribution (MIT-0)');

if (errors.length) {
  for (const error of errors) console.error(`validate: ${error}`);
  process.exit(1);
}
console.log(`validate: ${skills.length} skill(s) and manifests OK`);
