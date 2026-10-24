import { COPY, EMPTY, type TplAnimal } from '../engine/model';
import { availLine, fmt, ic, logoMark, portrait, qs, qsa } from '../engine/runtime';
import { unesc } from '../engine/safe';
import type { TemplateDesign } from '../engine/types';
import type { CanvasTexture, WebGLRenderer } from 'three';

/** Planetas en órbita: los primeros animales; el resto aparece en la cuadrícula. */
const MAX_PLANETS = 8;

const CSS = `
.tpl-solar{--space:#04060C;--glass:rgba(10,14,26,.55);--edge:rgba(255,255,255,.12);--fg:#EEF2FA;--soft:#9AA6BD;font-family:'Sora',system-ui,sans-serif;color:var(--fg);background:var(--space)}
.tpl-solar a{color:inherit}
.tpl-solar .o-canvas{position:fixed;left:0;right:0;bottom:0;top:env(safe-area-inset-top,0px);z-index:0;pointer-events:auto}
.tpl-solar .o-canvas canvas{display:block;width:100%!important;height:100%!important}
.tpl-solar .o-fallback{position:absolute;inset:0;background:radial-gradient(600px 400px at 70% 40%,color-mix(in srgb,var(--brand) 45%,transparent),transparent 70%),radial-gradient(900px 600px at 20% 80%,rgba(80,90,200,.25),transparent 70%)}
.tpl-solar .o-hdr{position:sticky;top:env(safe-area-inset-top,0px);z-index:40;pointer-events:none}
.tpl-solar .o-hdr .w{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-block:16px}
.tpl-solar .o-hdr .w > *{pointer-events:auto}
.tpl-solar .o-brand{display:flex;align-items:center;gap:12px;text-decoration:none}
.tpl-solar .o-brand i{width:40px;height:40px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,var(--brand) 60%);box-shadow:0 0 24px var(--brand);color:#fff;display:grid;place-items:center;font-style:normal;font-family:'Unbounded',sans-serif;font-weight:700;font-size:12px}
.tpl-solar .o-brand b{font-family:'Unbounded',sans-serif;font-weight:500;font-size:15px;letter-spacing:.02em}
.tpl-solar .o-dots{display:flex;gap:4px;padding:5px;border-radius:999px;background:var(--glass);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:inset 0 0 0 1px var(--edge)}
.tpl-solar .o-dots a{font-size:13px;font-weight:600;text-decoration:none;padding:9px 14px;border-radius:999px;color:var(--soft);transition:background .3s,color .3s}
.tpl-solar .o-dots a.on{background:rgba(255,255,255,.12);color:#fff}
.tpl-solar .o-btn{display:inline-flex;align-items:center;gap:12px;min-height:50px;padding:0 24px;border-radius:999px;background:var(--brand);color:var(--brand-ink)!important;text-decoration:none;font-weight:600;font-size:15px;border:0;cursor:pointer;box-shadow:0 0 0 1px rgba(255,255,255,.2) inset,0 12px 40px -10px var(--brand);transition:box-shadow .3s}
.tpl-solar .o-btn svg{width:18px}
.tpl-solar .o-btn:hover{box-shadow:0 0 0 1px rgba(255,255,255,.35) inset,0 16px 60px -8px var(--brand)}
.tpl-solar .o-btn.ghost{background:var(--glass);backdrop-filter:blur(14px);box-shadow:inset 0 0 0 1px var(--edge);color:#fff!important}
@media (max-width:900px){.tpl-solar .o-dots{display:none}}

.tpl-solar .o-main{position:relative;z-index:2;pointer-events:none}
.tpl-solar .o-main a,.tpl-solar .o-main button,.tpl-solar .o-panel{pointer-events:auto}
.tpl-solar .o-scene{position:relative;min-height:100vh;display:flex;align-items:center}
.tpl-solar .o-scene .w{width:100%}
.tpl-solar .o-h1{font-family:'Unbounded',sans-serif;font-weight:700;font-size:clamp(40px,6vw,96px);line-height:.95;letter-spacing:-.03em;max-width:9.5em}
.tpl-solar .o-h1 .g{background:linear-gradient(100deg,#fff 20%,color-mix(in srgb,var(--brand) 60%,#fff) 60%,#fff 90%);-webkit-background-clip:text;background-clip:text;color:transparent;background-size:200% 100%;animation:oSheen 6s linear infinite}
@keyframes oSheen{to{background-position:-200% 0}}
.tpl-solar .o-kick{font-size:13px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--soft);display:flex;gap:14px;flex-wrap:wrap;margin-bottom:22px}
.tpl-solar .o-kick span{display:inline-flex;align-items:center;gap:8px}
.tpl-solar .o-kick svg{width:14px;color:#8CF0D8}
.tpl-solar .o-lede{font-size:18px;line-height:1.65;color:#C9D2E3;max-width:32em;margin-top:24px;font-weight:300}
.tpl-solar .o-ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}
.tpl-solar .o-hint{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--soft);display:flex;flex-direction:column;align-items:center;gap:10px}
.tpl-solar .o-hint i{width:1px;height:42px;background:linear-gradient(var(--soft),transparent);animation:oDrop 2s infinite}
@keyframes oDrop{0%{transform:scaleY(0);transform-origin:top}50%{transform:scaleY(1);transform-origin:top}51%{transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}

.tpl-solar .o-panel{width:min(100%,440px);border-radius:28px;padding:30px;background:var(--glass);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);box-shadow:inset 0 0 0 1px var(--edge),0 40px 80px -40px rgba(0,0,0,.8)}
.tpl-solar .o-lab{font-size:12px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--soft)}
.tpl-solar .o-h2{font-family:'Unbounded',sans-serif;font-weight:700;font-size:clamp(30px,3.6vw,52px);letter-spacing:-.03em;line-height:1;margin-top:12px}
.tpl-solar .o-pets{height:calc(var(--n) * 90vh + 10vh);position:relative}
.tpl-solar .o-pets .stick{position:sticky;top:env(safe-area-inset-top,0px);height:100vh;display:flex;align-items:center}
.tpl-solar .o-pets .w{width:100%;display:flex;justify-content:flex-end}
.tpl-solar .o-pet-name{font-family:'Unbounded',sans-serif;font-weight:700;font-size:clamp(48px,6vw,84px);letter-spacing:-.04em;line-height:1;margin-top:10px;transition:opacity .4s,transform .4s}
.tpl-solar .o-pet-name.sw{opacity:0;transform:translateY(12px)}
.tpl-solar .o-specs{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--edge);border-radius:16px;overflow:hidden;margin-top:20px}
.tpl-solar .o-specs div{background:rgba(8,12,22,.6);padding:12px 14px}
.tpl-solar .o-specs dt{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft)}
.tpl-solar .o-specs dd{margin:4px 0 0;font-weight:600}
.tpl-solar .o-steps{display:flex;gap:6px;margin-top:20px}
.tpl-solar .o-steps button{flex:1;height:4px;border:0;border-radius:9px;background:rgba(255,255,255,.15);cursor:pointer;padding:0;transition:background .3s}
.tpl-solar .o-steps button.on{background:var(--brand)}
.tpl-solar .o-steps button::before{content:"";display:block;height:20px;margin-top:-8px}
.tpl-solar .o-camp .w{display:flex}
.tpl-solar .o-big{font-family:'Unbounded',sans-serif;font-weight:300;font-size:clamp(64px,8vw,120px);line-height:.9;letter-spacing:-.04em}
.tpl-solar .o-big small{font-size:.35em;color:var(--soft);font-weight:300;letter-spacing:0}
.tpl-solar .o-trust .w{display:flex;flex-direction:column;align-items:center;text-align:center;gap:22px}
.tpl-solar .o-seals{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
.tpl-solar .o-seals span{display:inline-flex;align-items:center;gap:8px;padding:12px 16px;border-radius:999px;background:var(--glass);backdrop-filter:blur(14px);box-shadow:inset 0 0 0 1px var(--edge);font-size:14px}
.tpl-solar .o-seals svg{width:16px;color:#8CF0D8}
.tpl-solar{--k-card:rgba(255,255,255,.05);--k-ink:var(--fg);--k-soft:var(--soft);--k-line:var(--edge);--k-tint:rgba(255,255,255,.06);--k-sh:inset 0 0 0 1px var(--edge);--k-acc:var(--brand,#7C9CFF);--k-acc-ink:#fff;--k-r:22px}
.tpl-solar .o-main .k-sec,.tpl-solar .o-main .k-tb,.tpl-solar .o-main .k-acts,.tpl-solar .o-main dialog{pointer-events:auto}
.tpl-solar .o-main .k-sec{position:relative;z-index:2}
.tpl-solar .o-rest{background:linear-gradient(rgba(4,6,12,0),rgba(4,6,12,.86) 140px);padding-bottom:40px}
.tpl-solar .o-rest .k-contact{background:rgba(10,14,26,.7);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.tpl-solar .o-ftr{position:relative;z-index:2;padding-block:40px;border-top:1px solid var(--edge);background:linear-gradient(transparent,var(--space) 40%)}
.tpl-solar .o-ftr .w{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;font-size:14px;color:var(--soft)}
.tpl-solar .o-ftr .w div{display:flex;gap:20px;flex-wrap:wrap}
@media (max-width:900px){.tpl-solar .o-pets .w{justify-content:center;align-items:flex-end;height:100%;padding-bottom:24px}.tpl-solar .o-pets .stick{align-items:flex-end}.tpl-solar .o-panel{padding:22px}}
`;

