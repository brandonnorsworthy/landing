/* ── data ─────────────────────────────────────────────────────────── */
const CATEGORIES = [
  { key: 'monitoring', name: 'monitoring', color: 'oklch(58% 0.09 195)', apps: [
    { name: 'Network Monitor', desc: 'Uptime Kuma', meta: '2 checks degraded', status: 'warning', initials: 'NM', iconColor: 'oklch(50% 0.1 195)', dotColor: 'oklch(78% 0.14 85)' },
    { name: 'Grafana', desc: 'Metrics & dashboards', meta: '14 dashboards', status: 'online', initials: 'GR', iconColor: 'oklch(60% 0.13 65)', dotColor: 'oklch(58% 0.1 135)' },
    { name: 'UniFi Protect', desc: 'Camera NVR', meta: '6 cameras recording', status: 'online', initials: 'UP', iconColor: 'oklch(52% 0.11 330)', dotColor: 'oklch(58% 0.1 135)' },
  ]},
  { key: 'tools', name: 'tools', color: 'oklch(60% 0.13 65)', apps: [
    { name: 'Portainer', desc: 'Container manager', meta: '18 of 21 running', status: 'online', initials: 'PO', iconColor: 'oklch(55% 0.13 20)', dotColor: 'oklch(58% 0.1 135)' },
    { name: 'Proxmox', desc: 'Hypervisor', meta: '3 nodes healthy', status: 'online', initials: 'PR', iconColor: 'oklch(63% 0.12 75)', dotColor: 'oklch(58% 0.1 135)' },
    { name: 'Pi-hole', desc: 'DNS filtering', meta: 'Not responding', status: 'offline', initials: 'PI', iconColor: 'oklch(50% 0.15 25)', dotColor: 'oklch(55% 0.17 25)' },
    { name: 'Vaultwarden', desc: 'Password vault', meta: 'Synced', status: 'online', initials: 'VA', iconColor: 'oklch(55% 0.1 130)', dotColor: 'oklch(58% 0.1 135)' },
  ]},
  { key: 'home', name: 'home projects', color: 'oklch(58% 0.14 40)', apps: [
    { name: 'Digital Hearth', desc: 'Home automation', meta: '42 devices online', status: 'online', initials: 'DH', iconColor: 'oklch(52% 0.13 35)', dotColor: 'oklch(58% 0.1 135)' },
    { name: 'Plex', desc: 'Media server', meta: '3 streams active', status: 'online', initials: 'PL', iconColor: 'oklch(64% 0.13 55)', dotColor: 'oklch(58% 0.1 135)' },
    { name: 'Sonarr', desc: 'TV library', meta: 'Up to date', status: 'online', initials: 'SO', iconColor: 'oklch(52% 0.09 200)', dotColor: 'oklch(58% 0.1 135)' },
    { name: 'Radarr', desc: 'Movie library', meta: 'Queue backed up', status: 'warning', initials: 'RA', iconColor: 'oklch(53% 0.11 340)', dotColor: 'oklch(78% 0.14 85)' },
    { name: 'Immich', desc: 'Photo library', meta: '128k photos', status: 'online', initials: 'IM', iconColor: 'oklch(54% 0.09 145)', dotColor: 'oklch(58% 0.1 135)' },
    { name: 'qBittorrent', desc: 'Downloads', meta: '2 active torrents', status: 'online', initials: 'QB', iconColor: 'oklch(50% 0.12 25)', dotColor: 'oklch(58% 0.1 135)' },
  ]},
];

const EXTERNAL_LINKS = [
  { name: 'AWS Console', desc: 'aws.amazon.com', initials: 'AW' },
  { name: 'Router Admin', desc: '192.168.1.1', initials: 'RT' },
  { name: 'Domain Registrar', desc: 'Namecheap', initials: 'DO' },
];

const FAVORITE_NAMES = ['Digital Hearth', 'UniFi Protect', 'Network Monitor'];
const HEALTH = { cpu: 34, ram: 61, disk: 72, containersUp: 18, containersTotal: 21 };
const WEATHER = { tempF: 68, condition: 'Partly Cloudy', high: 74, low: 58 };

