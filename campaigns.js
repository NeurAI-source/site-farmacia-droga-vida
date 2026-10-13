import { config } from './public-config.js';
import { visibleCampaigns } from './campaign-utils.js';
import { createCampaignViewer } from './campaign-viewer.js';
import { createLoopSlider } from './campaign-slider.js';
const root = document.querySelector('#campaign-carousel');
if (root && config.url && config.key) mountCampaignCarousel(root);
export function mountCampaignCarousel(root) {
  const viewer = createCampaignViewer(), motion = matchMedia('(prefers-reduced-motion: reduce)');
  const stage = root.querySelector('.campaign-slide'), dots = root.querySelector('.campaign-dots');
  let campaigns = [], serverAnchor = 0, monoAnchor = 0, leaseUntil = 0, nextStart = Infinity, fetching = false;
  let boundaryTimer, fetchTimer, autoTimer, lastIds = '';
  const serverNow = () => serverAnchor + performance.now() - monoAnchor;
  const eligible = () => performance.now() < leaseUntil ? visibleCampaigns(campaigns, serverNow()) : [];
  const slider = createLoopSlider(stage, { motion, onChange: () => { draw(); restartAuto(); }, onInteraction: restartAuto,
    onActivate: campaign => { viewer.open(campaign); restartAuto(); } });
  function restartAuto() { clearTimeout(autoTimer); autoTimer = undefined; scheduleAuto(); }
  function scheduleAuto() {
    if (autoTimer || motion.matches || document.hidden || eligible().length < 2) return;
    autoTimer = setTimeout(() => {
      autoTimer = undefined;
      const keyboardFocus = root.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
      if (!slider.busy && !viewer.isOpen && !keyboardFocus) slider.move(1);
      scheduleAuto();
    }, 5200);
  }
  function draw() {
    if (Number.isFinite(nextStart) && serverNow() >= nextStart) { nextStart = Infinity; queueMicrotask(refresh); }
    const list = eligible(); root.hidden = !list.length; slider.setItems(list);
    if (viewer.id) { const current = list.find(c => c.id === viewer.id); if (current) viewer.update(current); else viewer.close(); }
    if (!list.length) { dots.replaceChildren(); lastIds = ''; clearTimeout(autoTimer); autoTimer = undefined; scheduleBoundary(); return; }
    const ids = list.map(c => `${c.id}:${c.version}`).join(',');
    if (ids !== lastIds) {
      dots.replaceChildren(...list.map((item, i) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', `Oferta ${i + 1}: ${item.title}`); b.onclick = () => { slider.goTo(i); restartAuto(); }; return b; }));
      lastIds = ids;
    }
    const campaign = list[slider.index];
    root.querySelector('.campaign-name').textContent = campaign.title;
    root.querySelector('.campaign-name').title = campaign.title;
    root.querySelector('.campaign-hint').textContent = campaign.kind === 'flyer' ? `${campaign.pages.length} páginas · Toque para abrir e ampliar` : campaign.link_url ? 'Toque para saber mais' : 'Toque para ampliar';
    [...dots.children].forEach((b, i) => b.setAttribute('aria-current', String(i === slider.index)));
    scheduleBoundary(); scheduleAuto();
  }
  function scheduleBoundary() {
    clearTimeout(boundaryTimer); const now = serverNow();
    const times = campaigns.map(c => Date.parse(c.ends_at) - now); times.push(leaseUntil - performance.now(), nextStart - now);
    const delay = Math.min(...times.filter(t => t > 0), 2147483647);
    if (delay < 2147483647) boundaryTimer = setTimeout(() => { draw(); if (serverNow() >= nextStart) { nextStart = Infinity; refresh(); } }, Math.max(1, delay));
  }
  root.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); slider.move(e.key === 'ArrowLeft' ? -1 : 1); restartAuto(); } });
  motion.addEventListener('change', restartAuto);
  async function refresh() {
    if (fetching) return; fetching = true; clearTimeout(fetchTimer); const sent = performance.now();
    try {
      const url = new URL(`${config.url}/functions/v1/campaign-api`); url.searchParams.set('action', 'public'); url.searchParams.set('_', String(Date.now()));
      const response = await fetch(url, { headers: {apikey: config.key}, cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw Error(); const data = await response.json();
      if (!Number.isFinite(Date.parse(data.server_now)) || !Array.isArray(data.campaigns)) throw Error();
      serverAnchor = Date.parse(data.server_now) + performance.now() - sent; monoAnchor = performance.now();
      root.dataset.campaignState = 'ready'; campaigns = data.campaigns; leaseUntil = sent + Math.min(Number(data.lease_ms) || 0, 60000); nextStart = Date.parse(data.next_start) || Infinity;
      draw();
    } catch { draw(); } finally { fetching = false; fetchTimer = setTimeout(refresh, 20000); }
  }
  function restore() { if (document.hidden) return; leaseUntil = 0; viewer.close(); draw(); refresh(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { root.hidden = true; viewer.close(); restartAuto(); } else restore(); });
  globalThis.addEventListener('pageshow', e => { if (e.persisted) restore(); }); globalThis.addEventListener('online', restore);
  refresh(); return {refresh};
}
