// The palette: the project's single theme for in-world art.
//
// Sampled from the reference picture the user chose (bright, cozy cartoon lake), then
// rounded into named roles. Draw with these daytime colors; scene.col() grades them for
// time of day, weather and distance, so the whole scene shifts together.

export const C = {
  /** Dark warm-brown outline used on foreground objects (dock, reeds, bobber, character). */
  outline: '#43362b',
  /** Deepest ink for eyes and tiny details. */
  ink: '#2b231d',
  white: '#ffffff',

  /** Daytime sky (zenith → horizon); the lighting keyframes use these for the day look. */
  sky: { top: '#85c9f1', mid: '#a5daf9', low: '#bfe4fb' },
  cloud: { lit: '#ffffff', mid: '#f1f9fe', shade: '#dcf0fb', base: '#c6e4f6' },
  sun: { core: '#fef7c0', rim: '#fff1a6', glow: '#fffbe3' },

  /** Far hills and tree line. No outlines on background shapes. */
  hill: { far: '#a3dbab', light: '#80c88c', mid: '#6cb97c', dark: '#5ba96e', shadow: '#4c9660' },
  tree: { light: '#7cc58a', mid: '#5ba96e', dark: '#4a985d', deep: '#3d8550', trunk: '#7a5a3c' },
  shore: { haze: '#c6ebf9', foam: '#ecf9fe', reflect: '#79bfc9' },

  /** Lake, horizon → foreground. */
  water: {
    horizon: '#9ad8ee',
    high: '#7ec4e8',
    mid: '#3c99d6',
    low: '#2c74ae',
    deep: '#21649c',
    deepest: '#1a5287',
    ripple: '#e8f7fe',
    rippleDim: '#a6d8f3',
    shadow: '#2f80bf',
    shaft: '#a9dcf1',
  },

  wood: { hi: '#e6ad6d', top: '#d29657', alt: '#c98a4f', mid: '#b47d4b', side: '#a37347', dark: '#845831', line: '#4a392c' },
  reed: { head: '#8b5a2f', headHi: '#a9733f', headDark: '#6b4423', stem: '#5c9641', stemHi: '#7ab35a', leaf: '#6ac14e', leafHi: '#8fd36f', leafDark: '#4a9a3b' },
  lily: { pad: '#76d158', padHi: '#98de75', padDark: '#4fa344', flower: '#f39ab8', flowerHi: '#ffc9dc', center: '#ffd966' },
  bobber: { red: '#df514f', redHi: '#f47c70', white: '#fafdff' },
  metal: { hi: '#eef3f8', light: '#c3cfdc', mid: '#9fb0c6', dark: '#7b8ea8' },
  fishingLine: '#f4fbff',

  /** General ramps (dark → light) for characters, fish and props. */
  skin: ['#8f553f', '#c98360', '#efb48b', '#ffd6b3'],
  red: ['#8c2f35', '#c9443f', '#ee6a5c', '#ff9c8a'],
  orange: ['#a4521f', '#e07b2e', '#f9a447', '#ffc979'],
  yellow: ['#b7861c', '#e8b52c', '#ffd84f', '#fff0a0'],
  green: ['#2f6b35', '#4a9a3b', '#6ac14e', '#a6e08a'],
  teal: ['#1f6f73', '#2e9a99', '#4cc4bd', '#9ce6dd'],
  blue: ['#1f4f8a', '#2f74c0', '#4f9be0', '#93c8f5'],
  purple: ['#4b3478', '#6e4fae', '#9a7bd6', '#c9b5f0'],
  pink: ['#9a3d6b', '#d4609a', '#f28fbd', '#ffc6de'],
  brown: ['#4a392c', '#6e4f37', '#94704f', '#b99472'],
  gray: ['#4b5160', '#737b8c', '#a3abba', '#d4d9e2'],

  /** Emitted light (draw with scene.raw / glow — never graded). */
  light: {
    lamp: '#ffd27a',
    window: '#ffc864',
    moon: '#eef3ff',
    star: '#ffffff',
    firefly: '#e2ff8a',
    lightning: '#f2f5ff',
    sparkle: '#fffbe3',
  },
} as const;
