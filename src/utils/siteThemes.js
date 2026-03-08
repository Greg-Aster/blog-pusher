export const SITE_THEMES = [
  {
    id: 'temporal',
    label: 'Temporal Flow',
    title: 'Temporal Flow',
    subtitle: 'A Decentralized Content Platform',
    hue: 0,
    color: '#d96c6c',
  },
  {
    id: 'dndiy',
    label: 'DNDIY',
    title: 'Greg Aster',
    subtitle: 'Experimental Videographer & Creator',
    hue: 200,
    color: '#4a90d9',
  },
  {
    id: 'travel',
    label: 'Trail Log',
    title: 'Greg Aster Trail Log',
    subtitle: 'PCT 2026 | Field Notes, Gear, and Trail Lessons',
    hue: 145,
    color: '#2d8a60',
  },
  {
    id: 'megameal',
    label: 'MEGAMEAL',
    title: 'MEGA MEAL SAGA',
    subtitle: 'Consuming Time Itself Since 3042',
    hue: 220,
    color: '#547ee8',
  },
]

export const SITE_THEME_MAP = Object.fromEntries(SITE_THEMES.map(site => [site.id, site]))

export function getSiteTheme(siteId) {
  return SITE_THEME_MAP[siteId] || SITE_THEME_MAP.temporal
}