export const solar: TemplateDesign = {
  id: 'solar',
  kit: true,
  webgl: true,
  fonts: 'family=Sora:wght@300;400;600&family=Unbounded:wght@300;500;700',
  css: CSS,
  html(m, KIT) {
    const { ORG, CAMPAIGN, ANIMALS, SHOW, BADGES } = m;
    const feat = ANIMALS.slice(0, MAX_PLANETS);
    const rest = ANIMALS.slice(feat.length);
    const n = m.COUNTS.total;
    const kick = [
      BADGES.length
        ? `<span>${BADGES[0].ok ? ic.check : ''}${BADGES.map((b) => b.t).join(' · ')}</span>`
        : '',
      ORG.city ? `<span>${ORG.city}</span>` : '',
      ORG.type ? `<span>${ORG.type}</span>` : '',
    ].join('');
    return `
<div class="o-canvas" id="o-canvas" aria-hidden="true"><div class="o-fallback"></div></div>
<header class="o-hdr"><div class="w"><a class="o-brand" href="#o-top"><i>${logoMark(m)}</i><b>${ORG.short}</b></a>
  <nav class="o-dots" aria-label="Secciones"><a href="#o-top" class="on">Sistema</a><a href="#o-pets">Ellos</a><a href="#o-camp">Campaña</a><a href="#o-trust">Confianza</a></nav>
  <a class="o-btn" href="${ORG.donateHref}" data-magnet>Donar</a></div></header>
<main class="o-main">
${KIT.tbar()}
<section class="o-scene" id="o-top"><div class="w">
  ${kick ? `<p class="o-kick">${kick}</p>` : ''}
  <h1 class="o-h1"><span class="g">${ORG.name}</span></h1>
  <p class="o-lede">${ORG.lede || availLine(m)}</p>
  <div class="o-ctas"><a class="o-btn" href="#o-pets" data-magnet>${n > 1 ? `Visitar a los ${n}` : 'Conócelos'} ${ic.arrow}</a><a class="o-btn ghost" href="#o-camp">Ver la campaña</a></div>
</div>${feat.length ? '<div class="o-hint" aria-hidden="true">Baja para viajar<i></i></div>' : ''}</section>
${KIT.acts(['#o-pets', '#o-pets', ORG.donateHref])}

${
  feat.length
    ? `<section class="o-pets" id="o-pets" data-sec="animales" style="--n:${feat.length}"><div class="stick"><div class="w">
  <div class="o-panel" aria-live="polite">
    <span class="o-lab">En adopción · <span id="o-idx">1</span> de ${feat.length}</span>
    <h2 class="o-pet-name" id="o-name">${feat[0].name}</h2>
    <dl class="o-specs" id="o-specs"></dl>
    ${feat.length > 1 ? `<div class="o-steps" role="group" aria-label="Elegir animal">${feat.map((x, i) => `<button type="button" data-i="${i}" aria-label="Ver a ${x.name}"${i === 0 ? ' class="on"' : ''}></button>`).join('')}</div>` : ''}
    <div class="o-ctas" style="margin-top:22px"><a class="o-btn" href="${feat[0].href}" id="o-adopt"><span id="o-adopt-t">Quiero conocer a ${feat[0].name}</span> ${ic.arrow}</a></div>
  </div>
</div></div></section>
${rest.length ? `<div class="o-rest"><section class="w k-sec"><div class="k-hd"><div><p class="k-eb">Todos en adopción</p><h2 class="k-h2">${n} en el sistema</h2></div></div>${KIT.grid(rest)}</section></div>` : ''}`
    : `<div class="o-rest" id="o-pets" data-sec="animales"><section class="w k-sec">${KIT.hd('En adopción', 'Ellos')}<p class="k-empty">${EMPTY.animales}</p></section></div>`
}

${
  CAMPAIGN.active
    ? `<section class="o-scene o-camp" id="o-camp" data-sec="campana"><div class="w"><div class="o-panel">
  <span class="o-lab">Campaña activa · vence ${CAMPAIGN.deadline}</span>
  <h2 class="o-h2">${CAMPAIGN.title}</h2>
  <p class="o-big" style="margin-top:22px"><span id="o-pct">${CAMPAIGN.pct}</span><small>%</small></p>
  <p style="color:#C9D2E3;margin-top:10px">${fmt(CAMPAIGN.raised)} de ${fmt(CAMPAIGN.goal)}. ${CAMPAIGN.description ? `${CAMPAIGN.description} ` : ''}${COPY.adoptNote}</p>
  <div class="o-ctas" style="margin-top:22px"><a class="o-btn" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${ic.arrow}</a></div>
  ${KIT.moreCampaigns()}
</div></div></section>`
    : `<div id="o-camp" class="o-rest">${KIT.campEmpty()}</div>`
}
<div class="o-rest">${KIT.needs()}${KIT.prods()}${KIT.help()}</div>

<div id="o-trust" class="o-rest">
${
  SHOW.nosotros
    ? `<section class="o-scene o-trust" data-sec="nosotros" style="min-height:auto;padding-block:110px 40px"><div class="w">
  <span class="o-lab">Sobre nosotros</span>
  <h2 class="o-h2" style="max-width:16em">${ORG.name}</h2>
  <p style="color:#C9D2E3;max-width:40em;font-size:18px;line-height:1.6">${ORG.about}</p>
  ${BADGES.length ? `<div class="o-seals">${BADGES.map((b) => `<span>${b.ok ? ic.check : ic.clock}${b.t}</span>`).join('')}</div>` : ''}
</div></section>`
    : ''
}
${KIT.revs()}
${KIT.ledger()}
${KIT.contact()}
</div>
</main>
<footer class="o-ftr"><div class="w" style="flex-wrap:wrap;gap:18px">${KIT.socials()}<span>${ORG.name}${ORG.place ? ` · ${ORG.place}` : ''}</span><div><span>Hecho con AdoptaFácil</span></div></div></footer>`;
  },
  init(app, env) {
    const { m, motion, THREE } = env;
    const { signal } = motion;
    const feat = m.ANIMALS.slice(0, MAX_PLANETS);
    const host = qs(app, '#o-canvas');
    const name = qs(app, '#o-name');
    const idxEl = qs(app, '#o-idx');
    const specs = qs(app, '#o-specs');
    const adopt = qs<HTMLAnchorElement>(app, '#o-adopt');
    const adoptT = qs(app, '#o-adopt-t');
    const stepBtns = qsa(app, '.o-steps button');
    let focus = -1;
    const setPet = (i: number) => {
      const x = feat[i];
      if (!x || i === focus || !name || !specs) return;
      focus = i;
      name.classList.add('sw');
      const t = setTimeout(
        () => {
          name.textContent = unesc(x.name);
          name.classList.remove('sw');
        },
        motion.reduce ? 0 : 180,
      );
      signal.addEventListener('abort', () => clearTimeout(t));
      if (idxEl) idxEl.textContent = String(i + 1);
      if (adoptT) adoptT.textContent = `Quiero conocer a ${unesc(x.name)}`;
      if (adopt) adopt.setAttribute('href', unesc(x.href));
      specs.innerHTML = `<div><dt>Especie</dt><dd>${x.spLabel}</dd></div><div><dt>Edad</dt><dd>${x.age}</dd></div><div><dt>Tamaño</dt><dd>${x.sizeLabel}</dd></div>${x.breed ? `<div><dt>Raza</dt><dd>${x.breed}</dd></div>` : ''}`;
      stepBtns.forEach((b, k) => b.classList.toggle('on', k === i));
    };
    setPet(0);
    const petsSec = qs(app, '.o-pets');
    const toPet = (i: number) => {
      if (!petsSec) return;
      const top = petsSec.getBoundingClientRect().top + scrollY;
      const per = (petsSec.offsetHeight - innerHeight) / feat.length;
      scrollTo({ top: top + per * (i + 0.5), behavior: motion.reduce ? 'auto' : 'smooth' });
    };
    stepBtns.forEach((b) =>
      b.addEventListener('click', () => toPet(Number(b.dataset.i)), { signal }),
    );
    // Navegación activa
    const links = qsa(app, '.o-dots a');
    motion.observe(
      qsa(app, '#o-top,#o-pets,#o-camp,#o-trust'),
      (en) => {
        if (en.isIntersecting)
          links.forEach((l) =>
            l.classList.toggle('on', l.getAttribute('href') === '#' + en.target.id),
          );
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    if (m.CAMPAIGN.active)
      motion.countUp(qs(app, '#o-pct'), m.CAMPAIGN.pct, (v) => Math.round(v), 1600);
    motion.magnet(app);

    if (!THREE || !host) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      return;
    }
    qs(host, '.o-fallback')?.remove();
    host.appendChild(renderer.domElement);
    const small = innerWidth < 760;
    renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
    renderer.setClearColor(0x04060c, 1);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x04060c, 0.028);
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    const brand = new THREE.Color(env.brand());
    const white = new THREE.Color('#ffffff');

    // Texturas generadas en canvas
    const glowTex = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      if (g) {
        const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.25, 'rgba(255,255,255,.55)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 256, 256);
      }
      return new THREE.CanvasTexture(c);
    };
    const glow = glowTex();
    const coreTex = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const g = c.getContext('2d');
      if (g) {
        g.fillStyle = '#fff';
        g.font = '700 150px Unbounded, Arial, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(unesc(m.ORG.initials), 256, 266);
      }
      return new THREE.CanvasTexture(c);
    };
    // Textura del planeta: foto real (si el servidor permite CORS) o ilustración.
    const portraitTex = (a: TplAnimal, done: (t: CanvasTexture) => void) => {
      const draw = (img: HTMLImageElement) => {
        if (signal.aborted) return;
        const c = document.createElement('canvas');
        c.width = c.height = 512;
        const g = c.getContext('2d');
        if (!g) return;
        g.save();
        g.beginPath();
        g.arc(256, 256, 236, 0, Math.PI * 2);
        g.clip();
        const s = Math.max(512 / (img.naturalWidth || 512), 512 / (img.naturalHeight || 512));
        const w = (img.naturalWidth || 512) * s;
        const h = (img.naturalHeight || 512) * s;
        g.drawImage(img, (512 - w) / 2, (512 - h) / 2, w, h);
        const sh = g.createRadialGradient(180, 160, 40, 256, 256, 260);
        sh.addColorStop(0, 'rgba(255,255,255,.18)');
        sh.addColorStop(0.6, 'rgba(0,0,0,0)');
        sh.addColorStop(1, 'rgba(0,0,0,.55)');
        g.fillStyle = sh;
        g.fillRect(0, 0, 512, 512);
        g.restore();
        g.lineWidth = 10;
        g.strokeStyle = 'rgba(255,255,255,.85)';
        g.beginPath();
        g.arc(256, 256, 238, 0, Math.PI * 2);
        g.stroke();
        const t = new THREE.CanvasTexture(c);
        t.anisotropy = 4;
        done(t);
      };
      const illustrate = () => {
        const svg = portrait(a, {
          k: 'ot',
          dx: 8,
          dy: 20,
          s: 1,
          illustration: true,
          decor: true,
        }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" ');
        const img = new Image();
        img.onload = () => draw(img);
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      };
      if (!a.photo) return illustrate();
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => draw(img);
      img.onerror = illustrate;
      img.src = unesc(a.photo);
    };

    // Estrellas
    const SN = small ? 1800 : 4200;
    const sp = new Float32Array(SN * 3);
    const sc = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) {
      const r = 30 + Math.random() * 120;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      sp[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sp[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.6;
      sp[i * 3 + 2] = r * Math.cos(ph);
      const w = 0.6 + Math.random() * 0.4;
      const blue = Math.random() < 0.25;
      sc[i * 3] = w * (blue ? 0.7 : 1);
      sc[i * 3 + 1] = w * (blue ? 0.8 : 0.95);
      sc[i * 3 + 2] = w;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        size: 0.32,
        map: glow,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    scene.add(stars);
    // Polvo del disco (galaxia plana alrededor del núcleo)
    const DN = small ? 1400 : 3200;
    const dp = new Float32Array(DN * 3);
    for (let i = 0; i < DN; i++) {
      const r = 2.5 + Math.pow(Math.random(), 0.7) * 13;
      const a = Math.random() * Math.PI * 2;
      dp[i * 3] = Math.cos(a) * r;
      dp[i * 3 + 1] = (Math.random() - 0.5) * 0.35 * (1 + r * 0.05);
      dp[i * 3 + 2] = Math.sin(a) * r;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 0.12,
      map: glow,
      color: brand.clone().lerp(white, 0.35),
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dg, dustMat);
    const system = new THREE.Group();
    system.rotation.x = 0.38;
    system.add(dust);
    scene.add(system);
    // Núcleo
    const coreGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        color: brand,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    coreGlow.scale.set(7, 7, 1);
    system.add(coreGlow);
    system.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(1.05, 48, 48),
        new THREE.MeshBasicMaterial({ color: brand.clone().lerp(white, 0.25) }),
      ),
    );
    const coreLabel = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: coreTex(), transparent: true, depthTest: false }),
    );
    coreLabel.scale.set(1.5, 1.5, 1);
    coreLabel.renderOrder = 5;
    system.add(coreLabel);
    // Órbitas y planetas
    const orbits = feat.map((a, i) => {
      const r = 4.2 + i * 2.3;
      const speed = 0.16 / (1 + i * 0.45);
      const phase = i * 1.7;
      const pts = [];
      for (let k = 0; k <= 128; k++) {
        const t = (k / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(t) * r, 0, Math.sin(t) * r));
      }
      const ringMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.12,
      });
      system.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glow,
          color: brand,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      halo.scale.set(3.4, 3.4, 1);
      const planetMat = new THREE.SpriteMaterial({
        color: new THREE.Color(a.bg),
        transparent: true,
        depthTest: false,
      });
      const planet = new THREE.Sprite(planetMat);
      planet.renderOrder = 4;
      planet.scale.set(1.9, 1.9, 1);
      planet.userData.i = i;
      portraitTex(a, (t) => {
        planetMat.map = t;
        planetMat.color.set('#ffffff');
        planetMat.needsUpdate = true;
      });
      const holder = new THREE.Group();
      holder.add(halo);
      holder.add(planet);
      system.add(holder);
      return { r, speed, ringMat, halo, planet, holder, angle: phase, boost: 0 };
    });
    // Anillo de la campaña
    const pct = m.CAMPAIGN.pct / 100;
    const campGroup = new THREE.Group();
    scene.add(campGroup);
    campGroup.add(
      new THREE.Mesh(
        new THREE.TorusGeometry(3, 0.05, 12, 160),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14 }),
      ),
    );
    if (pct > 0)
      campGroup.add(
        new THREE.Mesh(
          new THREE.TorusGeometry(3, 0.14, 16, 160, Math.PI * 2 * pct),
          new THREE.MeshBasicMaterial({ color: brand }),
        ),
      );
    const headMat = new THREE.SpriteMaterial({
      map: glow,
      color: brand,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const tHead = new THREE.Sprite(headMat);
    tHead.scale.set(1.6, 1.6, 1);
    const ang = Math.PI * 2 * pct;
    tHead.position.set(Math.cos(ang) * 3, Math.sin(ang) * 3, 0);
    campGroup.add(tHead);
    campGroup.rotation.z = Math.PI / 2;
    campGroup.visible = false;

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      cam.aspect = w / Math.max(1, h);
      cam.updateProjectionMatrix();
    };
    resize();
    addEventListener('resize', resize, { signal });
    let px = 0;
    let py = 0;
    let tpx = 0;
    let tpy = 0;
    addEventListener(
      'pointermove',
      (e) => {
        tpx = e.clientX / innerWidth - 0.5;
        tpy = e.clientY / innerHeight - 0.5;
      },
      { signal },
    );
    // Tocar un planeta
    const ray = new THREE.Raycaster();
    const mv = new THREE.Vector2();
    host.addEventListener(
      'click',
      (e) => {
        const r = host.getBoundingClientRect();
        mv.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(mv, cam);
        const hit = ray.intersectObjects(orbits.map((o) => o.planet))[0];
        if (hit) toPet(Number(hit.object.userData.i));
      },
      { signal },
    );

    // Cámara guiada por el scroll
    const secs = ['#o-top', '#o-pets', '#o-camp', '#o-trust'].map((sel) => qs(app, sel));
    const camPos = new THREE.Vector3(0, 6, 22);
    const camLook = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const wp = new THREE.Vector3();
    const t0 = performance.now();
    type Stage =
      | { mode: 'intro'; k: number }
      | { mode: 'pets'; i: number }
      | { mode: 'camp' }
      | { mode: 'trust' };
    const top = (el: HTMLElement | null) =>
      el ? el.getBoundingClientRect().top + scrollY : Infinity;
    const stage = (): Stage => {
      const y = scrollY + innerHeight * 0.5;
      const pets = secs[1];
      const pTop = top(pets);
      const pH = pets?.offsetHeight ?? 0;
      if (y < pTop)
        return {
          mode: 'intro',
          k: Math.max(
            0,
            Math.min(1, (y - innerHeight * 0.5) / Math.max(1, pTop - innerHeight * 0.5)),
          ),
        };
      if (feat.length && petsSec && y < pTop + pH) {
        const k = (y - pTop) / Math.max(1, pH);
        return { mode: 'pets', i: Math.min(feat.length - 1, Math.floor(k * feat.length)) };
      }
      if (m.CAMPAIGN.active && secs[2] && y < top(secs[2]) + secs[2].offsetHeight)
        return { mode: 'camp' };
      return { mode: 'trust' };
    };
    const wide = () => innerWidth > 900;
    motion.onFrame((now) => {
      const t = (now - t0) / 1000;
      const st = stage();
      if (st.mode === 'pets') setPet(st.i);
      px += (tpx - px) * 0.04;
      py += (tpy - py) * 0.04;
      stars.rotation.y = t * 0.006;
      dust.rotation.y = -t * 0.02;
      coreGlow.scale.setScalar(6.5 + Math.sin(t * 1.6) * 0.4);
      orbits.forEach((o, i) => {
        const focused = st.mode === 'pets' && st.i === i;
        o.boost += ((focused ? 1 : 0) - o.boost) * 0.06;
        o.angle += (motion.reduce ? 0 : o.speed * 0.016) * (1 - (st.mode === 'pets' ? 0.85 : 0));
        o.holder.position.set(
          Math.cos(o.angle) * o.r,
          Math.sin(t * 0.5 + i) * 0.15,
          Math.sin(o.angle) * o.r,
        );
        const s = 1.9 + o.boost * 1.6;
        o.planet.scale.set(s, s, 1);
        o.halo.scale.setScalar(3.4 + o.boost * 3);
        o.ringMat.opacity = 0.1 + o.boost * 0.35;
      });
      // Destinos de cámara
      if (st.mode === 'intro') {
        tmp.set(wide() ? -7 : 0, 6 - st.k * 2, 22 - st.k * 6);
        camLook.lerp(new THREE.Vector3(wide() ? -7 : 0, wide() ? 0 : -5, 0), 0.05);
      } else if (st.mode === 'pets') {
        orbits[st.i].holder.getWorldPosition(wp);
        const dir = wp.clone().normalize();
        tmp
          .copy(wp)
          .add(dir.multiplyScalar(wide() ? 4.2 : 7.5))
          .add(new THREE.Vector3(wide() ? 1.2 : 0, 1.1, 0));
        camLook.lerp(
          wp.clone().add(new THREE.Vector3(wide() ? 1.5 : 0, wide() ? 0 : -0.9, 0)),
          0.08,
        );
      } else if (st.mode === 'camp') {
        tmp.set(wide() ? -4.2 : 0, 0, wide() ? 10 : 15);
        camLook.lerp(new THREE.Vector3(wide() ? -4.2 : 0, wide() ? 0 : -3.2, 0), 0.06);
      } else {
        tmp.set(0, 26, 30);
        camLook.lerp(new THREE.Vector3(0, -2, 0), 0.04);
      }
      const cs = campGroup.scale.x + ((st.mode === 'camp' ? 1 : 0) - campGroup.scale.x) * 0.07;
      campGroup.scale.setScalar(Math.max(0.001, cs));
      campGroup.visible = st.mode === 'camp' || campGroup.scale.x > 0.02;
      campGroup.rotation.y = Math.sin(t * 0.4) * 0.25;
      headMat.opacity = 0.7 + Math.sin(t * 3) * 0.3;
      tmp.x += px * 2.2;
      tmp.y -= py * 1.4;
      camPos.lerp(tmp, motion.reduce ? 1 : 0.045);
      cam.position.copy(camPos);
      cam.lookAt(camLook);
      renderer.render(scene, cam);
    });
    signal.addEventListener('abort', () => {
      renderer.dispose();
      renderer.forceContextLoss();
    });
  },
};
