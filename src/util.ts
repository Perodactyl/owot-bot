import type { RGB } from "./image";
import type { Char, RawEdit } from "./websocket";

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

export function rgb2hex(color: RGB): number {
	return (color[0] << 16) | (color[1] << 8) | color[2];
}

export function hex2rgb(color: number): RGB {
	return [
		(color & 0xFF0000) >> 16,
		(color & 0x00FF00) >> 8,
		(color & 0x0000FF),
	];
}

export function char2ansi(char: Char): string {
	let [fgr, fgg, fgb] = hex2rgb(char.fg);
	let [bgr, bgg, bgb] = hex2rgb(char.bg);
	return `\x1b[38;2;${fgr};${fgg};${fgb};48;2;${bgr};${bgb};${bgb}m${char.char}\x1b[39;49m`;
}

export function raw2char(raw: RawEdit): Char {
	let [cy, cx, sy, sx, _t, char, _i, fg, bg] = raw;
	return {
		x: cx * 16 + sx,
		y: cy * 8 +sy,
		char,
		fg,
		bg,
	}
}
