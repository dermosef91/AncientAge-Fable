// Hand-authored SVG icon set. No emoji anywhere in the UI.
// Every icon is a 24x24 viewBox drawn in the game's warm palette.

const G = {
  gold: '#e8c15a',
  goldDeep: '#c08f2e',
  bronze: '#c98b3f',
  stone: '#b9b2a4',
  stoneDark: '#8b857a',
  wood: '#a8845c',
  woodDark: '#6f5236',
  leaf: '#7f9a4a',
  blue: '#5a9fe0',
  blueDeep: '#2f6fd0',
  red: '#d9563f',
  cloth: '#ece0c6',
  steel: '#ccd2d8',
  dark: '#2a2118'
};

const P: Record<string, string> = {
  // ---------- resources ----------
  food: `<path d="M12 21.4v-9.6" stroke="${G.leaf}" stroke-width="1.9" stroke-linecap="round"/>
    <g fill="${G.gold}">
      <ellipse cx="12" cy="4.5" rx="1.9" ry="3"/>
      <ellipse cx="8.3" cy="8" rx="1.7" ry="2.7" transform="rotate(-32 8.3 8)"/>
      <ellipse cx="15.7" cy="8" rx="1.7" ry="2.7" transform="rotate(32 15.7 8)"/>
      <ellipse cx="8.7" cy="13.1" rx="1.6" ry="2.5" transform="rotate(-32 8.7 13.1)"/>
      <ellipse cx="15.3" cy="13.1" rx="1.6" ry="2.5" transform="rotate(32 15.3 13.1)"/>
    </g>`,
  wood: `<g transform="rotate(-20 12 12)">
      <rect x="2.4" y="8" width="19.2" height="8.4" rx="4.2" fill="${G.wood}"/>
      <rect x="2.4" y="8" width="19.2" height="3.2" rx="1.6" fill="#bf9a6d"/>
      <ellipse cx="6.2" cy="12.2" rx="2.7" ry="4.2" fill="#c9a877"/>
      <ellipse cx="6.2" cy="12.2" rx="1.5" ry="2.4" fill="${G.woodDark}"/>
    </g>`,
  gold: `<circle cx="12" cy="12" r="8.6" fill="${G.goldDeep}"/>
    <circle cx="12" cy="11.4" r="7" fill="${G.gold}"/>
    <path d="M12 7.4v9.2M9.4 9.6h4.1a1.9 1.9 0 010 3.8H9.4" stroke="${G.goldDeep}" stroke-width="1.6"
      fill="none" stroke-linecap="round"/>`,
  stone: `<path d="M3.4 16.6l2.4-5.4 4.6-2.4 4.2 1.6 4 3.4-.8 4.6-6.4 1.6-6.2-1z" fill="${G.stone}"/>
    <path d="M5.8 11.2l4.6 2.6 4.2-3.4 4 3.4-4.6 1.4-4.4-.4z" fill="#cdc6b8"/>
    <path d="M14.6 4.6l3.6 1.4.6 3.2-3.4 1.2-2.8-2.2z" fill="${G.stoneDark}"/>`,
  pop: `<circle cx="8.6" cy="8.2" r="3.2" fill="${G.cloth}"/>
    <path d="M2.8 19.4c0-3.4 2.6-5.8 5.8-5.8s5.8 2.4 5.8 5.8z" fill="${G.cloth}"/>
    <circle cx="16.8" cy="9.4" r="2.6" fill="#a8bccb"/>
    <path d="M12.4 19.4c0-2.8 2-4.8 4.4-4.8s4.4 2 4.4 4.8z" fill="#a8bccb"/>`,

  // ---------- actions ----------
  build: `<rect x="10.4" y="10" width="2.9" height="11.4" rx="1.4" transform="rotate(-28 11.8 15.7)" fill="${G.woodDark}"/>
    <path d="M4.6 6.6l5.8-3.4 3 1.8 3.2-1 3 4.4-3.2 1.6-2.6-1.4-3.2 2z" fill="${G.steel}"/>
    <path d="M10.4 3.2l3 1.8-4.4 2.6-1.8-1.1z" fill="#eef2f6"/>`,
  attack: `<g stroke="${G.steel}" stroke-width="2.6" stroke-linecap="round" fill="none">
      <path d="M5.4 18.6L17.8 5.6"/><path d="M18.6 18.6L6.2 5.6"/></g>
    <g stroke="${G.goldDeep}" stroke-width="2.2" stroke-linecap="round" fill="none">
      <path d="M4 15.4l3.4 3.4"/><path d="M20 15.4l-3.4 3.4"/></g>`,
  stop: `<g fill="${G.cloth}">
      <rect x="5.4" y="7" width="2.9" height="7.4" rx="1.45"/>
      <rect x="9" y="4.2" width="2.9" height="10" rx="1.45"/>
      <rect x="12.6" y="4.8" width="2.9" height="9.4" rx="1.45"/>
      <rect x="16.2" y="7.6" width="2.9" height="6.8" rx="1.45"/>
      <path d="M5 12.6h14.2v3.2c0 3.4-3 5.8-7.1 5.8s-7.1-2.4-7.1-5.8z"/>
    </g>`,
  hold: `<path d="M12 2.4l8 3v6.3c0 4.8-3.3 8.8-8 10.6-4.7-1.8-8-5.8-8-10.6V5.4z" fill="${G.blueDeep}"/>
    <path d="M12 5.2l5.2 2v4.6c0 3.3-2.1 6.1-5.2 7.5z" fill="${G.blue}"/>
    <path d="M12 5.2l-5.2 2v4.6c0 3.3 2.1 6.1 5.2 7.5z" fill="#7fb6ec"/>`,
  gather: `<path d="M3.6 10.4h16.8l-1.7 8.8a2 2 0 01-2 1.6H7.3a2 2 0 01-2-1.6z" fill="${G.wood}"/>
    <path d="M3 8.6h18v2.6H3z" fill="#c9a877"/>
    <path d="M8.4 8.6c0-3 1.7-5 3.6-5s3.6 2 3.6 5" stroke="${G.woodDark}" stroke-width="1.6" fill="none"/>
    <circle cx="9.6" cy="14.6" r="1.7" fill="${G.red}"/>
    <circle cx="14" cy="15.4" r="1.7" fill="${G.gold}"/>`,
  demolish: `<path d="M4.4 7.4h15.2l-1.3 12.2a2 2 0 01-2 1.8H7.7a2 2 0 01-2-1.8z" fill="${G.stoneDark}"/>
    <path d="M3 5.2h18v2.6H3z" fill="${G.stone}"/>
    <path d="M9.2 5.2V3.6h5.6v1.6" stroke="${G.stone}" stroke-width="1.8" fill="none"/>
    <g stroke="#5d5850" stroke-width="1.5" stroke-linecap="round"><path d="M10 11v6M14 11v6"/></g>`,
  rally: `<path d="M6.4 21.4V3" stroke="${G.woodDark}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M7.6 3.8h11.6l-2.8 3.9 2.8 3.9H7.6z" fill="${G.gold}"/>`,
  menu: `<g fill="${G.cloth}"><rect x="3.4" y="5.4" width="17.2" height="2.6" rx="1.3"/>
    <rect x="3.4" y="10.7" width="17.2" height="2.6" rx="1.3"/>
    <rect x="3.4" y="16" width="17.2" height="2.6" rx="1.3"/></g>`,
  close: `<path d="M6 6l12 12M18 6L6 18" stroke="${G.cloth}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`,
  check: `<path d="M4.6 12.8l4.8 4.8L19.4 7.2" stroke="#68c47e" stroke-width="2.8" stroke-linecap="round"
    stroke-linejoin="round" fill="none"/>`,
  bullet: `<circle cx="12" cy="12" r="3.2" fill="${G.stoneDark}"/>`,
  warn: `<path d="M12 3.2l9.4 16.4H2.6z" fill="${G.gold}"/>
    <path d="M12 9v4.6" stroke="${G.dark}" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="12" cy="16.8" r="1.3" fill="${G.dark}"/>`,

  // ---------- unit stats ----------
  // Small monochrome glyphs for the selection panel's stat row. Drawn in
  // currentColor so they take on the row's muted text colour and stay quiet
  // next to the numbers they label.
  statAtk: `<g fill="currentColor" transform="rotate(45 12 11.5)">
      <path d="M12 1.6l1.8 3.7v10h-3.6V5.3z"/>
      <rect x="8.3" y="15.7" width="7.4" height="2.4" rx="1.2"/>
      <rect x="10.8" y="18" width="2.4" height="2.6"/>
      <circle cx="12" cy="21.4" r="1.7"/>
    </g>`,
  statArm: `<path d="M12 2.4l8 3v6.3c0 4.8-3.3 8.8-8 10.6-4.7-1.8-8-5.8-8-10.6V5.4z" fill="currentColor"/>`,
  statRng: `<g stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 5.8C4.4 12.8 11.2 19.6 18.2 19" stroke-width="2.2"/>
      <path d="M5 5.8L18.2 19" stroke-width="1.3"/>
      <path d="M9.4 14.6L20.4 3.6" stroke-width="2.2"/>
      <path d="M16.4 3.6h4v4" stroke-width="2.2"/>
    </g>`,
  statSpd: `<g stroke="currentColor" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 5.2L11.8 12 5 18.8"/>
      <path d="M12.6 5.2L19.4 12l-6.8 6.8"/>
    </g>`,

  // ---------- ui / status ----------
  // Two crossed swords. They meet high on the blades so the guards, grips and
  // pommels stay clear of each other — the silhouette reads as two swords even
  // when the whole icon is filled with one flat colour.
  army: `<g fill="${G.cloth}">
      <g transform="rotate(45 12 10.5)">
        <path d="M12 1.2l1.8 3.7v10.4h-3.6V4.9z"/>
        <rect x="8.3" y="15.3" width="7.4" height="2.4" rx="1.2"/>
        <rect x="10.8" y="17.6" width="2.4" height="2.8"/>
        <circle cx="12" cy="21.2" r="1.8"/>
      </g>
      <g transform="rotate(-45 12 10.5)">
        <path d="M12 1.2l1.8 3.7v10.4h-3.6V4.9z"/>
        <rect x="8.3" y="15.3" width="7.4" height="2.4" rx="1.2"/>
        <rect x="10.8" y="17.6" width="2.4" height="2.8"/>
        <circle cx="12" cy="21.2" r="1.8"/>
      </g>
    </g>`,
  villagers: `<circle cx="12" cy="6.6" r="3.2" fill="${G.cloth}"/>
    <path d="M5.6 20.4c0-3.8 2.9-6.6 6.4-6.6s6.4 2.8 6.4 6.6z" fill="${G.cloth}"/>
    <path d="M12 13.8v6.6" stroke="${G.blueDeep}" stroke-width="1.8"/>`,
  home: `<path d="M12 2.6l9.4 5.2H2.6z" fill="${G.red}"/>
    <path d="M3.4 8.4h17.2v1.9H3.4z" fill="${G.cloth}"/>
    <g fill="#e6dcc4"><rect x="5" y="10.6" width="2.5" height="8.2"/><rect x="10.7" y="10.6" width="2.5" height="8.2"/>
      <rect x="16.4" y="10.6" width="2.5" height="8.2"/></g>
    <rect x="3" y="19" width="18" height="2.4" rx=".7" fill="${G.cloth}"/>`,
  clock: `<circle cx="12" cy="12" r="8.8" fill="none" stroke="${G.cloth}" stroke-width="2"/>
    <path d="M12 6.8V12l3.6 2.4" stroke="${G.cloth}" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  sound: `<path d="M4 9.4h3.6L12.8 5v14l-5.2-4.4H4z" fill="${G.cloth}"/>
    <path d="M15.8 9.2a4 4 0 010 5.6M18.4 6.6a7.6 7.6 0 010 10.8" stroke="${G.cloth}" stroke-width="1.9"
      stroke-linecap="round" fill="none"/>`,
  mute: `<path d="M4 9.4h3.6L12.8 5v14l-5.2-4.4H4z" fill="${G.stoneDark}"/>
    <path d="M16 9.6l5 4.8M21 9.6l-5 4.8" stroke="${G.red}" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  restart: `<path d="M20 12a8 8 0 11-2.6-5.9" stroke="${G.cloth}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M20.6 3.2v5.2h-5.2z" fill="${G.cloth}"/>`,
  play: `<path d="M7.4 4.8l12 7.2-12 7.2z" fill="${G.cloth}"/>`,
  trophy: `<path d="M7 3.6h10v6.2a5 5 0 01-10 0z" fill="${G.gold}"/>
    <path d="M7 5.2H4.4v1.6A3.4 3.4 0 007.4 10M17 5.2h2.6v1.6A3.4 3.4 0 0116.6 10"
      stroke="${G.goldDeep}" stroke-width="1.8" fill="none"/>
    <path d="M10.6 14.4h2.8v3.4h-2.8z" fill="${G.goldDeep}"/>
    <rect x="7.4" y="17.6" width="9.2" height="2.8" rx="1" fill="${G.gold}"/>`,
  skull: `<path d="M12 2.8c5 0 8.4 3.4 8.4 8 0 3-1.4 4.8-3 5.9v3.1a1.6 1.6 0 01-1.6 1.6H8.2a1.6 1.6 0 01-1.6-1.6v-3.1c-1.6-1.1-3-2.9-3-5.9 0-4.6 3.4-8 8.4-8z"
      fill="#ddd6c6"/>
    <ellipse cx="8.7" cy="11.4" rx="2.3" ry="2.7" fill="#3a342c"/>
    <ellipse cx="15.3" cy="11.4" rx="2.3" ry="2.7" fill="#3a342c"/>
    <path d="M12 14.6l-1.3 2.6h2.6z" fill="#3a342c"/>`,
  age: `<path d="M12 2.6l5.2 5.8h-3v3.4h-4.4V8.4h-3z" fill="${G.gold}"/>
    <g fill="${G.stone}"><rect x="6.6" y="13.4" width="10.8" height="2.4" rx=".8"/>
      <rect x="4.6" y="16.8" width="14.8" height="2.4" rx=".8"/></g>`,
  lock: `<path d="M7.4 10.4V7.8a4.6 4.6 0 019.2 0v2.6" stroke="${G.stoneDark}" stroke-width="2.2" fill="none"/>
    <rect x="4.8" y="10.2" width="14.4" height="10.4" rx="2.2" fill="${G.stoneDark}"/>
    <circle cx="12" cy="15.4" r="1.9" fill="#3a342c"/>`,
  fullscreen: `<path d="M3.6 8.4V3.6h4.8M15.6 3.6h4.8v4.8M20.4 15.6v4.8h-4.8M8.4 20.4H3.6v-4.8"
    stroke="${G.cloth}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  fullscreenExit: `<path d="M8.4 3.6V8.4H3.6M15.6 3.6V8.4H20.4M15.6 20.4V15.6H20.4M8.4 20.4V15.6H3.6"
    stroke="${G.cloth}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,

  // ---------- technologies ----------
  wheel: `<circle cx="12" cy="12" r="9" fill="${G.woodDark}"/>
    <circle cx="12" cy="12" r="7.1" fill="#c9a877"/>
    <circle cx="12" cy="12" r="5.6" fill="${G.woodDark}"/>
    <g stroke="#c9a877" stroke-width="1.7"><path d="M12 6.4v11.2M6.4 12h11.2M8 8l8 8M16 8l-8 8"/></g>
    <circle cx="12" cy="12" r="2.1" fill="#c9a877"/>`,
  masonry: `<g fill="${G.stone}">
      <rect x="2.6" y="5" width="8.4" height="4.2" rx=".8"/><rect x="12" y="5" width="9.4" height="4.2" rx=".8"/>
      <rect x="2.6" y="10.2" width="12.4" height="4.2" rx=".8"/><rect x="16" y="10.2" width="5.4" height="4.2" rx=".8"/>
      <rect x="2.6" y="15.4" width="6.4" height="4.2" rx=".8"/><rect x="10" y="15.4" width="11.4" height="4.2" rx=".8"/>
    </g>`,
  bronze: `<path d="M3.4 8.8h17.2v2.4l-4.6 1.6v2.4H7.9v-2.4l-4.5-1.6z" fill="${G.bronze}"/>
    <path d="M8.6 15.2h6.8l1.2 4.8H7.4z" fill="${G.stoneDark}"/>
    <path d="M6.4 8.8c1-3.4 3-5.2 5.6-5.2s4.6 1.8 5.6 5.2z" fill="#e0a552"/>`,
  shields: `<path d="M12 2.6l8 3v6.3c0 4.8-3.3 8.8-8 10.6-4.7-1.8-8-5.8-8-10.6V5.6z" fill="${G.stoneDark}"/>
    <path d="M12 5l5.4 2v4.8c0 3.4-2.2 6.3-5.4 7.7-3.2-1.4-5.4-4.3-5.4-7.7V7z" fill="${G.bronze}"/>
    <circle cx="12" cy="11.4" r="2.4" fill="${G.gold}"/>`,
  irrigation: `<path d="M4 6.4h12.8a3.2 3.2 0 013.2 3.2v11" stroke="${G.blue}" stroke-width="3.4"
      fill="none" stroke-linecap="round"/>
    <path d="M4 10.8h9a2 2 0 012 2v7.8" stroke="${G.blueDeep}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M6.4 15.2c0 1.6-1 2.4-2 2.4S2.4 16.8 2.4 15.2c0-1.3 2-3.8 2-3.8s2 2.5 2 3.8z" fill="${G.blue}"/>
    <path d="M9 18.6h3.4M9 21h5.4" stroke="${G.leaf}" stroke-width="1.8" stroke-linecap="round"/>`,
  medicine: `<path d="M7.2 3.4c3.2 1 5 2.8 5 5.4 0 2-1.4 3.4-3.2 3.4S5.6 10.9 5.6 9c0-2.4.6-4.2 1.6-5.6z"
      fill="${G.leaf}"/>
    <path d="M8.4 6.2c.4 2.2 1.4 3.8 3 4.8" stroke="#5a7a34" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M6.2 12.6h6.2l-.8 6a3.4 3.4 0 01-3.4 3h.2a3.4 3.4 0 01-3.4-3z" fill="${G.stone}"/>
    <rect x="5.4" y="11.6" width="7.8" height="1.9" rx=".9" fill="${G.stoneDark}"/>
    <path d="M15 8.2l4.8 4.8M19.8 8.2L15 13" stroke="${G.gold}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="17.4" cy="16.6" r="2" fill="${G.gold}"/>`,
  coinage: `<ellipse cx="9" cy="16.4" rx="6.6" ry="3.4" fill="${G.goldDeep}"/>
    <ellipse cx="9" cy="14.8" rx="6.6" ry="3.4" fill="${G.gold}"/>
    <ellipse cx="9" cy="13" rx="6.6" ry="3.4" fill="${G.goldDeep}"/>
    <ellipse cx="9" cy="11.4" rx="6.6" ry="3.4" fill="${G.gold}"/>
    <circle cx="17.2" cy="9" r="4.6" fill="${G.goldDeep}"/>
    <circle cx="17.2" cy="8.4" r="3.9" fill="${G.gold}"/>
    <path d="M17.2 6v4.8M15.8 7.2h2.2a1 1 0 010 2h-2.2" stroke="${G.goldDeep}" stroke-width="1.2"
      fill="none" stroke-linecap="round"/>`,
  logistics: `<path d="M3 16.6h13.4v-4.2H3z" fill="${G.wood}"/>
    <path d="M3 12.4h13.4v-2H3z" fill="#bf9a6d"/>
    <circle cx="6.4" cy="18.4" r="1.9" fill="${G.woodDark}"/>
    <circle cx="12.8" cy="18.4" r="1.9" fill="${G.woodDark}"/>
    <path d="M16.4 14h3l1.8-3.4-2.4-4.2h-3.4" stroke="${G.gold}" stroke-width="1.9" fill="none"
      stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18 3.4l3.4 3-3.8 1" fill="${G.gold}"/>`,
  rotate: `<path d="M19.4 12a7.4 7.4 0 11-2.2-5.3" stroke="${G.cloth}" stroke-width="2.5" fill="none"
      stroke-linecap="round"/>
    <path d="M17.8 2.6l.2 5-4.6-1.6z" fill="${G.cloth}"/>
    <rect x="8.8" y="8.8" width="6.4" height="6.4" rx="1.2" fill="${G.gold}"/>`,
  labor: `<circle cx="7.6" cy="7.4" r="2.7" fill="${G.cloth}"/>
    <path d="M2.8 17.6c0-3 2.2-5 4.8-5s4.8 2 4.8 5z" fill="${G.cloth}"/>
    <circle cx="16.4" cy="7.4" r="2.7" fill="#a8bccb"/>
    <path d="M11.6 17.6c0-3 2.2-5 4.8-5s4.8 2 4.8 5z" fill="#a8bccb"/>
    <path d="M4 20.4h16" stroke="${G.gold}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M8 20.4v-1.6M12 20.4v-2.4M16 20.4v-1.6" stroke="${G.gold}" stroke-width="1.6" stroke-linecap="round"/>`,
  upgrade: `<path d="M12 3l6.4 6.4h-3.6v5h-5.6v-5H5.6z" fill="${G.gold}"/>
    <rect x="6" y="16.4" width="12" height="2.2" rx=".9" fill="${G.stone}"/>
    <rect x="4.6" y="19.6" width="14.8" height="2.2" rx=".9" fill="${G.stoneDark}"/>`,

  // ---------- faction emblems ----------
  egypt: `<path d="M2.6 12.6c3.2-4.4 7-6.6 10.4-6.6 3.2 0 6 2 8.4 5.6-2.4 3.4-5.2 5.2-8.4 5.2-3.6 0-7.2-1.4-10.4-4.2z"
      fill="${G.cloth}"/>
    <circle cx="12.6" cy="11.6" r="3.1" fill="${G.blueDeep}"/>
    <circle cx="12.6" cy="11.6" r="1.3" fill="${G.dark}"/>
    <path d="M2.6 8.2C6 5 9.6 3.6 13 3.6c3.6 0 6.6 1.6 9 4.4" stroke="${G.gold}" stroke-width="1.9" fill="none"
      stroke-linecap="round"/>
    <path d="M13.8 17.2l-.8 4.2M10.4 17c-1.4 2-3.4 3.2-6 3.6" stroke="${G.gold}" stroke-width="1.9" fill="none"
      stroke-linecap="round"/>`,
  greece: `<path d="M12 3.4l7.2 17.2h-4L12 11.4 8.8 20.6h-4z" fill="${G.cloth}"/>
    <path d="M12 3.4l7.2 17.2h-4L12 11.4z" fill="#c9d6e2"/>`,
  rome: `<g fill="${G.gold}">
      <path d="M12 8.2c1 0 1.7.8 1.7 1.8 0 .5-.2 1-.5 1.3l.4 1.4 1.1 5.2-2.7 3.5-2.7-3.5 1.1-5.2.4-1.4a1.8 1.8 0 01-.5-1.3c0-1 .7-1.8 1.7-1.8z"/>
      <path d="M10.4 11.4L1.8 7.6l1.9 4.2-2 .5 3.3 1.9-1 1.1 4.6.4z"/>
      <path d="M13.6 11.4l8.6-3.8-1.9 4.2 2 .5-3.3 1.9 1 1.1-4.6.4z"/>
    </g>
    <path d="M12 3.4l1.1 2.2 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4L8.5 5.9l2.4-.3z" fill="${G.goldDeep}"/>`,

  // ---------- difficulty ----------
  laurel: `<path d="M12 21c-4-2-6.4-5.6-6.4-9.6C5.6 7 8.2 4 12 3c3.8 1 6.4 4 6.4 8.4 0 4-2.4 7.6-6.4 9.6z"
      fill="none" stroke="${G.leaf}" stroke-width="1.8"/>
    <g fill="${G.leaf}"><ellipse cx="7.4" cy="9" rx="1.5" ry="2.4" transform="rotate(-35 7.4 9)"/>
      <ellipse cx="8" cy="13.4" rx="1.5" ry="2.4" transform="rotate(-20 8 13.4)"/>
      <ellipse cx="16.6" cy="9" rx="1.5" ry="2.4" transform="rotate(35 16.6 9)"/>
      <ellipse cx="16" cy="13.4" rx="1.5" ry="2.4" transform="rotate(20 16 13.4)"/></g>`,
  ironhelm: `<path d="M4.6 13.4C4.6 7.9 7.9 4.2 12 4.2s7.4 3.7 7.4 9.2v1.6h-3.8v-1.6c0-2.4-1.6-4-3.6-4s-3.6 1.6-3.6 4v6.8H4.6z"
      fill="${G.steel}"/>
    <path d="M12 2.2c2.8 0 4.8 1.8 5.6 4.4-1.4-1.2-3-1.8-5.6-1.8s-4.2.6-5.6 1.8C7.2 4 9.2 2.2 12 2.2z" fill="${G.stoneDark}"/>`
};

export type IconName = keyof typeof P | string;

/** Returns a complete inline <svg> string for the named icon. */
export function icon(name: IconName, size = 20, cls = ''): string {
  const body = P[name];
  if (!body) return '';
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

export function hasIcon(name: string): boolean {
  return !!P[name];
}
