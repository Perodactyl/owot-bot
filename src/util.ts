export const sleep = Bun.sleep;

export function hsvToRgb(h: number, s: number, v: number){
    var r, g, b;

    var i = Math.floor(h * 6);
    var f = h * 6 - i;
    var p = v * (1 - s);
    var q = v * (1 - f * s);
    var t = v * (1 - (1 - f) * s);

    switch(i % 6){
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
		default: throw "unreachable";
    }

	return (Math.floor(r * 255) << 16) | (Math.floor(g * 255) << 8) | Math.floor(b * 255);
}

export function coordsToChunkCoords(x: number, y: number): [number, number, number, number] {
	let chunk_x = Math.floor(x / 16);
	let chunk_y = Math.floor(y / 8);
	let tile_x = x % 16;
	let tile_y = y % 8;
	if(x < 0) tile_x = 16 + tile_x;
	if(y < 0) tile_y = 8 + tile_y;
	return [chunk_x, chunk_y, tile_x, tile_y];
}
