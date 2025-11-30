import type { RGB } from "./image";
import type { Char } from "./websocket";
import type { RawEdit } from "./owot";

export const sleep = Bun.sleep;

export function hsvToRgb(h: number, s: number, v: number){
    let r: number, g: number, b: number;

    let i = Math.floor(h * 6);
    let f = h * 6 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);

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
	if(tile_x < 0) tile_x = 16 + tile_x;
	if(tile_y < 0) tile_y = 8 + tile_y;
	return [chunk_x, chunk_y, tile_x, tile_y];
}

export function chunkCoordsToCoords([chunk_x, chunk_y, tile_x, tile_y]: [number, number, number, number]): [number, number] {
	return [ chunk_x * 16 + tile_x, chunk_y * 8 + tile_y ];
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
	return `\x1b[38;2;${fgr};${fgg};${fgb};48;2;${bgr};${bgg};${bgb}m${char.char}\x1b[39;49m`;
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

export function deep_equal<T>(a: T, b: T): boolean {
	if(typeof a == "object") {
		let keys = [];
		for(let key in a) {
			keys.push(key);
			if(!deep_equal(a[key], b[key])) return false;
		}
		
		for(let key in b) {
			if(!keys.includes(key)) return false;
		}

		return true;
	} else {
		return a === b;
	}
}

/** Equivalent to deep_equal, but does not check for keys present in B that are missing in A. */
// export function deep_matches<T>(a: Partial<T>, b: T): true | string {
// 	if(typeof a == "object" && typeof b == "object") {
// 		for(let key in a) {
// 			let result = deep_matches(a[key], b[key]);
// 			if(result !== true) {
// 				return `.${key}${result}`;
// 			}
// 		}
// 		return true;
// 	} else {
// 		if(typeof a !== typeof b) return `: type mismatch (${typeof a} vs ${typeof b})`;
// 		else if(a != b) return `: value mismatch (${a} vs ${b})`;
// 		else return true;
// 	}
// }
