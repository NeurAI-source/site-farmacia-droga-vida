import test from 'node:test';
import assert from 'node:assert/strict';
import { securityHeaders } from '../scripts/security-policy.mjs';
import { forbiddenPath, containsCredential } from '../scripts/security-check.mjs';
test('environment files and virtual environments are blocked at every level and case',()=>{
  for(const path of ['.env','.env.example','exemple.env','assets/.ENV.production','admin/.VENV/lib/a.py','x/venv/bin/python'])assert.equal(forbiddenPath(path),true,path);
  for(const path of ['assets/family.webp','security/backup-public.pem','scripts/security-check.mjs'])assert.equal(forbiddenPath(path),false,path);
});
test('CSP permits only exact inline hashes and rejects third-party executable origins',()=>{
  const header=securityHeaders(['<script>console.log("fixed")</script>'],'https://safe.supabase.co');
  assert.match(header,/script-src 'self' 'sha256-/);assert.doesNotMatch(header,/unsafe-eval/);
  assert.match(header,/frame-ancestors 'none'/);assert.match(header,/object-src 'none'/);
  assert.match(header,/connect-src 'self' https:\/\/safe.supabase.co/);assert.match(header,/Strict-Transport-Security/);
});
test('credential checks distinguish a private key and service JWT from public keys',()=>{
  const marker=['-----BEGIN','PRIVATE KEY-----'].join(' ');assert.equal(containsCredential(marker),true);
  assert.equal(containsCredential('-----BEGIN PUBLIC KEY-----'),false);
  const jwt=role=>`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({role})).toString('base64url')}.${'a'.repeat(40)}`;
  assert.equal(containsCredential(jwt('anon')),false);
  // A realistic JWT header begins eyJ; use a conventional header for the secret case.
  const token=`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from('{"role":"service_role"}').toString('base64url')}.${'a'.repeat(40)}`;
  assert.equal(containsCredential(token),true);
});
