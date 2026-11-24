"""Build the state backdrop from the packaged Census atlases (Shapely 2.1)."""
import gzip
import json
import re
from pathlib import Path

import shapely
from shapely import affinity
from shapely.geometry import MultiLineString, box


def read_state(path):
    atlas = json.loads(gzip.decompress(path.read_bytes()))
    rings = []
    for line in re.findall(r'M([^Z]+)Z', atlas['outline']):
        points = [tuple(map(int, pair.split(','))) for pair in line.split()]
        rings.append(points + [points[0]])
    local = shapely.build_area(MultiLineString(rings))
    x, y = atlas['origin']
    unit = atlas['metersPerUnit']
    world = affinity.affine_transform(local, [unit, 0, 0, -unit, x, y])
    a, b, c, d = atlas['fit']
    focus = box(x + a*unit, y - d*unit, x + c*unit, y - b*unit)
    return dict(name=atlas['name'], origin=(x, y), unit=unit, local=local, world=world, focus=focus)


def outline(geometry):
    paths = []
    for polygon in shapely.get_parts(geometry):
        if polygon.geom_type != 'Polygon':
            continue
        for ring in [polygon.exterior, *polygon.interiors]:
            points = [(round(x), round(y)) for x, y in ring.coords[:-1]]
            if len(set(points)) >= 3:
                paths.append('M' + ' '.join(f'{x},{y}' for x, y in points) + 'Z')
    return ''.join(paths)


def build_context(directory):
    charts = {path.name[:2]: read_state(path) for path in sorted(directory.glob('[A-Z][A-Z].json.gz'))}
    outlines, views = {}, {}
    for code, chart in charts.items():
        x, y = chart['origin']
        unit = chart['unit']
        shape = chart['local'].simplify(min(22, 90/unit))
        outlines[code] = dict(name=chart['name'], path=outline(shape))
        focus = chart['focus']
        west, south, east, north = focus.bounds
        span = max(east-west, north-south)
        nearby = min(300_000, span * .72)
        window = focus.buffer(nearby, join_style='mitre').envelope
        neighbors = []
        for other, region in charts.items():
            land = region['world']
            if other == code or not window.intersects(land) or chart['world'].distance(land) > nearby:
                continue
            ox, oy = region['origin']
            translate = [(ox-x)/unit, (y-oy)/unit]
            scale = region['unit']/unit
            # Several geographic anchors let narrow and wide views label the
            # portion of a neighbor actually on screen, clear of its borders.
            anchors = []
            for horizontal, vertical in [(.13, .025), (.30, .06), (.06, .26), (.62, .45)]:
                visible = land.intersection(box(west-span*horizontal, south-span*vertical,
                                                east+span*horizontal, north+span*vertical))
                polygons = [p for p in shapely.get_parts(visible) if p.geom_type == 'Polygon' and p.area > 0]
                if not polygons:
                    continue
                part = max(polygons, key=lambda p: p.area)
                circle = shapely.maximum_inscribed_circle(part, tolerance=max(1, span/400))
                ax, ay = circle.coords[0]
                radius = circle.length / unit
                if radius > 0:
                    anchors.append([round((ax-x)/unit), round((y-ay)/unit), round(radius)])
            neighbors.append(dict(state=other, offset=[round(v, 4) for v in translate],
                                  scale=round(scale, 9), anchors=anchors))
        views[code] = neighbors
    used = {item['state'] for neighbors in views.values() for item in neighbors}
    data = json.dumps(dict(outlines={k: v for k, v in outlines.items() if k in used}, views=views),
                      ensure_ascii=False, separators=(',', ':')).encode()
    (directory / 'context.json.gz').write_bytes(gzip.compress(data, mtime=0))


if __name__ == '__main__':
    build_context(Path(__file__).resolve().parents[2] / 'sales' / 'territory-map-data')
