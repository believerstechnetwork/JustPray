import { SITE_URL } from './config';
import { SHARE_ICONS } from './data/share-icons';
import { IMG } from './images';
import { esc, longDate } from './lib/format';
import { S } from './state';

const SHOTS: ReadonlyArray<readonly ['s1' | 's2' | 's3', number, number]> = [
  ['s1', 0.47, 0.4],
  ['s2', 0.56, 0.4],
  ['s3', 0.56, 0.4],
];
let shareIdx = 0;
let shareImg: Blob | null = null;

const $ = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

export const shareText = (): string =>
  `Join Just Pray: a free monthly prayer gathering for people who work in tech, Lagos. ${longDate(S.event.date)}, ${S.event.time}. Our goal is one protected afternoon each month to read Scripture and pray together. Reserve a seat:`;

/** Build the links for each share target. Pure so it can be unit tested. */
export function shareLinks(text: string, url: string): Record<string, string> {
  const t = encodeURIComponent(text);
  const u = encodeURIComponent(url);
  return {
    wa: `https://wa.me/?text=${t}%20${u}`,
    x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    fb: `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`,
    in: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    tg: `https://t.me/share/url?url=${u}&text=${t}`,
    mail: `mailto:?subject=${encodeURIComponent('Just Pray: free monthly prayer gathering')}&body=${t}%20${u}`,
  };
}

