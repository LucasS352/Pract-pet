// Read-only regression checks. Never execute entrypoint.sh or connect to databases.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const forbidden = /prisma\s+(?:db\s+push|migrate)|prisma:heart:setup|sync-tenants|accept-data-loss/i;

test('backend entrypoint does not update Heart or tenant schemas', () => {
  const source = fs.readFileSync(path.join(root, 'entrypoint.sh'), 'utf8');
  assert.doesNotMatch(source, forbidden);
  assert.match(source, /exec node dist\/main/);
  assert.match(source, /Sys-Init/);
});

test('Docker build generates clients but never pushes schema', () => {
  const source = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  assert.doesNotMatch(source, forbidden);
  assert.match(source, /prisma generate --schema=prisma\/schema\.prisma/);
  assert.match(source, /ENTRYPOINT \["\.\/entrypoint\.sh"\]/);
});

test('automatic npm lifecycle and start scripts never update schema', () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const [name, command] of Object.entries(scripts)) {
    if (/^(?:preinstall|install|postinstall|prepare|prepublish|prepublishOnly|prebuild|build|postbuild|prestart|start(?::.*)?|poststart)$/.test(name)) {
      assert.doesNotMatch(command, forbidden, `Unsafe automatic script: ${name}`);
    }
  }
});
