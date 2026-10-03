const PATHS: Record<string, string> = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  filter: 'M4 6h16M7 12h10M10 18h4',
  zoom: 'M10.5 4a6.5 6.5 0 104.1 11.5L20 21M10.5 7.5v6M7.5 10.5h6',
  flip: 'M4 9a8 8 0 0114-3l2 2M20 15a8 8 0 01-14 3l-2-2M18 3v5h-5M6 21v-5h5',
  text: 'M5 6h14M5 10h14M5 14h9M5 18h11',
  skip: 'M6 6l7 6-7 6V6zM16 6v12',
  stats: 'M5 19V11M10 19V6M15 19v-9M20 19V4',
  insights: 'M12 3a6 6 0 00-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0012 3zM9.5 20.5h5',
  history: 'M4 12a8 8 0 108-8 8 8 0 00-6 2.7L4 9M4 4v5h5M12 8v4l3 2',
  settings: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1-1-3-2 .2-1.3-1.4.2-2-3-1-1 2h-2L8 3.8l-3 1 .2 2L4 8.3 2 8l-1 3 2 1v2l-2 1 1 3 2-.2 1.3 1.4-.2 2 3 1 1-2h2l1 2 3-1-.2-2 1.3-1.4 2 .2 1-3-2-1z',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5v.5',
  play: 'M8 5l11 7-11 7V5z',
  compare: 'M7 4v16M17 4v16M3 8h8M13 16h8',
  shuffle: 'M4 7h3c4 0 6 10 10 10h3M17 14l3 3-3 3M4 17h3c1.5 0 2.7-1.4 3.8-3.2M14.2 9.2C15.3 7.4 16.5 7 17 7h3M17 4l3 3-3 3',
  target: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7a5 5 0 100 10 5 5 0 000-10zM12 11a1 1 0 100 2 1 1 0 000-2z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  check: 'M5 12l5 5L20 7',
  data: 'M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  save: 'M5 4h11l3 3v13H5V4zM8 4v5h7V4M8 20v-6h8v6',
  trash: 'M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3',
  sound: 'M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11',
  mute: 'M4 9v6h4l5 4V5L8 9H4zM16 9l5 6M21 9l-5 6',
  install: 'M12 3v12M7 10l5 5 5-5M4 17v3h16v-3',
  chevron: 'M9 6l6 6-6 6',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, title }: { name: IconName; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}
