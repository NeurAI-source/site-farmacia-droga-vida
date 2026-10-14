import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
export const forbiddenPath = path => path.replaceAll('\\','/').toLowerCase().split('/').some(p => p === '.venv' || p === 'venv' || p.startsWith('.env') || p.endsWith('.env'));
export function containsCredential(text) {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) return true;
  if (/\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,}|sb_secret_[A-Za-z0-9_-]{32,})\b/.test(text)) return true;
  for (const token of text.match(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{32,}\b/g) || []) {
    try { if (JSON.parse(Buffer.from(token.split('.')[1],'base64url')).role === 'service_role') return true; } catch {}
  }
  return false;
}
if (process.argv[1]?.endsWith('security-check.mjs')) {
  const files = execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
  const issues = [];
  for (const path of files) {
    if (forbiddenPath(path)) { issues.push(`${path}: arquivo de ambiente proibido`); continue; }
    if (/\.(?:png|jpg|jpeg|webp|gif|woff2?|ico)$/i.test(path)) continue;
    if (containsCredential(readFileSync(path,'utf8'))) issues.push(`${path}: possível credencial privada`);
  }
  if (issues.length) { console.error(issues.join('\n')); process.exitCode=1; }
  else console.log('Arquivos versionados: nenhum ambiente proibido ou padrão de credencial privada detectado.');
}
