import { COPY, EMPTY } from '../engine/model';
import { fmt, ic, portrait, qs, qsa } from '../engine/runtime';
import { unesc } from '../engine/safe';
import type { TemplateDesign } from '../engine/types';

const CSS = `
.tpl-cartel{--ink:#0B0B0B;--paper:#F3F1EC;--pop:#FFD23F;--k-r:0px;--k-fd:'Big Shoulders Display','Arial Narrow',sans-serif;--k-fw:900;--k-ls:-.01em;--k-tint:#E6E2D9;--k-line:rgba(11,11,11,.2);--k-soft:#4A4740;--k-ink:#0B0B0B;--k-card:#fff;--k-sh:inset 0 0 0 2px #0B0B0B;--k-acc:#0B0B0B;--k-acc-ink:#FFD23F;font-family:'Familjen Grotesk',system-ui,sans-serif;color:var(--ink);background:var(--paper)}
.tpl-cartel a{color:inherit}
.tpl-cartel .c-cond{font-family:'Big Shoulders Display','Arial Narrow',Impact,sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:-.01em}
.tpl-cartel .c-hdr{position:sticky;top:env(safe-area-inset-top,0px);z-index:40;background:var(--ink);color:#fff}
.tpl-cartel .c-hdr .w{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-block:10px}
.tpl-cartel .c-hdr .nm{font-family:'Big Shoulders Display',sans-serif;font-weight:900;font-size:26px;text-transform:uppercase;letter-spacing:.01em;text-decoration:none}
.tpl-cartel .c-hdr nav{display:flex;gap:22px;font-weight:600}
.tpl-cartel .c-hdr nav a{text-decoration:none;position:relative}
.tpl-cartel .c-hdr nav a::after{content:"";position:absolute;left:0;right:100%;bottom:-4px;height:3px;background:var(--pop);transition:right .3s}
.tpl-cartel .c-hdr nav a:hover::after{right:0}
.tpl-cartel .c-donate{display:inline-flex;align-items:center;min-height:46px;padding:0 22px;background:var(--pop);color:var(--ink)!important;font-family:'Big Shoulders Display',sans-serif;font-weight:900;font-size:22px;text-transform:uppercase;text-decoration:none;letter-spacing:.02em;transition:transform .2s}
.tpl-cartel .c-donate:hover{transform:rotate(-3deg) scale(1.05)}
@media (max-width:800px){.tpl-cartel .c-hdr nav{display:none}}

.tpl-cartel .c-hero{background:var(--brand);color:var(--brand-ink);position:relative;overflow:hidden;min-height:min(92vh,900px);display:flex;flex-direction:column;justify-content:flex-end}
.tpl-cartel .c-hero .w{position:relative;z-index:2;width:100%;padding-block:40px 120px}
.tpl-cartel .c-big{display:flex;align-items:flex-end;gap:2vw;flex-wrap:wrap}
.tpl-cartel .c-num{font-family:'Big Shoulders Display',sans-serif;font-weight:900;font-size:clamp(200px,30vw,460px);line-height:.72;letter-spacing:-.04em;color:var(--pop);text-shadow:8px 8px 0 var(--ink)}
.tpl-cartel .c-words{display:flex;flex-direction:column;padding-bottom:1.2vw}
.tpl-cartel .c-words span{font-family:'Big Shoulders Display',sans-serif;font-weight:900;text-transform:uppercase;font-size:clamp(54px,8.4vw,132px);line-height:.84}
.tpl-cartel .c-slot{display:inline-block;color:var(--ink);background:var(--pop);padding:0 .12em;min-width:4ch}
.tpl-cartel .c-sub{display:flex;flex-wrap:wrap;gap:20px;align-items:center;justify-content:space-between;margin-top:28px;border-top:3px solid currentColor;padding-top:18px}
.tpl-cartel .c-sub p{font-size:clamp(17px,1.6vw,21px);font-weight:500;max-width:34em}
@media (min-width:801px){.tpl-cartel .c-hero .c-sub{max-width:60%}.tpl-cartel .c-hero .w{padding-top:200px}}
.tpl-cartel .c-cta{display:inline-flex;align-items:center;gap:14px;min-height:64px;padding:0 30px;background:var(--ink);color:#fff!important;text-decoration:none;font-family:'Big Shoulders Display',sans-serif;font-weight:900;font-size:28px;text-transform:uppercase;letter-spacing:.02em;box-shadow:6px 6px 0 var(--pop);transition:transform .2s,box-shadow .2s}
.tpl-cartel .c-cta svg{width:24px}
.tpl-cartel .c-cta:hover{transform:translate(-3px,-3px);box-shadow:9px 9px 0 var(--pop)}
.tpl-cartel .c-belt{position:absolute;left:-10vw;right:-10vw;z-index:3;background:var(--ink);color:var(--pop);padding-block:12px;overflow:hidden;white-space:nowrap}
.tpl-cartel .c-belt.a{top:34px;transform:rotate(-3deg)}
.tpl-cartel .c-belt.b{top:104px;transform:rotate(2deg);background:var(--pop);color:var(--ink);z-index:1}
.tpl-cartel .c-belt div{display:inline-flex;gap:40px;font-family:'Big Shoulders Display',sans-serif;font-weight:900;font-size:clamp(26px,3vw,40px);text-transform:uppercase;letter-spacing:.02em;will-change:transform}
.tpl-cartel .c-belt span::after{content:"✦";margin-left:40px;font-size:.7em;vertical-align:middle}
.tpl-cartel .c-stickers{position:absolute;inset:0;z-index:4;pointer-events:none}
.tpl-cartel .c-st{position:absolute;width:clamp(120px,13vw,190px);aspect-ratio:1/1.12;background:#fff;padding:8px 8px 30px;box-shadow:0 18px 30px -12px rgba(0,0,0,.45);pointer-events:auto;cursor:grab;touch-action:none;user-select:none;transition:box-shadow .2s}
.tpl-cartel .c-st:active{cursor:grabbing;box-shadow:0 30px 50px -16px rgba(0,0,0,.55)}
.tpl-cartel .c-st .ph{width:100%;height:100%;overflow:hidden}
.tpl-cartel .c-st b{position:absolute;left:0;right:0;bottom:6px;text-align:center;font-family:'Big Shoulders Display',sans-serif;font-weight:900;font-size:18px;text-transform:uppercase;color:var(--ink)}
.tpl-cartel .c-st.pop{animation:cPop .6s cubic-bezier(.3,1.6,.5,1) both}
@keyframes cPop{from{transform:scale(0) rotate(0deg)}}
@media (max-width:800px){.tpl-cartel .c-hero{min-height:0}.tpl-cartel .c-hero .w{padding-block:300px 60px}.tpl-cartel .c-st{width:92px}.tpl-cartel .c-belt.a{top:24px}.tpl-cartel .c-belt.b{top:84px}}

.tpl-cartel .c-list{padding-block:100px}
.tpl-cartel .c-lab{font-weight:700;font-size:14px;letter-spacing:.14em;text-transform:uppercase;display:flex;justify-content:space-between;border-bottom:3px solid var(--ink);padding-bottom:12px}
.tpl-cartel .c-row{display:grid;grid-template-columns:80px minmax(0,1fr) auto;gap:20px;align-items:center;border-bottom:3px solid var(--ink);padding-block:10px;text-decoration:none;position:relative;transition:background .25s,color .25s,padding .35s cubic-bezier(.2,.8,.2,1)}
.tpl-cartel .c-row .i{font-family:'Big Shoulders Display',sans-serif;font-weight:900;font-size:28px}
.tpl-cartel .c-row .n{font-family:'Big Shoulders Display',sans-serif;font-weight:900;text-transform:uppercase;font-size:clamp(64px,10vw,160px);line-height:.9}
.tpl-cartel .c-row .d{font-weight:600;text-align:right;font-size:16px}
.tpl-cartel .c-row:hover{background:var(--ink);color:var(--pop);padding-left:24px}
.tpl-cartel .c-row .mini{display:none;width:72px;height:72px;overflow:hidden;flex:none}
.tpl-cartel .c-float{position:fixed;left:0;top:0;width:280px;aspect-ratio:4/5;pointer-events:none;z-index:45;opacity:0;transform:translate(-50%,-50%) scale(.6) rotate(-6deg);transition:opacity .25s,transform .35s cubic-bezier(.2,.8,.2,1);box-shadow:12px 12px 0 var(--pop);overflow:hidden}
.tpl-cartel .c-float.on{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(-4deg)}
@media (max-width:800px){.tpl-cartel .c-row{grid-template-columns:72px minmax(0,1fr)}.tpl-cartel .c-row .d{grid-column:2;text-align:left}.tpl-cartel .c-row .i{display:none}.tpl-cartel .c-row .mini{display:block;grid-row:1/3}.tpl-cartel .c-float{display:none}}

.tpl-cartel .c-camp{background:var(--ink);color:#fff;padding-block:100px;overflow:hidden}
.tpl-cartel .c-camp .top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:24px}
.tpl-cartel .c-camp h2{font-family:'Big Shoulders Display',sans-serif;font-weight:900;text-transform:uppercase;font-size:clamp(56px,8vw,128px);line-height:.86}
.tpl-cartel .c-camp h2 em{font-style:normal;color:var(--pop)}
.tpl-cartel .c-pct{font-family:'Big Shoulders Display',sans-serif;font-weight:900;font-size:clamp(120px,20vw,300px);line-height:.8;color:var(--pop)}
.tpl-cartel .c-thermo{margin-top:40px;height:80px;border:3px solid #fff;position:relative;overflow:hidden}
.tpl-cartel .c-thermo i{position:absolute;inset:0 auto 0 0;width:0;background:repeating-linear-gradient(-45deg,var(--pop) 0 18px,#ffbf00 18px 36px);transition:width 2s cubic-bezier(.2,.8,.2,1)}
.tpl-cartel .c-thermo span{position:absolute;right:16px;top:50%;transform:translateY(-50%);font-family:'Big Shoulders Display',sans-serif;font-weight:900;font-size:28px;text-transform:uppercase}
.tpl-cartel .c-camp .row2{display:flex;flex-wrap:wrap;gap:24px;justify-content:space-between;align-items:center;margin-top:28px}
.tpl-cartel .c-camp .row2 p{font-size:18px;max-width:34em;color:#D6D3CC}

.tpl-cartel .c-mani{padding-block:120px}
.tpl-cartel .c-mani p{font-family:'Big Shoulders Display',sans-serif;font-weight:900;text-transform:uppercase;font-size:clamp(44px,6.6vw,104px);line-height:.92}
.tpl-cartel .c-mani p span{color:rgba(11,11,11,.14);transition:color .3s}
.tpl-cartel .c-mani p span.on{color:var(--ink)}
.tpl-cartel .c-mani p span.on.hl{color:var(--brand)}
.tpl-cartel .c-trust{display:flex;flex-wrap:wrap;gap:12px;margin-top:40px}
.tpl-cartel .c-trust span{display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border:3px solid var(--ink);font-weight:700}
.tpl-cartel .c-trust svg{width:18px}
.tpl-cartel .c-ftr{background:var(--pop);padding-block:60px 30px;overflow:hidden}
.tpl-cartel .c-ftr .huge{font-family:'Big Shoulders Display',sans-serif;font-weight:900;text-transform:uppercase;font-size:clamp(90px,22vw,340px);line-height:.78;letter-spacing:-.02em}
.tpl-cartel .c-ftr .bot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;margin-top:30px;border-top:3px solid var(--ink);padding-top:16px;font-weight:600}
.tpl-cartel .c-ftr .bot div{display:flex;gap:20px;flex-wrap:wrap}
.tpl-cartel .c-mani p{font-size:clamp(34px,4.4vw,68px)}
.tpl-cartel .k-h2{text-transform:uppercase;font-size:clamp(52px,7vw,110px);line-height:.88}
.tpl-cartel .k-act b,.tpl-cartel .k-nd b,.tpl-cartel .k-pr b,.tpl-cartel .k-help h2,.tpl-cartel .k-lsum b{text-transform:uppercase}
.tpl-cartel .k-act:first-child{background:var(--pop);color:var(--ink)}
.tpl-cartel .k-help{background:var(--ink);color:#fff}
.tpl-cartel .k-help h2{color:var(--pop)}
.tpl-cartel .k-help .k-btn{background:var(--pop);color:var(--ink)!important}
.tpl-cartel .k-nd .bar i{background:var(--pop);box-shadow:inset 0 0 0 2px var(--ink)}
.tpl-cartel .k-eb{color:var(--ink)}
.tpl-cartel .k-revs .st{color:var(--ink)}
`;

