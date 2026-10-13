import { safeLink } from './campaign-utils.js';

// Only previous/current/next covers stay in the DOM. Each drag frame writes one transform.
export function createLoopSlider(stage, { onChange, onActivate, onInteraction, motion }) {
  const viewport = document.createElement('div'), track = document.createElement('div');
  viewport.className = 'campaign-viewport'; track.className = 'campaign-track';
  viewport.append(track); stage.replaceChildren(viewport);
  let items = [], index = 0, signature = '', gesture = null, animation = null;
  let frame = 0, fallback = 0, suppressClickUntil = 0;
  const wrap = i => (i + items.length) % items.length;
  function render(panel, campaign, active) {
    const key = [campaign.id, campaign.version, campaign.cover_id, campaign.kind, campaign.link_url].join(':');
    if (panel.dataset.key !== key) {
      const linked = campaign.kind === 'post' && campaign.link_url;
      const art = document.createElement(linked ? 'a' : 'button');
      art.className = 'campaign-art'; art.draggable = false;
      art.setAttribute('aria-label', campaign.kind === 'flyer' ? `Abrir encarte: ${campaign.title}` : campaign.title);
      if (linked) {
        try { art.href = safeLink(campaign.link_url); } catch { art.removeAttribute('href'); }
        art.target = '_blank'; art.rel = 'noopener noreferrer';
      } else { art.type = 'button'; art.onclick = () => onActivate(items[index]); }
      const img = document.createElement('img');
      img.src = campaign.cover_url; img.alt = campaign.title; img.decoding = 'async'; img.draggable = false;
      art.append(img); panel.replaceChildren(art); panel.dataset.key = key;
    }
    panel.setAttribute('aria-hidden', String(!active)); panel.inert = !active;
    panel.firstElementChild.tabIndex = active ? 0 : -1;
  }
  function paint() {
    [...track.children].forEach((panel, i) => render(panel, items[wrap(index + (items.length > 1 ? i - 1 : 0))], items.length === 1 || i === 1));
    track.style.transition = 'none'; track.style.transform = items.length > 1 ? 'translate3d(-100%,0,0)' : 'translate3d(0,0,0)';
  }
  function finish() {
    if (!animation) return;
    const { delta, target } = animation; animation = null; clearTimeout(fallback);
    if (delta > 0) track.append(track.firstElementChild);
    else if (delta < 0) track.prepend(track.lastElementChild);
    index = target; paint(); stage.classList.remove('is-moving'); onChange();
  }
  function animate(delta, target = wrap(index + delta)) {
    if (animation || items.length < 2) return;
    animation = { delta, target };
    if (delta) render(track.children[delta > 0 ? 2 : 0], items[target], false);
    const duration = motion.matches ? 0 : delta ? 620 : 240;
    stage.classList.add('is-moving');
    // Flush the drag's final position once, never on pointermove.
    if (duration) { void track.offsetWidth; track.style.transition = `transform ${duration}ms cubic-bezier(.22,.75,.25,1)`; }
    track.style.transform = `translate3d(${-(1 + delta) * 100}%,0,0)`;
    if (!duration) finish(); else fallback = setTimeout(finish, duration + 100);
  }
  track.addEventListener('transitionend', e => { if (e.target === track && e.propertyName === 'transform') finish(); });
  function resetGesture() {
    cancelAnimationFrame(frame); frame = 0;
    const old = gesture; gesture = null;
    if (old && stage.hasPointerCapture(old.id)) stage.releasePointerCapture(old.id);
  }
  stage.addEventListener('dragstart', e => e.preventDefault());
  stage.addEventListener('click', e => {
    if (animation || gesture?.horizontal || performance.now() < suppressClickUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  stage.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0 || items.length < 2 || animation) return;
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, width: track.clientWidth, horizontal: false, lastX: e.clientX, lastTime: performance.now(), velocity: 0 };
    onInteraction();
  });
  globalThis.addEventListener('pointermove', e => {
    if (!gesture || gesture.id !== e.pointerId) return;
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
    if (!gesture.horizontal) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { resetGesture(); onInteraction(); return; }
      gesture.horizontal = true; stage.setPointerCapture(e.pointerId); stage.classList.add('is-moving');
      track.style.transition = 'none';
    }
    if (e.cancelable) e.preventDefault();
    const now = performance.now(), elapsed = now - gesture.lastTime;
    if (elapsed > 0) gesture.velocity = (e.clientX - gesture.lastX) / elapsed;
    gesture.lastX = e.clientX; gesture.lastTime = now; gesture.dx = Math.max(-gesture.width, Math.min(gesture.width, dx));
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (gesture) track.style.transform = `translate3d(${-gesture.width + gesture.dx}px,0,0)`; });
  });
  function release(e, cancelled = false) {
    if (!gesture || gesture.id !== e.pointerId) return;
    const drag = gesture;
    if (drag.horizontal) {
      track.style.transform = `translate3d(${-drag.width + drag.dx}px,0,0)`;
      suppressClickUntil = performance.now() + 400;
    }
    resetGesture();
    if (drag.horizontal) {
      const flick = performance.now() - drag.lastTime < 100 && Math.abs(drag.velocity) > .45 && Math.abs(drag.dx) > 16;
      const commit = !cancelled && (Math.abs(drag.dx) > Math.min(100, drag.width * .18) || flick);
      animate(commit ? (drag.dx < 0 ? 1 : -1) : 0);
    }
    onInteraction();
  }
  globalThis.addEventListener('pointerup', e => release(e));
  globalThis.addEventListener('pointercancel', e => release(e, true));
  // Touch starts with implicit capture on the image button. Its transfer to the
  // stage also bubbles a lost-capture event; only losing the stage's own capture cancels.
  stage.addEventListener('lostpointercapture', e => { if (e.target === stage) release(e, true); });
  return {
    setItems(list) {
      const nextSignature = list.map(c => [c.id,c.version,c.cover_id,c.kind,c.link_url].join(':')).join('|');
      const oldId = items[index]?.id; items = list;
      if (signature === nextSignature) return;
      signature = nextSignature; resetGesture(); clearTimeout(fallback); animation = null; stage.classList.remove('is-moving');
      viewport.classList.toggle('is-single', items.length < 2);
      const retained = items.findIndex(c => c.id === oldId); index = retained < 0 ? Math.min(index, Math.max(0, items.length - 1)) : retained;
      track.replaceChildren(...Array.from({length: items.length > 1 ? 3 : items.length}, () => { const panel = document.createElement('div'); panel.className = 'campaign-panel'; return panel; }));
      if (items.length) paint();
    },
    move(delta) { if (items.length > 1) animate(delta); },
    goTo(target) {
      if (target === index || animation || gesture || target < 0 || target >= items.length) return;
      const forward = wrap(target - index), backward = wrap(index - target);
      animate(forward <= backward ? 1 : -1, target);
    },
    get index() { return index; },
    get busy() { return !!gesture || !!animation; },
  };
}