/* ── state ────────────────────────────────────────────────────────── */
const S = {
  isLocked: true,
  scanning: false,
  activeTab: 'dashboard',
  query: '',
  mountTime: Date.now(),
  autoRefresh: true,
  notifications: true,
  compact: false,
};

/* ── derived data ─────────────────────────────────────────────────── */
const allApps = [];
CATEGORIES.forEach(c => c.apps.forEach(a => allApps.push({ ...a, categoryName: c.name })));
EXTERNAL_LINKS.forEach(l => allApps.push({
  ...l,
  categoryName: 'external',
  meta: l.desc,
  desc: l.desc,
  iconColor: 'oklch(52% 0.1 320)',
  dotColor: 'oklch(52% 0.1 320)',
}));
const favorites = FAVORITE_NAMES.map(n => allApps.find(a => a.name === n)).filter(Boolean);

/* ── helpers ──────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const app = $('app');

/**
 * Tiny hyperscript helper.
 * Fixed: skips null / undefined attribute values so `onclick: null` won't crash.
 */
function h(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => {
      if (v == null) return;                          // ← null-safe guard
      if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else if (k.startsWith('on')) {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else {
        el.setAttribute(k, v);
      }
    });
  }
  if (typeof children === 'string') {
    el.textContent = children;
  } else if (Array.isArray(children)) {
    children.forEach(c => { if (c) el.appendChild(c); });
  } else if (children && typeof children === 'object') {
    el.appendChild(children);
  }
  return el;
}

/* ── render: lock screen ──────────────────────────────────────────── */
function renderLockScreen() {
  const d = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  const ringColors = [
    'oklch(60% 0.15 40)', 'oklch(75% 0.13 85)', 'oklch(55% 0.09 130)', 'oklch(58% 0.09 195)',
    'oklch(55% 0.11 340)', 'oklch(58% 0.14 25)', 'oklch(70% 0.13 65)', 'oklch(56% 0.09 145)',
  ];
  const positions = [
    { top: 0, left: '50%', w: 5, h: 20, tx: 'translateX(-50%)' },
    { top: 11, right: 11, w: 5, h: 20, r: 'rotate(45deg)' },
    { right: 0, top: '50%', w: 20, h: 5, ty: 'translateY(-50%)' },
    { bottom: 11, right: 11, w: 5, h: 20, r: 'rotate(-45deg)' },
    { bottom: 0, left: '50%', w: 5, h: 20, tx: 'translateX(-50%)' },
    { bottom: 11, left: 11, w: 5, h: 20, r: 'rotate(45deg)' },
    { left: 0, top: '50%', w: 20, h: 5, ty: 'translateY(-50%)' },
    { top: 11, left: 11, w: 5, h: 20, r: 'rotate(-45deg)' },
  ];

  const ringDivs = positions.map((p, i) => {
    const s = { background: ringColors[i] };
    if (p.top !== undefined) s.top = p.top;
    if (p.bottom !== undefined) s.bottom = p.bottom;
    if (p.left !== undefined) s.left = p.left;
    if (p.right !== undefined) s.right = p.right;
    s.width = p.w;
    s.height = p.h;
    if (p.tx) s.transform = p.tx;
    if (p.ty) s.transform = p.ty;
    if (p.r) s.transform = p.r;
    return h('div', { style: s });
  });

  const coreStyle = { background: S.scanning ? 'oklch(58% 0.1 135)' : 'oklch(60% 0.15 40)' };

  return h('div', {
    class: 'lock-screen' + (S.scanning ? ' unlocking' : ''),
    id: 'lock',
    onclick: S.scanning ? null : handleUnlock,   // null is now safe
  }, [
    h('div', { style: { fontFamily: "'Kalam',cursive", fontSize: '17px', fontWeight: '700', letterSpacing: '.02em', color: 'oklch(58% 0.14 40)', marginBottom: '14px', transform: 'rotate(-2deg)' } }, 'homelab & good vibes'),
    h('div', { style: { fontFamily: "'Kalam',cursive", fontSize: '66px', fontWeight: '700', color: 'oklch(30% 0.03 50)', lineHeight: '1', letterSpacing: '-.01em' } }, time),
    h('div', { style: { fontSize: '15px', color: 'oklch(48% 0.03 55)', marginBottom: '28px' } }, date),
    h('div', { class: 'faceid-outer' }, [
      h('div', { class: 'faceid-ring' }, ringDivs),
      h('div', { class: 'faceid-core' + (S.scanning ? ' scanning' : ''), style: coreStyle }),
    ]),
    h('div', { style: { marginTop: '22px', fontSize: '13px', color: 'oklch(50% 0.03 55)' } },
      S.scanning ? 'feeling the vibes…' : 'tap to unlock'),
  ]);
}