export const cartel: TemplateDesign = {
  id: 'cartel',
  kit: true,
  fonts: 'family=Familjen+Grotesk:wght@400;500;600;700&family=Big+Shoulders+Display:wght@700;900',
  css: CSS,
  html(m, KIT) {
    const { ORG, CAMPAIGN, ANIMALS, SHOW, BADGES } = m;
    const n = m.COUNTS.total;
    const belt = (words: string[]) =>
      `<div>${Array.from({ length: 4 }, () => words.map((w) => `<span>${w}</span>`).join('')).join('')}</div>`;
    const pos = [
      [68, 36, -8],
      [82, 28, 6],
      [69, 62, 4],
      [84, 58, -6],
    ];
    const stickers = ANIMALS.slice(0, 4)
      .map(
        (x, i) =>
          `<div class="c-st pop" data-i="${i}" style="left:${pos[i][0]}%;top:${pos[i][1]}%;transform:rotate(${pos[i][2]}deg);animation-delay:${600 + i * 140}ms"><div class="ph">${portrait(x, { k: 'cs', dx: 10, dy: 22 })}</div><b>${x.name}</b></div>`,
      )
      .join('');
    const rows = ANIMALS.map(
      (x, i) =>
        `<a class="c-row" href="${x.href}" data-i="${i}"><span class="i">${String(i + 1).padStart(2, '0')}</span><span class="mini">${portrait(x, { k: 'cm' })}</span><span class="n">${x.name}</span><span class="d">${x.spLabel} · ${x.age} · ${x.sizeLabel}</span></a>`,
    ).join('');
    const mani = ORG.about;
    const hl = mani.split(' ').slice(-2);
    const title = CAMPAIGN.title.includes(' de ')
      ? CAMPAIGN.title.replace(' de ', '<br><em>de ') + '</em>'
      : CAMPAIGN.title;
    const big = n
      ? `<span class="c-num">${n}</span><span class="c-words"><span>${n === 1 ? 'busca' : 'buscan'}</span><span>hogar.</span><span>Como <span class="c-slot" id="c-slot">${ANIMALS[0].name}</span></span></span>`
      : `<span class="c-words"><span>Adopta.</span><span>Apadrina.</span><span>Dona.</span></span>`;
    const subBits = [
      ORG.name,
      [ORG.type, ORG.city].filter(Boolean).join(' en '),
      BADGES.map((b) => b.t).join(' · '),
    ].filter(Boolean);
    return `
<header class="c-hdr"><div class="w"><a class="nm" href="#c-top">${ORG.short}</a><nav aria-label="Secciones"><a href="#c-ellos">Ellos</a><a href="#c-camp">Campaña</a>${SHOW.nosotros ? '<a href="#c-mani">Quiénes somos</a>' : ''}</nav><a class="c-donate" href="${ORG.donateHref}" data-magnet>Donar</a></div></header>
${KIT.tbar()}
<main id="c-top">
<section class="c-hero">
  <div class="c-belt a" aria-hidden="true">${belt(['Adopta', 'Apadrina', 'Dona', 'Comparte'])}</div>
  <div class="c-belt b" aria-hidden="true">${belt([ORG.name, ORG.city, ORG.dept].filter(Boolean))}</div>
  ${stickers ? `<div class="c-stickers" aria-hidden="true">${stickers}</div>` : ''}
  <div class="w">
    <h1 class="sr">${ORG.name}${n ? `: ${n} ${n === 1 ? 'animal busca' : 'animales buscan'} hogar` : ''}</h1>
    <div class="c-big" aria-hidden="true">${big}</div>
    <div class="c-sub"><p>${subBits.join(' · ')}.${stickers ? ' Arrastra los retratos.' : ''}</p><a class="c-cta" href="#c-ellos" data-magnet>Conócelos ${ic.arrow}</a></div>
  </div>
</section>

${KIT.acts(['#c-ellos', '#c-ellos', ORG.donateHref], KIT.hd('Cómo ayudar', 'Adopta. Apadrina. Dona.'))}
<section class="w c-list" id="c-ellos" data-sec="animales"><div class="c-lab"><span>Ellos</span><span>${n} en adopción</span></div>${rows || `<p class="k-empty">${EMPTY.animales}</p>`}</section>
<div class="c-float" id="c-float" aria-hidden="true"></div>

${
  CAMPAIGN.active
    ? `<section class="c-camp" id="c-camp" data-sec="campana"><div class="w">
  <div class="top"><h2>${title}</h2><span class="c-pct"><span id="c-pct">${CAMPAIGN.pct}</span>%</span></div>
  <div class="c-thermo" role="progressbar" aria-valuenow="${CAMPAIGN.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Avance de la campaña"><i id="c-th"></i><span>Faltan ${fmt(Math.max(0, CAMPAIGN.goal - CAMPAIGN.raised))}</span></div>
  <div class="row2"><p>${fmt(CAMPAIGN.raised)} de ${fmt(CAMPAIGN.goal)} hasta el ${CAMPAIGN.deadline}. ${CAMPAIGN.description ? `${CAMPAIGN.description} ` : ''}${COPY.adoptNote}</p><a class="c-cta" href="${CAMPAIGN.href}" data-magnet>Ver campaña y aportar ${ic.arrow}</a></div>
  ${KIT.moreCampaigns()}
</div></section>`
    : `<div id="c-camp">${KIT.campEmpty(KIT.hd('Campaña', 'Sin campaña activa'))}</div>`
}
${KIT.needs(KIT.hd('Banco de recursos', 'Necesita hoy'))}
${KIT.prods(KIT.hd('Tienda', 'Productos'))}
${KIT.help()}

${
  SHOW.nosotros
    ? `<section class="w c-mani" id="c-mani" data-sec="nosotros"><p class="k-eb" style="margin-bottom:18px">Sobre nosotros</p><p id="c-mtext">${mani
        .split(' ')
        .map((w) => `<span${hl.includes(w) ? ' class="hl"' : ''}>${w}</span>`)
        .join(' ')}</p>
  <div class="c-trust">${BADGES.map((b) => `<span>${b.ok ? ic.check : ic.clock}${b.t}</span>`).join('')}${SHOW.transparencia ? `<span>${ic.shield}Formalización ${ORG.formalization}%</span>` : ''}</div></section>`
    : ''
}
${KIT.revs(KIT.hd('Reseñas', 'Lo que dicen', `<button type="button" class="k-lnk" data-review>Registrar reseña ${ic.arrow}</button>`))}
${KIT.ledger(KIT.hd('Transparencia', 'Libro público', `<button type="button" class="k-lnk" data-ledger>Ver libro completo ${ic.arrow}</button>`))}
${KIT.contact()}
</main>
<footer class="c-ftr"><div class="w"><div class="huge">Adopta.</div>
  ${KIT.socials()}
  <div class="bot"><span>${ORG.name}${ORG.city ? ` · ${ORG.city}` : ''}</span><div><span>Hecho con AdoptaFácil</span></div></div></div></footer>`;
  },
  init(app, env) {
    const { m, motion } = env;
    const { signal } = motion;
    const A = m.ANIMALS;
    // Cintas en movimiento que aceleran con la velocidad del scroll
    const belts = qsa(app, '.c-belt div');
    let off = 0;
    let vel = 0;
    let last = scrollY;
    addEventListener(
      'scroll',
      () => {
        vel += (scrollY - last) * 0.4;
        last = scrollY;
      },
      { passive: true, signal },
    );
    if (!motion.reduce)
      motion.onFrame(() => {
        off += 1.2 + vel;
        vel *= 0.9;
        belts.forEach((b, i) => {
          const w = b.scrollWidth / 4;
          const x = ((off % w) + w) % w;
          b.style.transform = `translateX(${i ? -w + x : -x}px)`;
        });
      });
    // Nombre que rota con efecto de tipeo
    const slot = qs(app, '#c-slot');
    if (slot && A.length > 1 && !motion.reduce) {
      let k = 0;
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let id: ReturnType<typeof setInterval> | undefined;
      const swap = () => {
        k = (k + 1) % A.length;
        const name = unesc(A[k].name);
        const to = name.toUpperCase();
        let f = 0;
        clearInterval(id);
        id = setInterval(() => {
          f++;
          slot.textContent = to
            .split('')
            .map((c, i) => (i < f / 2 ? c : chars[(Math.random() * 26) | 0]))
            .join('');
          if (f / 2 >= to.length) {
            clearInterval(id);
            slot.textContent = name;
          }
        }, 35);
      };
      const t = setInterval(swap, 2600);
      signal.addEventListener('abort', () => {
        clearInterval(t);
        clearInterval(id);
      });
    }
    // Calcomanías arrastrables
    qsa(app, '.c-st').forEach((st) => {
      let sx = 0;
      let sy = 0;
      let ox = 0;
      let oy = 0;
      let drag = false;
      st.addEventListener(
        'pointerdown',
        (e) => {
          drag = true;
          st.setPointerCapture(e.pointerId);
          sx = e.clientX;
          sy = e.clientY;
          ox = st.offsetLeft;
          oy = st.offsetTop;
          st.style.zIndex = '10';
          st.classList.remove('pop');
        },
        { signal },
      );
      st.addEventListener(
        'pointermove',
        (e) => {
          if (!drag) return;
          st.style.left = ox + e.clientX - sx + 'px';
          st.style.top = oy + e.clientY - sy + 'px';
          st.style.transform = `rotate(${(e.clientX - sx) * 0.05}deg) scale(1.06)`;
        },
        { signal },
      );
      st.addEventListener(
        'pointerup',
        () => {
          drag = false;
          st.style.transform = `rotate(${(Math.random() * 14 - 7).toFixed(1)}deg)`;
        },
        { signal },
      );
    });
    // Retrato que sigue al cursor sobre los nombres
    const fl = qs(app, '#c-float');
    if (fl && motion.hover) {
      let fx = 0;
      let fy = 0;
      let tx = 0;
      let ty = 0;
      qsa(app, '.c-row').forEach((r) => {
        r.addEventListener(
          'pointerenter',
          () => {
            const a = A[Number(r.dataset.i)];
            if (!a) return;
            fl.innerHTML = portrait(a, { k: 'cf', dx: 6, dy: 18, s: 1.05 });
            fl.classList.add('on');
          },
          { signal },
        );
        r.addEventListener('pointerleave', () => fl.classList.remove('on'), { signal });
      });
      addEventListener(
        'pointermove',
        (e) => {
          tx = e.clientX;
          ty = e.clientY;
        },
        { signal },
      );
      motion.onFrame(() => {
        fx += (tx - fx) * 0.16;
        fy += (ty - fy) * 0.16;
        fl.style.left = fx + 'px';
        fl.style.top = fy + 'px';
      });
    }
    // Termómetro y manifiesto
    const th = qs(app, '#c-th');
    if (th) {
      const fill = () => (th.style.width = Math.max(m.CAMPAIGN.pct, 2) + '%');
      if (typeof IntersectionObserver !== 'function') fill();
      motion.observe(
        [th],
        (en, io) => {
          if (en.isIntersecting) {
            fill();
            io.disconnect();
          }
        },
        { threshold: 0.5 },
      );
      motion.countUp(qs(app, '#c-pct'), m.CAMPAIGN.pct, (v) => Math.round(v), 1800);
    }
    const mt = qs(app, '#c-mtext');
    if (mt) {
      const ws = qsa(mt, 'span');
      const onM = () => {
        const r = mt.getBoundingClientRect();
        const k2 = motion.reduce
          ? 1
          : Math.min(1, Math.max(0, (innerHeight * 0.8 - r.top) / (r.height + innerHeight * 0.2)));
        const on = Math.round(k2 * ws.length);
        ws.forEach((w, i) => w.classList.toggle('on', i < on));
      };
      addEventListener('scroll', onM, { passive: true, signal });
      onM();
    }
    motion.magnet(app);
  },
};
