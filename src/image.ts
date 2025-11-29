import { readFile } from "node:fs/promises";
import type { Char } from "./websocket";
import { rgb2hex } from "./util";

export type RGB = [number, number, number];

export interface Image {
	readonly width: number;
	readonly height: number;
	/** RGB 0..256 */
	get(x: number, y: number): RGB;
	get_checked(x: number, y: number): RGB | undefined;
}

export class PPM implements Image {
	private pixel_data: Buffer;
	public readonly width: number;
	public readonly height: number;
	public readonly depth: 255 | 65535;
	constructor(buf: Buffer) {
		let format = buf.toString("ascii", 0, 2);
		if(format != "P6") throw "Not a binary PPM";
		let head_end = 2;
		let newline_count = 0;
		while(newline_count <= 2) {
			if(buf.readUint8(head_end) == 0x0a) {
				newline_count += 1;
			}
			head_end += 1;
		}
		let header = buf.toString("ascii", 0, head_end);
		let [str_format, str_dimensions, str_depth] = header.split("\n");
		if(!str_dimensions) throw `Malformed header`;
		let [str_width, str_height] = str_dimensions.split(" ");
		if(str_format != "P6") throw `Not a binary PPM`;

		let width = Number(str_width);
		let height = Number(str_height);
		let depth = Number(str_depth);
		if(depth != 255 && depth != 65535) throw `Depth is ${depth} (expected 255 or 65535)`;

		this.width = width;
		this.height = height;
		this.depth = depth;

		let pixel_data = buf.subarray(head_end);
		this.pixel_data = pixel_data;
	}

	public get(x: number, y: number): RGB {
		if(this.depth == 255) return [
			this.pixel_data.readUint8((y * this.width + x) * 3 + 0),
			this.pixel_data.readUint8((y * this.width + x) * 3 + 1),
			this.pixel_data.readUint8((y * this.width + x) * 3 + 2),
		]; else return [ //Only reads high bytes
			this.pixel_data.readUint8((y * this.width + x) * 6 + 0),
			this.pixel_data.readUint8((y * this.width + x) * 6 + 2),
			this.pixel_data.readUint8((y * this.width + x) * 6 + 4),
		];
	}
	public get_checked(x: number, y: number): RGB | undefined {
	    if(x >= 0 && x < this.width && y >= 0 && y < this.height) return this.get(x, y);
	}
}

const OCTANTS: string[] = [..." 𜺨𜺫🮂𜴀▘𜴁𜴂𜴃𜴄▝𜴅𜴆𜴇𜴈▀𜴉𜴊𜴋𜴌🯦𜴍𜴎𜴏𜴐𜴑𜴒𜴓𜴔𜴕𜴖𜴗𜴘𜴙𜴚𜴛𜴜𜴝𜴞𜴟🯧𜴠𜴡𜴢𜴣𜴤𜴥𜴦𜴧𜴨𜴩𜴪𜴫𜴬𜴭𜴮𜴯𜴰𜴱𜴲𜴳𜴴𜴵🮅𜺣𜴶𜴷𜴸𜴹𜴺𜴻𜴼𜴽𜴾𜴿𜵀𜵁𜵂𜵃𜵄▖𜵅𜵆𜵇𜵈▌𜵉𜵊𜵋𜵌▞𜵍𜵎𜵏𜵐▛𜵑𜵒𜵓𜵔𜵕𜵖𜵗𜵘𜵙𜵚𜵛𜵜𜵝𜵞𜵟𜵠𜵡𜵢𜵣𜵤𜵥𜵦𜵧𜵨𜵩𜵪𜵫𜵬𜵭𜵮𜵯𜵰𜺠𜵱𜵲𜵳𜵴𜵵𜵶𜵷𜵸𜵹𜵺𜵻𜵼𜵽𜵾𜵿𜶀𜶁𜶂𜶃𜶄𜶅𜶆𜶇𜶈𜶉𜶊𜶋𜶌𜶍𜶎𜶏▗𜶐𜶑𜶒𜶓▚𜶔𜶕𜶖𜶗▐𜶘𜶙𜶚𜶛▜𜶜𜶝𜶞𜶟𜶠𜶡𜶢𜶣𜶤𜶥𜶦𜶧𜶨𜶩𜶪𜶫▂𜶬𜶭𜶮𜶯𜶰𜶱𜶲𜶳𜶴𜶵𜶶𜶷𜶸𜶹𜶺𜶻𜶼𜶽𜶾𜶿𜷀𜷁𜷂𜷃𜷄𜷅𜷆𜷇𜷈𜷉𜷊𜷋𜷌𜷍𜷎𜷏𜷐𜷑𜷒𜷓𜷔𜷕𜷖𜷗𜷘𜷙𜷚▄𜷛𜷜𜷝𜷞▙𜷟𜷠𜷡𜷢▟𜷣▆𜷤𜷥█"];

export function color_diff(a: RGB, b: RGB): number {
	return Math.sqrt(
		  (a[0] - b[0]) ** 2
		+ (a[1] - b[1]) ** 2
		+ (a[2] - b[2]) ** 2
	);
}

