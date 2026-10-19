#!/usr/bin/env node
// A session cookie for a profile in a local data dir, signed the way server.js signs one, so a
// browser that cannot use a passkey (an automated one, the desktop app's browser pane) can be signed
// in for testing. It needs the instance's DATA_DIR/secret, which already means full control of it, so
// it opens nothing that was closed. For your own local test data, not for a real server.
//
//   DATA_DIR=../data node scripts/dev-session.mjs [name-or-id]   # prints gymsid=<token>
//
// Then, on the http://localhost page: document.cookie = '<printed line>; path=/' and reload.
// The cookie is the plain-http one (gymsid); an https ORIGIN would want __Host-gymsid.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA = process.env.DATA_DIR || '/data';
const SESSION_DAYS = Math.max(1, +(process.env.SESSION_DAYS || 90) || 90);
const secret = fs.readFileSync(path.join(DATA, 'secret'), 'utf8').trim();
const users = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8')).users || [];

const want = process.argv[2];
const found = want ? users.filter(u => u.id === want || u.name === want) : users;
if (found.length !== 1) {
  console.error(found.length ? `More than one profile matches; pass an id:` : `No such profile. Profiles in ${DATA}:`);
  for (const u of found.length ? found : users) console.error(`  ${u.id}  ${u.name}`);
  process.exit(1);
}
const user = found[0];
const payload = user.id + ':' + (Date.now() + SESSION_DAYS * 86400000) + ':' + (user.sv || 0);
console.log('gymsid=' + payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url'));
