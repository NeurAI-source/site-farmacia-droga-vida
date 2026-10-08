// Validadores para fontes inseridas manualmente no cadastro. Sem IA ou geração automática.
export function validEvidenceUrl(value) {
  try {
    const u=new URL(value), host=u.hostname.toLowerCase();
    return u.protocol==='https:' && !u.username && !u.password && !!host && host!=='localhost'
      && !host.endsWith('.localhost') && !host.endsWith('.local') && !host.endsWith('.internal')
      && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) && !host.includes(':') && value.length<=1000;
  } catch { return false; }
}
export function parseEvidence(value) {
  return [...new Set(String(value||'').split(/[\s,]+/).map(s=>s.trim()).filter(Boolean))]
    .filter(validEvidenceUrl).slice(0,5);
}