export function color_avg(...colors: RGB[]): RGB {
	let avg = <RGB>[0, 0, 0];
	for(let px of colors) {
		avg[0] += px[0];
		avg[1] += px[1];
		avg[2] += px[2];
	}
	avg[0] = Math.floor(avg[0] / colors.length);
	avg[1] = Math.floor(avg[1] / colors.length);
	avg[2] = Math.floor(avg[2] / colors.length);
	return avg;
}

function classify(pixels: (RGB)[]): { a: RGB, b: RGB, classes: (0 | 1)[] } {
	let a = pixels[0] ?? [0, 0, 0];
	let b = pixels[7] ?? [255, 255, 255];

	let unique_colors = [];
	for(let px of pixels) {
		if(!unique_colors.find(c => c[0] == px[0] && c[1] == px[1] && c[2] == px[2])) {
			unique_colors.push(px);
		}
	}

	if(unique_colors.length == 1) {
		a = unique_colors[0];
		b = unique_colors[0];
		// a = [255, 0, 0]
		// b = [255, 0, 0]
	} else if(unique_colors.length == 2) {
		a = unique_colors[0];
		b = unique_colors[1];
		// a = [0, 255, 0]
		// b = [0, 0, 255]
	} else {
		// 1. Determine 2 most distant colors
		let px_a = <RGB>[0,0,0], px_b = <RGB>[0,0,0];
		for(let px1 of pixels) {
			for(let px2 of pixels) {
				if(color_diff(px1, px2) > color_diff(px_a, px_b)) {
					px_a = px1;
					px_b = px2;
				}
			}
		}
		// 2. Determine which of the 2 each other pixel is closest to
		let cluster_a: RGB[] = [];
		let cluster_b: RGB[] = [];
		for(let px of pixels) {
			if(color_diff(px, px_a) > color_diff(px, px_b)) {
				cluster_b.push(px);
			} else {
				cluster_a.push(px);
			}
		}
		// 3. Compute average of each cluster
		a = color_avg(...cluster_a);
		b = color_avg(...cluster_b);
	}

	let classes: (0 | 1)[] = [];
	for(let pixel of pixels) {
		classes.push(color_diff(pixel, a) > color_diff(pixel, b) ? 1 : 0);
	}
	return { a, b, classes };
}

export function to_octants(image: Image): {char: string, fg: RGB, bg: RGB}[][] {
	let width_chars = Math.ceil(image.width / 2);
	let height_chars = Math.ceil(image.height / 4);

	let output: any[] = [];
	for(let cell_y = 0; cell_y < height_chars; cell_y++) {
		let row: any[] = [];
		for(let cell_x = 0; cell_x < width_chars; cell_x++) {
			let pixels = [
				image.get_checked(cell_x * 2 + 0, cell_y * 4 + 0) ?? [0, 0, 0],
				image.get_checked(cell_x * 2 + 1, cell_y * 4 + 0) ?? [0, 0, 0],
				image.get_checked(cell_x * 2 + 0, cell_y * 4 + 1) ?? [0, 0, 0],
				image.get_checked(cell_x * 2 + 1, cell_y * 4 + 1) ?? [0, 0, 0],
				image.get_checked(cell_x * 2 + 0, cell_y * 4 + 2) ?? [0, 0, 0],
				image.get_checked(cell_x * 2 + 1, cell_y * 4 + 2) ?? [0, 0, 0],
				image.get_checked(cell_x * 2 + 0, cell_y * 4 + 3) ?? [0, 0, 0],
				image.get_checked(cell_x * 2 + 1, cell_y * 4 + 3) ?? [0, 0, 0],
			];
			let classification = classify(pixels);
			let char = OCTANTS[
				classification.classes[0] as (0|1) << 0 |
				classification.classes[1] as (0|1) << 1 |
				classification.classes[2] as (0|1) << 2 |
				classification.classes[3] as (0|1) << 3 |
				classification.classes[4] as (0|1) << 4 |
				classification.classes[5] as (0|1) << 5 |
				classification.classes[6] as (0|1) << 6 |
				classification.classes[7] as (0|1) << 7
			];
			row.push({char, fg: classification.b, bg: classification.a});
		}
		output.push(row);
	}

	return output;
}

export function to_edits(image: Image, x: number, y: number): Char[] {
	let octants = to_octants(image);
	let output: Char[] = [];
	for(let img_y = 0; img_y < octants.length; img_y++) {
		for(let img_x = 0; img_x < octants[img_y].length; img_x++) {
			let ch = octants[img_y][img_x];
			output.push({
				x: x + img_x,
				y: y + img_y,
				char: ch.char,
				fg: rgb2hex(ch.fg),
				bg: rgb2hex(ch.bg),
			});
		}
	}

	return output;
}

// let test = new PPM(await readFile("test.ppm"));
// console.log(to_octants(test).map(row=>row.map(({char, fg, bg})=>{
// 	return `\x1b[38;2;${fg[0]};${fg[1]};${fg[2]};48;2;${bg[0]};${bg[1]};${bg[2]}m${char}\x1b[39;49m`;
// }).join("")).join("\n"));
