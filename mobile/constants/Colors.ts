/**
 * Mizani design tokens — warm commercial earth tones anchored to forest-green
 * brand primary, layered with a premium dark cinema mode.
 *
 * Token architecture follows ui-ux-pro-max "Modern Dark (Cinema Mobile)" style:
 * — Dark-first: deep navy/charcoal base, gold trust accent
 * — 8dp spacing rhythm (consumed by Ui.tsx)
 * — Semantic status tokens for Badge components
 */

const BRAND_GREEN_LIGHT = '#0F6B4C';
const BRAND_GREEN_DARK  = '#3DB88A';
const BRAND_GOLD        = '#F59E0B'; // trust accent (ui-ux-pro-max recommendation)

export default {
  light: {
    // ── Base surfaces
    text:            '#1A1F1C',
    textMuted:       '#5C675F',
    textOnPrimary:   '#FFFDF8',
    background:      '#F3EEE4',
    surface:         '#FFFDF8',
    surfaceElevated: '#FFFFFF',
    border:          '#D9D0C2',
    borderStrong:    '#B8AFA0',

    // ── Brand
    tint:            BRAND_GREEN_LIGHT,
    accent:          '#C45C26',
    gold:            BRAND_GOLD,

    // ── Status — semantic
    danger:          '#B42318',
    dangerBg:        '#FEF3F2',
    success:         '#027A48',
    successBg:       '#ECFDF3',
    warning:         '#B54708',
    warningBg:       '#FFFAEB',
    info:            '#026AA2',
    infoBg:          '#F0F9FF',

    // ── Tab bar
    tabIconDefault:  '#8A918A',
    tabIconSelected: BRAND_GREEN_LIGHT,

    // ── Gradient (hero strip, pulse screen)
    gradientStart:   '#0F6B4C',
    gradientEnd:     '#1A4A35',

    // ── Overlay / scrim
    scrim:           'rgba(0,0,0,0.45)',

    // ── Shadow (used by elevated Card)
    shadow:          '#000000',
  },

  dark: {
    // ── Base surfaces
    text:            '#F3EEE4',
    textMuted:       '#A8B0A8',
    textOnPrimary:   '#0F1410',
    background:      '#0E1210',
    surface:         '#181E1B',
    surfaceElevated: '#202820',
    border:          '#2E3632',
    borderStrong:    '#3F4A42',

    // ── Brand
    tint:            BRAND_GREEN_DARK,
    accent:          '#E08A4F',
    gold:            BRAND_GOLD,

    // ── Status — semantic
    danger:          '#F97066',
    dangerBg:        '#3A1715',
    success:         '#32D583',
    successBg:       '#0A2A1A',
    warning:         '#FDB022',
    warningBg:       '#2A1F08',
    info:            '#36BFFA',
    infoBg:          '#071E2A',

    // ── Tab bar
    tabIconDefault:  '#6B736B',
    tabIconSelected: BRAND_GREEN_DARK,

    // ── Gradient (hero strip, pulse screen)
    gradientStart:   '#1A3A2A',
    gradientEnd:     '#0E1210',

    // ── Overlay / scrim
    scrim:           'rgba(0,0,0,0.65)',

    // ── Shadow (used by elevated Card)
    shadow:          '#000000',
  },
};