/* ── render: dashboard ────────────────────────────────────────────── */
function renderDashboard() {
  const hr = new Date().getHours();
  const greeting = hr < 12 ? 'good morning' : hr < 18 ? 'good afternoon' : 'good evening';
  const q = S.query.trim().toLowerCase();
  const isSearching = q.length > 0;
  const results = isSearching
    ? allApps.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.desc && a.desc.toLowerCase().includes(q)))
    : [];

  const sec = Math.floor((Date.now() - S.mountTime) / 1000);
  const updated = sec < 60 ? `updated ${sec}s ago` : `updated ${Math.floor(sec / 60)}m ago`;

  const els = [
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' } }, [
      h('div', {}, [
        h('div', { style: { fontSize: '13px', color: 'oklch(50% 0.03 55)', fontWeight: '700' } }, greeting + ', friend'),
        h('div', { style: { fontFamily: "'Kalam',cursive", fontSize: '26px', fontWeight: '700', color: 'oklch(30% 0.03 50)', letterSpacing: '-.01em', transform: 'rotate(-1deg)', display: 'inline-block' } }, 'the dashboard'),
      ]),
      h('div', {
        style: { width: '40px', height: '40px', borderRadius: '42% 58% 61% 39% / 45% 48% 52% 55%', background: 'oklch(78% 0.13 85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: '0' },
        onclick: () => setTab('settings'),
      }, [
        h('div', { style: { width: '16px', height: '16px', borderRadius: '50%', border: '2.5px solid oklch(97% 0.01 80)' } }),
      ]),
    ]),
    h('div', { class: 'search-wrap' }, [
      h('div', { class: 'search-icon' }),
      h('div', { class: 'search-handle' }),
      h('input', {
        class: 'search-input',
        placeholder: 'find your zen (search apps)',
        value: S.query,
        onInput: handleSearchInput,          // ← focus-preserving handler
      }),
    ]),
  ];

  /* search results early-return */
  if (isSearching) {
    els.push(h('div', { class: 'section-title', style: { color: 'oklch(58% 0.14 40)' } }, 'results'));
    const col = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' } });
    results.forEach(a => {
      col.appendChild(h('div', { class: 'app-row search' }, [
        h('div', { class: 'app-icon', style: { width: '44px', height: '44px', background: a.iconColor } },
          [h('span', { style: { fontSize: '14px' } }, a.initials)]),
        h('div', { style: { flex: '1', minWidth: '0' } }, [
          h('div', { style: { fontSize: '15px', fontWeight: '700', color: 'oklch(30% 0.03 50)' } }, a.name),
          h('div', { style: { fontSize: '12.5px', color: 'oklch(50% 0.03 55)' } }, a.categoryName + ' · ' + (a.desc || a.meta)),
        ]),
        h('div', { class: 'status-dot', style: { width: '8px', height: '8px', background: a.dotColor } }),
      ]));
    });
    els.push(col);
    return els;
  }

  /* favorites */
  els.push(h('div', { class: 'section-title', style: { color: 'oklch(58% 0.14 40)' } }, 'favorites'));
  const fGrid = h('div', { class: 'fav-grid' });
  favorites.forEach(a => {
    fGrid.appendChild(h('div', { class: 'fav-card' }, [
      h('div', { style: { position: 'relative', width: '56px', height: '56px' } }, [
        h('div', { class: 'app-icon', style: { width: '56px', height: '56px', background: a.iconColor } },
          [h('span', { style: { fontSize: '16px' } }, a.initials)]),
        h('div', { class: 'status-dot', style: { position: 'absolute', bottom: '-2px', right: '-2px', width: '13px', height: '13px', background: a.dotColor, border: '2px solid oklch(97% 0.015 78)' } }),
      ]),
      h('div', { style: { fontSize: '12px', fontWeight: '700', color: 'oklch(35% 0.03 50)', textAlign: 'center', lineHeight: '1.2' } }, a.name),
    ]));
  });
  els.push(fGrid);

  /* two-col: system + weather */
  const twoCol = h('div', { class: 'two-col' });
  twoCol.appendChild(h('div', { class: 'card' }, [
    h('div', { style: { fontFamily: "'Kalam',cursive", fontSize: '14px', fontWeight: '700', color: 'oklch(55% 0.09 130)', marginBottom: '10px' } }, 'system vibes'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [
      bar('CPU', HEALTH.cpu, 'oklch(60% 0.15 40)'),
      bar('RAM', HEALTH.ram, 'oklch(60% 0.15 40)'),
      bar('Disk', HEALTH.disk, 'oklch(78% 0.14 85)'),
    ]),
    h('div', {
      style: { marginTop: '11px', paddingTop: '9px', borderTop: '1px solid oklch(60% 0.08 60 / .2)', fontSize: '11.5px', color: 'oklch(48% 0.03 55)' },
      dangerouslySetInnerHTML: { __html: `${HEALTH.containersUp}/${HEALTH.containersTotal} containers · <span id="updated-ts" style="color:oklch(55% 0.03 55)">${updated}</span>` },
    }),
  ]));
  twoCol.appendChild(h('div', { class: 'card', style: { display: 'flex', flexDirection: 'column' } }, [
    h('div', { style: { fontFamily: "'Kalam',cursive", fontSize: '14px', fontWeight: '700', color: 'oklch(58% 0.09 195)', marginBottom: '8px' } }, 'skies'),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 'auto' } }, [
      h('div', { style: { position: 'relative', width: '34px', height: '34px', flexShrink: '0' } }, [
        h('div', { style: { position: 'absolute', width: '20px', height: '20px', borderRadius: '50%', background: 'oklch(78% 0.14 85)', top: 0, left: 0 } }),
        h('div', { style: { position: 'absolute', width: '26px', height: '16px', borderRadius: '9px', background: 'oklch(88% 0.02 75)', bottom: 0, right: 0 } }),
      ]),
      h('div', { style: { fontSize: '26px', fontWeight: '800', color: 'oklch(30% 0.03 50)' } }, WEATHER.tempF + '°'),
    ]),
    h('div', { style: { fontSize: '12px', color: 'oklch(48% 0.03 55)', marginTop: '8px' } }, WEATHER.condition),
    h('div', { style: { fontSize: '11.5px', color: 'oklch(55% 0.03 55)' } }, `H:${WEATHER.high}° L:${WEATHER.low}°`),
  ]));
  els.push(twoCol);

  /* categories */
  CATEGORIES.forEach(cat => {
    els.push(h('div', { style: { marginBottom: '22px' } }, [
      h('div', { class: 'section-title', style: { color: cat.color } }, cat.name),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        cat.apps.map(a =>
          h('div', { class: 'app-row' }, [
            h('div', { class: 'app-icon', style: { width: '38px', height: '38px', background: a.iconColor } },
              [h('span', { style: { fontSize: '12.5px' } }, a.initials)]),
            h('div', { style: { flex: '1', minWidth: '0' } }, [
              h('div', { style: { fontSize: '13.5px', fontWeight: '700', color: 'oklch(32% 0.03 50)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, a.name),
              h('div', { style: { fontSize: '11px', color: 'oklch(52% 0.03 55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, a.meta),
            ]),
            h('div', {
              class: 'status-dot',
              style: {
                width: '8px', height: '8px', background: a.dotColor,
                animation: a.status === 'warning' ? 'dotPulse 2s ease-in-out infinite' : 'none',
              },
            }),
          ])
        )
      ),
    ]));
  });

  /* external links */
  els.push(h('div', { style: { marginBottom: '22px' } }, [
    h('div', { class: 'section-title', style: { color: 'oklch(55% 0.1 320)' } }, 'external links'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [
      ...EXTERNAL_LINKS.map(l =>
        h('div', { class: 'external-row' }, [
          h('div', { class: 'app-icon', style: { width: '38px', height: '38px', background: 'oklch(52% 0.1 320)' } },
            [h('span', { style: { fontSize: '12.5px' } }, l.initials)]),
          h('div', { style: { flex: '1', minWidth: '0' } }, [
            h('div', { style: { fontSize: '13.5px', fontWeight: '700', color: 'oklch(32% 0.03 50)' } }, l.name),
            h('div', { style: { fontSize: '11px', color: 'oklch(48% 0.06 320)' } }, l.desc),
          ]),
          h('div', { style: { fontSize: '15px', color: 'oklch(52% 0.1 320)' } }, '↗'),
        ])
      ),
      h('div', { class: 'add-app' }, [
        h('span', { style: { fontSize: '17px', lineHeight: '1' } }, '+'),
        h('span', {}, ' add app'),
      ]),
    ]),
  ]));

  return els;
}

/* ── render: settings ─────────────────────────────────────────────── */
function renderSettings() {
  return [
    h('div', { style: { fontFamily: "'Kalam',cursive", fontSize: '26px', fontWeight: '700', color: 'oklch(30% 0.03 50)', marginBottom: '20px', transform: 'rotate(-1deg)', display: 'inline-block' } }, 'settings'),
    h('div', { class: 'settings-group' }, [
      h('div', { class: 'settings-row' }, [
        h('span', { style: { fontSize: '14.5px', color: 'oklch(32% 0.03 50)', fontWeight: '600' } }, 'Earthy mode'),
        makeToggle('oklch(55% 0.09 130)', '20px', null),
      ]),
      h('div', { class: 'settings-row', style: { cursor: 'pointer' } }, [
        h('span', { style: { fontSize: '14.5px', color: 'oklch(32% 0.03 50)', fontWeight: '600' } }, 'Auto-refresh status'),
        makeToggle(S.autoRefresh ? 'oklch(55% 0.09 130)' : 'oklch(60% 0.08 60 / .2)', S.autoRefresh ? '20px' : '2px',
          () => { S.autoRefresh = !S.autoRefresh; render(); }),
      ]),
      h('div', { class: 'settings-row', style: { cursor: 'pointer' } }, [
        h('span', { style: { fontSize: '14.5px', color: 'oklch(32% 0.03 50)', fontWeight: '600' } }, 'Down-app notifications'),
        makeToggle(S.notifications ? 'oklch(55% 0.09 130)' : 'oklch(60% 0.08 60 / .2)', S.notifications ? '20px' : '2px',
          () => { S.notifications = !S.notifications; render(); }),
      ]),
      h('div', { class: 'settings-row', style: { cursor: 'pointer' } }, [
        h('span', { style: { fontSize: '14.5px', color: 'oklch(32% 0.03 50)', fontWeight: '600' } }, 'Compact density'),
        makeToggle(S.compact ? 'oklch(55% 0.09 130)' : 'oklch(60% 0.08 60 / .2)', S.compact ? '20px' : '2px',
          () => { S.compact = !S.compact; render(); }),
      ]),
    ]),
    h('div', { class: 'lock-btn', onclick: lockNow }, 'lock the dashboard'),
  ];
}

/* ── render: tab bar ──────────────────────────────────────────────── */
function renderTabBar() {
  const dc = S.activeTab === 'dashboard' ? 'oklch(58% 0.14 40)' : 'oklch(58% 0.02 60)';
  const sc = S.activeTab === 'settings' ? 'oklch(58% 0.14 40)' : 'oklch(58% 0.02 60)';
  return h('div', { class: 'tab-bar' }, [
    h('div', { class: 'tab-item', onclick: () => setTab('dashboard') }, [
      h('div', { class: 'tab-icon-grid' }, [
        h('div', { style: { background: dc } }), h('div', { style: { background: dc } }),
        h('div', { style: { background: dc } }), h('div', { style: { background: dc } }),
      ]),
      h('span', { class: 'tab-label', style: { color: dc } }, 'dashboard'),
    ]),
    h('div', { class: 'tab-item', onclick: () => setTab('settings') }, [
      h('div', { style: { width: '18px', height: '18px', borderRadius: '50%', border: `2.5px solid ${sc}`, boxSizing: 'border-box' } }),
      h('span', { class: 'tab-label', style: { color: sc } }, 'settings'),
    ]),
  ]);
}

/* ── small components ─────────────────────────────────────────────── */
function bar(label, pct, color) {
  return h('div', {}, [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'oklch(48% 0.03 55)', marginBottom: '3px' } }, [
      h('span', {}, label), h('span', {}, pct + '%'),
    ]),
    h('div', { class: 'bar-track' }, [
      h('div', { class: 'bar-fill', style: { width: pct + '%', background: color } }),
    ]),
  ]);
}

function makeToggle(bg, thumbX, click) {
  return h('div', {
    class: 'toggle',
    style: { background: bg },
    onclick: e => { e.stopPropagation(); if (click) click(); },
  }, [
    h('div', { class: 'toggle-thumb', style: { left: thumbX } }),
  ]);
}

/* ── actions ──────────────────────────────────────────────────────── */
function handleUnlock() {
  if (S.scanning || !S.isLocked) return;
  S.scanning = true;
  render();
  setTimeout(() => {
    S.isLocked = false;
    S.scanning = false;
    S.mountTime = Date.now();
    render();
  }, 550);
}

function lockNow() {
  S.isLocked = true;
  S.activeTab = 'dashboard';
  S.query = '';
  render();
}

function setTab(t) {
  S.activeTab = t;
  render();
}

/* ── search (focus-preserving) ────────────────────────────────────── */
function handleSearchInput(e) {
  S.query = e.target.value;

  const scrollEl = $('scroll');
  if (!scrollEl) { render(); return; }

  // capture state before re-render
  const scrollTop = scrollEl.scrollTop;
  const input = scrollEl.querySelector('.search-input');
  const cursorPos = input ? input.selectionStart : 0;

  render();

  // restore state
  const newScroll = $('scroll');
  if (newScroll) {
    newScroll.scrollTop = scrollTop;
    const newInput = newScroll.querySelector('.search-input');
    if (newInput) {
      newInput.focus();
      newInput.setSelectionRange(cursorPos, cursorPos);
    }
  }
}

/* ── main render ──────────────────────────────────────────────────── */
function render() {
  app.innerHTML = '';
  if (S.isLocked) {
    app.appendChild(renderLockScreen());
  } else {
    const content = h('div', { class: 'app-content' }, [
      h('div', { class: 'scroll-area', id: 'scroll' }, [
        ...(S.activeTab === 'dashboard' ? renderDashboard() : renderSettings()),
      ]),
      renderTabBar(),
    ]);
    app.appendChild(content);
  }
}

/* ── tick: update "updated Ns ago" without full re-render ─────────── */
setInterval(() => {
  if (S.isLocked) {
    render();
    return;
  }
  const sec = Math.floor((Date.now() - S.mountTime) / 1000);
  const t = sec < 60 ? `updated ${sec}s ago` : `updated ${Math.floor(sec / 60)}m ago`;
  const ts = document.getElementById('updated-ts');
  if (ts) ts.textContent = t;
}, 1000);

/* ── boot ─────────────────────────────────────────────────────────── */
render();
