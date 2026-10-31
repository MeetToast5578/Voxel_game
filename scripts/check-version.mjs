// Fails unless the newest version in CHANGELOG.md is the version in package.json, so they change together.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const top = /^## (\d+\.\d+\.\d+)/m.exec(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'))?.[1];
if (top !== pkg.version) {
  console.error(`CHANGELOG.md starts at ${top ?? 'no version'}, but package.json is ${pkg.version}: change them together.`);
  process.exit(1);
}
console.log(`version ${pkg.version}`);
