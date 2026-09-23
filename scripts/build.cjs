const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);
// Only public website files belong on the CDN; functions and credentials never do.
for (const name of execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)) {
  if (/^(Assets|survey|userdemo|facilitydemo)\//.test(name) ||
      (!name.includes('/') && /\.(html|css|png|jpe?g|webp|ico|mp4)$/.test(name)) ||
      ['robots.txt', 'sitemap.xml'].includes(name)) {
    fs.mkdirSync(path.dirname(path.join(output, name)), { recursive: true });
    fs.copyFileSync(path.join(root, name), path.join(output, name));
  }
}
console.log('Public website built in dist/');
