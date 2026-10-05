/**
 * A display printing with every Scryfall-searchable field the pipeline ships (links, prices and purchase URIs dropped).
 * Field names follow Scryfall's card objects so local query semantics read like Scryfall's.
 */
export interface Face {
  name: string;
  printed_name?: string;
  flavor_name?: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  printed_type_line?: string;
  oracle_text?: string;
  printed_text?: string;
  flavor_text?: string;
  colors?: string[];
  color_indicator?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  artist?: string;
  watermark?: string;
  layout?: string;
  /** True when this face has its own image (transforming and modal DFCs). */
  img?: boolean;
}

export interface Printing {
  id: string;
  oracle_id: string;
  name: string;
  printed_name?: string;
  /** Universes Beyond in-world name; Scryfall's name search matches it. */
  flavor_name?: string;
  lang: string;
  released_at: string;
  layout: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  printed_type_line?: string;
  oracle_text?: string;
  printed_text?: string;
  flavor_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
  colors?: string[];
  color_identity: string[];
  color_indicator?: string[];
  keywords: string[];
  produced_mana?: string[];
  /** Format → 'legal' | 'banned' | 'restricted'; not_legal formats are omitted. */
  legalities: Record<string, string>;
  games: string[];
  reserved: boolean;
  game_changer?: boolean;
  foil: boolean;
  nonfoil: boolean;
  finishes: string[];
  oversized: boolean;
  promo: boolean;
  promo_types?: string[];
  reprint: boolean;
  variation: boolean;
  set: string;
  set_name: string;
  set_type: string;
  collector_number: string;
  digital: boolean;
  rarity: string;
  artist?: string;
  border_color: string;
  frame: string;
  frame_effects?: string[];
  security_stamp?: string;
  full_art: boolean;
  textless: boolean;
  booster: boolean;
  story_spotlight: boolean;
  watermark?: string;
  edhrec_rank?: number;
  penny_rank?: number;
  card_faces?: Face[];
  /** Image cache-busting version from Scryfall's image URLs. */
  image_version?: string;
  /** Image status (missing, placeholder, lowres, highres_scan). */
  image_status?: string;
}

export type ImageSize = 'display' | 'large' | 'png' | 'grid' | 'thumb' | 'normal' | 'small' | 'art_crop';

const EXT: Record<ImageSize, string> = { display: 'webp', large: 'jpg', png: 'png', grid: 'webp', thumb: 'webp', normal: 'jpg', small: 'jpg', art_crop: 'jpg' };

export function hasFaceImages(p: Printing): boolean {
  return (p.card_faces ?? []).some((f) => f.img);
}

/** Scryfall image URL for a printing face (cards.scryfall.io/{size}/{face}/{a}/{b}/{id}.{ext}). */
export function imageUrl(p: Pick<Printing, 'id' | 'image_version'>, size: ImageSize, face: 'front' | 'back' = 'front'): string {
  const v = p.image_version ? `?${p.image_version}` : '';
  return `https://cards.scryfall.io/${size}/${face}/${p.id[0]}/${p.id[1]}/${p.id}.${EXT[size]}${v}`;
}

export function frontFace(p: Printing): Face {
  return p.card_faces?.[0] ?? { name: p.name, mana_cost: p.mana_cost, type_line: p.type_line, oracle_text: p.oracle_text, colors: p.colors, power: p.power, toughness: p.toughness, loyalty: p.loyalty, defense: p.defense };
}

/** Name shown to players: OM1 printings show their Arena (printed) name. */
export function displayName(p: Printing): string {
  const f = p.card_faces?.[0];
  return f?.printed_name ?? p.printed_name ?? (f ? f.name : p.name);
}

export function faces(p: Printing): Face[] {
  return p.card_faces && p.card_faces.length > 0 ? p.card_faces : [frontFace(p)];
}

/** Colors of a printing; multi-faced cards without top-level colors use the front face. */
export function cardColors(p: Printing): string[] {
  return p.colors ?? p.card_faces?.[0]?.colors ?? [];
}