const icon = (k: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="${SHARE_ICONS[k]?.p ?? ''}"/></svg>`;

function makeCard(i: number): Promise<{ blob: Blob | null; dataUrl: string }> {
  return new Promise((resolve) => {
    const W = 1200;
    const H = 630;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    const shot = SHOTS[i] ?? SHOTS[0]!;
    const im = new Image();
    im.onload = () => {
      if (!x) return resolve({ blob: null, dataUrl: '' });
      const lime =
        getComputedStyle(document.documentElement).getPropertyValue('--lime').trim() || '#c6f000';
      x.fillStyle = '#04200b';
      x.fillRect(0, 0, W, H);
      const [, fx, fy] = shot;
      const rw = W * 0.62;
      const r = Math.max(rw / im.width, H / im.height);
      const w = im.width * r;
      const h = im.height * r;
      const ox = Math.min(0, Math.max(rw - w, rw / 2 - fx * w));
      const oy = Math.min(0, Math.max(H - h, H / 2 - fy * h));
      x.drawImage(im, W - rw + ox, oy, w, h);
      const gr = x.createLinearGradient(0, 0, W, 0);
      gr.addColorStop(0, '#04200bff');
      gr.addColorStop(0.46, '#04200bf2');
      gr.addColorStop(0.7, '#04200b66');
      gr.addColorStop(1, '#04200b00');
      x.fillStyle = gr;
      x.fillRect(0, 0, W, H);
      x.fillStyle = lime;
      x.font = '400 120px Anton,Impact,sans-serif';
      x.fillText('JUST PRAY', 60, 170);
      x.fillStyle = '#fff';
      x.font = '800 34px Montserrat,Arial,sans-serif';
      [
        'Our goal: one protected afternoon',
        'each month for tech workers in Lagos',
        'to read Scripture and pray together.',
      ].forEach((t, k) => x.fillText(t, 60, 250 + k * 46));
      x.font = '700 26px Montserrat,Arial,sans-serif';
      x.fillStyle = '#cfe8c9';
      [
        'Gather. Free, up to 120 seats.',
        'Pray. Scripture, then personal and group prayer.',
        'Keep going. A prayer rhythm between gatherings.',
      ].forEach((t, k) => x.fillText(t, 60, 420 + k * 40));
      x.fillStyle = lime;
      x.fillRect(60, H - 92, 6, 50);
      x.fillStyle = '#fff';
      x.font = '800 28px Montserrat,Arial,sans-serif';
      x.fillText(`${longDate(S.event.date)} · ${S.event.time}`, 80, H - 68);
      x.font = '600 22px Montserrat,Arial,sans-serif';
      x.fillStyle = '#cfe8c9';
      x.fillText('Believers Tech Network', 80, H - 40);
      const dataUrl = c.toDataURL('image/png');
      c.toBlob((blob) => resolve({ blob, dataUrl }), 'image/png');
    };
    im.onerror = () => resolve({ blob: null, dataUrl: '' });
    im.src = IMG[shot[0]];
  });
}

export async function openShare(): Promise<void> {
  if (document.getElementById('sharebd')) return;
  const idx = shareIdx++ % SHOTS.length;
  const card = await makeCard(idx);
  shareImg = card.blob;
  const e = document.createElement('div');
  e.className = 'share-bd';
  e.id = 'sharebd';
  e.innerHTML = `<div class="share" role="dialog" aria-modal="true" aria-label="Share Just Pray"><h3>Share Just Pray</h3><img class="card" id="scard" src="${card.dataUrl}" alt="Share image showing the goal and how we pray together"><div class="thumbs" role="group" aria-label="Choose a photo">${SHOTS.map((s, k) => `<button type="button" data-card="${k}" aria-pressed="${k === idx}" aria-label="Photo ${k + 1}"><img src="${IMG[s[0]]}" alt=""></button>`).join('')}</div><textarea id="stxt" aria-label="Message">${esc(shareText())}</textarea>
  <div class="plat">${['wa', 'x', 'fb', 'in', 'tg', 'mail'].map((k) => `<a data-s="${k}" target="_blank" rel="noopener" style="--bc:${SHARE_ICONS[k]?.c}" aria-label="Share on ${SHARE_ICONS[k]?.n}" title="${SHARE_ICONS[k]?.n}">${icon(k)}</a>`).join('')}${['ig', 'tt'].map((k) => `<button type="button" data-share="native" style="--bc:${SHARE_ICONS[k]?.c}" aria-label="Share the image to ${SHARE_ICONS[k]?.n}" title="${SHARE_ICONS[k]?.n}">${icon(k)}</button>`).join('')}</div>
  <div class="plat2"><button type="button" data-share="copy">Copy text and link</button><a data-s="img" download="just-pray.png" href="${card.dataUrl}">Save image</a></div>
  <p class="fine">Instagram and TikTok have no web share link. On a phone those two open the share sheet with the picture attached. On a computer, save the image and post it. Facebook and LinkedIn show their own preview from the page address.</p>
  <button class="btn dark x" data-share="close" type="button">Close</button></div>`;
  document.body.appendChild(e);
  const update = (): void => {
    const links = shareLinks($<HTMLTextAreaElement>('#stxt')?.value ?? '', SITE_URL);
    e.querySelectorAll<HTMLAnchorElement>('[data-s]').forEach((a) => {
      const href = links[a.dataset.s ?? ''];
      if (href) a.href = href;
    });
  };
  update();
  $('#stxt')?.addEventListener('input', update);
  e.querySelector<HTMLButtonElement>('button[data-share=close]')?.focus();
}

const closeShare = (): void => document.getElementById('sharebd')?.remove();

/** Handle clicks inside the share dialog. Returns true if the click was handled. */
export async function handleShareClick(target: HTMLElement): Promise<boolean> {
  if (target.closest('[data-action=share]')) {
    await openShare();
    return true;
  }
  const thumb = target.closest<HTMLElement>('[data-card]');
  if (thumb) {
    const k = Number(thumb.dataset.card);
    const card = await makeCard(k);
    shareImg = card.blob;
    const img = $<HTMLImageElement>('#scard');
    if (img) img.src = card.dataUrl;
    const save = $<HTMLAnchorElement>('[data-s=img]');
    if (save) save.href = card.dataUrl;
    document
      .querySelectorAll<HTMLElement>('[data-card]')
      .forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.card) === k)));
    return true;
  }
  const d = target.closest<HTMLElement>('[data-share]');
  if (target.id === 'sharebd' || d?.dataset.share === 'close') {
    closeShare();
    return true;
  }
  if (!d) return false;
  const txt = $<HTMLTextAreaElement>('#stxt')?.value ?? '';
  if (d.dataset.share === 'copy') {
    try {
      await navigator.clipboard.writeText(`${txt} ${SITE_URL}`);
      d.textContent = 'Copied';
    } catch {
      d.textContent = 'Copy not allowed here';
    }
  }
  if (d.dataset.share === 'native') {
    try {
      const file = shareImg ? new File([shareImg], 'just-pray.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare?.({ files: [file] }))
        await navigator.share({ files: [file], text: txt, url: SITE_URL, title: 'Just Pray' });
      else if (navigator.share)
        await navigator.share({ text: txt, url: SITE_URL, title: 'Just Pray' });
      else d.textContent = 'Not supported here. Use Save image';
    } catch {
      /* user cancelled the share sheet */
    }
  }
  return true;
}

export function initShareKeys(): void {
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeShare();
  });
}
