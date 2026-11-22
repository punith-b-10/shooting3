import type { MapId } from '../core/types';
import { MapBuilder, type MapData, type MapDef } from './MapData';
import { desertFortress } from './desert';
import { urbanCity } from './urban';
import { industrialWarehouse } from './warehouse';
import { forestOutpost } from './forest';

export const MAPS: Record<MapId, MapDef> = {
  desert: desertFortress,
  urban: urbanCity,
  warehouse: industrialWarehouse,
  forest: forestOutpost,
};
export const MAP_ORDER: MapId[] = ['desert', 'urban', 'warehouse', 'forest'];

const cache = new Map<MapId, MapData>();
/** Builds (and caches) the static layout of a map. Pure data — no rendering or physics. */
export function buildMapData(id: MapId): MapData {
  let d = cache.get(id);
  if (!d) {
    const b = new MapBuilder(id, 44);
    MAPS[id].build(b);
    d = b.data;
    cache.set(id, d);
  }
  return d;
}
