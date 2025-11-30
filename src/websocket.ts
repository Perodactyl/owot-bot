import { EventEmitter } from "node:events";
import { coordsToChunkCoords, hex2rgb } from "./util";
import { color_diff } from "./image";
import type { ChunkInfo, ChunkLocationKey, SentMessage, ReceivedMessage, ChunkCoord, TileCoord, RawEdit, URLLinkRequest, CoordLinkRequest, CmdMessage, CmdUMessage } from "./owot";

export type CharLink = { type: "url", url: string } | { type: "coord", link_tileX: number, link_tileY: number };

export interface Char {
	x: number,
	y: number,
	char: string,
	fg?: number,
	bg?: number,
	link?: CharLink;
	bold?: boolean,
	italic?: boolean,
	underline?: boolean,
	strikethrough?: boolean,
}

export interface Edit {
	into_chars(): Char[];
}

export declare interface CommandEmitter {
	on<E extends string>(event: E, listener: (ev: (CmdMessage | CmdUMessage) & { data: E })=>void): this;
}

export class CommandEmitter extends EventEmitter {}

export class ServerConnection extends EventEmitter {
	public readonly url: string;
	private ws: WebSocket;
	private chunks = new Map<ChunkLocationKey, ChunkInfo | null>();
	private next_edit_id = 0;
	private pending_edits = new Map<number, Char>();
	private pending_chunks = new Map<ChunkLocationKey, (chunk: ChunkInfo | null)=>void>;
	private awaiting_sync_finish: Array<()=>void> = [];

	public commands = new CommandEmitter();

	constructor(public world:string="", token?:string, public rate_limit:number=1000) {
		super();
		if(world != "") this.url = `wss://ourworldoftext.com/${world}/ws/`;
		else this.url = "wss://ourworldoftext.com/ws/";
		if(token == undefined) this.ws = new WebSocket(this.url);
		else this.ws = new WebSocket(this.url, {
			headers: {
				"cookie": `token=${token}`
			}
		});
		this.ws.onmessage = ev => {
			this.on_message(JSON.parse(ev.data) as ReceivedMessage);
		}
		this.ws.onclose = ev => {
			console.error("Websocket closed.", ev);
			process.exit(1);
		}
	}

	private on_message(msg: ReceivedMessage) {
		// if(msg.kind != "tileUpdate") console.log(msg);
		// console.log(msg);
		this.emit("message", msg);
		if(msg.kind == "chat") {

		} else if(msg.kind == "tileUpdate" || msg.kind == "fetch") {
			for(let chunk in msg.tiles) {
				this.chunks.set(chunk as ChunkLocationKey, msg.tiles[chunk as ChunkLocationKey] ?? null);
				let resolve = this.pending_chunks.get(chunk as ChunkLocationKey);
				if(resolve) {
					resolve(msg.tiles[chunk as ChunkLocationKey] ?? null);
					this.pending_chunks.delete(chunk as ChunkLocationKey);
				}
			}
			// console.log(this.pending_chunks.size);
			if(msg.kind == "tileUpdate") this.emit("tile_update");
		} else if(msg.kind == "write") {
			for(let index of msg.accepted) {
				let edit: Char;
				if(edit = this.pending_edits.get(index)) {
					this.pending_edits.delete(index);
					if(this.pending_edits.size == 0) this.next_edit_id = 0;
					if(edit.link) {
						let [cx, cy, sx, sy] = coordsToChunkCoords(edit.x, edit.y);
						let link: SentMessage;
						if(edit.link.type == "url") link = <URLLinkRequest>{
							kind: "link",
							data: {
								tileY: cy,
								tileX: cx,
								charY: sy,
								charX: sx,
								url: edit.link.url,
							},
							type: "url",
						}; else link = <CoordLinkRequest>{
							kind: "link",
							data: {
								tileY: cy,
								tileX: cx,
								charY: sy,
								charX: sx,
								link_tileX: edit.link.link_tileX,
								link_tileY: edit.link.link_tileY,
							},
							type: "coord",
						};
						this.send(link);
					}
				}
			}
			for(let index in msg.rejected) {
				let number = Number(index);
				let reason = msg.rejected[index];
				if(reason != 2) console.log(`${number} rejected: ${reason}`);
			}
			if(this.pending_edits.size > 0) {
				Bun.sleep(this.rate_limit).then(()=>this.sync_edits());
			} else {
				for(let resolve of this.awaiting_sync_finish) {
					resolve();
				}
				this.emit("sync_finish");
				this.awaiting_sync_finish.length = 0;
			}
		} else if(msg.kind == "error") {
			console.error(`${msg.code}: ${msg.message}`);
		} else if(msg.kind == "cmd") {
			this.emit("command", msg);
			this.commands.emit(msg.data, msg);
		}
	}

	get ready() {
		return new Promise<void>(resolve => this.ws.addEventListener("open", _ => {
			resolve();
		}));
	}

	get is_ready() {
		return this.ws.readyState == WebSocket.OPEN;
	}

	private send(message: SentMessage) {
		this.emit("outgoing_message", message);
		this.ws.send(JSON.stringify(message));
	}

	public subscribe_cmd() {
		this.send({
			kind: "cmd_opt"
		});
	}

	public chat(message:string, location:"page"|"global"="page", nickname:string="", color:`#${string}`="#3a3a3a") {
		this.send({
			kind: "chat",
			message,
			location,
			nickname,
			color,
		})
	}

	public async set_update_region(min_x: ChunkCoord, min_y: ChunkCoord, max_x: ChunkCoord, max_y: ChunkCoord) {
		this.send({
			kind: "boundary",
			minX: min_x,
			maxX: max_x,
			minY: min_y,
			maxY: max_y,
			centerX: Math.floor((max_x - min_x) / 2),
			centerY: Math.floor((max_y - min_y) / 2)
		});
		if(process.env.DEBUG_UPDATE_REGION) console.log(`set_update_region: now ${Math.abs(max_x - min_x)}x${Math.abs(max_y - min_y)} at ${min_x},${min_y}`);
	}

	public async get_chunk(x: ChunkCoord, y: ChunkCoord): Promise<ChunkInfo | null> {
		let cached = this.chunks.get(`${y},${x}`);
		if(cached !== undefined) { //This strict equality got me. null == undefined. null !== undefined.
			return cached;
		}

		let response: any = new Promise(resolve => {
			this.pending_chunks.set(`${y},${x}`, resolve);
		});

		this.send({
			kind: "fetch",
			fetchRectangles: [{
				minX: x,
				minY: y,
				maxX: x,
				maxY: y,
			}]
		});

		return await response;
	}

	public try_get_chunk(x: ChunkCoord, y: ChunkCoord): ChunkInfo | null | undefined {
		return this.chunks.get(`${y},${x}`);
	}

	private get_cell_props(chunk: ChunkInfo, x: number, y: number): ChunkInfo["properties"]["cell_props"][number][number] | undefined {
		if(chunk.properties !== undefined) {
			if(chunk.properties.cell_props !== undefined) {
				if(chunk.properties.cell_props[y] !== undefined) {
					if(chunk.properties.cell_props[y][x] !== undefined) {
						return chunk.properties.cell_props[y][x];
					}
				}
			}
		}
		return undefined;
	}

	public async get_char(x: TileCoord, y: TileCoord): Promise<Char | null> {
		let [chunk_x, chunk_y, sub_x, sub_y] = coordsToChunkCoords(x, y);
		let chunk = await this.get_chunk(chunk_x, chunk_y);
		if(chunk == null || chunk.content == null) return null;
		let cell_props = this.get_cell_props(chunk, sub_x, sub_y);
		let char_list = [...chunk.content];
		let char_index = sub_y * 16 + sub_x;
		let real_chars_encountered = 0;
		let real_char_index: number;
		for(let i = 0; i < char_list.length; i++) {
			if((char_list[i].codePointAt(0) & 0xFFF0) != 0x20F0) real_chars_encountered += 1;
			if(real_chars_encountered == char_index+1) {
				real_char_index = i;
				break;
			}
		}

		let char_text = char_list[real_char_index];
		if(char_text == null) return null;
		let visible_char = char_text;
		let format_char = "\u20F0";
		if(real_char_index+1 < char_list.length && (char_list[real_char_index+1].codePointAt(0) & 0xFFF0) == 0x20F0) format_char = char_list[real_char_index+1];

		let output: Char = {
			x: x,
			y: y,
			char: visible_char ?? "",
			fg: chunk.properties.color ? chunk.properties.color[sub_y * 16 + sub_x] : undefined,
			bg: chunk.properties.bgcolor ? chunk.properties.bgcolor[sub_y * 16 + sub_x] : undefined,
			link: cell_props?.link,
			bold:          format_char ? (format_char.codePointAt(0) >> 3 & 1) > 0 : false,
			italic:        format_char ? (format_char.codePointAt(0) >> 2 & 1) > 0 : false,
			underline:     format_char ? (format_char.codePointAt(0) >> 1 & 1) > 0 : false,
			strikethrough: format_char ? (format_char.codePointAt(0) >> 0 & 1) > 0 : false,
		};

		this.normalize(output);
		return output;
	}

	private readonly MAX_REGION_SIZE = 2048;

	public async load_region(min_x: ChunkCoord, min_y: ChunkCoord, max_x: ChunkCoord, max_y: ChunkCoord): Promise<void> {
		if(Math.abs(max_x - min_x) * Math.abs(max_y - min_y) > this.MAX_REGION_SIZE) {
			let width = Math.abs(max_x - min_x);
			let height = Math.abs(max_y - min_y);

			let rows = Math.ceil(height / Math.sqrt(this.MAX_REGION_SIZE));
			let cols = Math.ceil(width / Math.sqrt(this.MAX_REGION_SIZE));
			if(process.env.DEBUG_LOAD_REGION) console.log(`load_region: Area too large; splitting into ${cols}x${rows} grid`);

			let subarea_width = Math.floor(width / cols);
			let subarea_height = Math.floor(height / rows);

			for(let row = 0; row < rows; row++) {
				for(let col = 0; col < cols; col++) {
					let subarea_min_x = min_x + col * subarea_width;
					let subarea_min_y = min_y + row * subarea_height;
					let subarea_max_x = Math.min(subarea_min_x + subarea_width, max_x);
					let subarea_max_y = Math.min(subarea_min_y + subarea_height, max_y);

					if(process.env.DEBUG_LOAD_REGION) console.log(`load_region: loading ${Math.abs(subarea_max_x - subarea_min_x)}x${Math.abs(subarea_max_y - subarea_min_y)} at ${subarea_min_x},${subarea_min_y}`);
					await this.load_region(subarea_min_x, subarea_min_y, subarea_max_x, subarea_max_y);
					await Bun.sleep(250);
				}
			}
			return;
		}
		let promises: Promise<ChunkInfo | null>[] = [];
		for(let x = min_x; x < max_x; x++) {
			for(let y = min_y; y < max_y; y++) {
				promises.push(new Promise(resolve => this.pending_chunks.set(`${y},${x}`, resolve)));
			}
		}

		this.send({
			kind: "fetch",
			fetchRectangles: [{
				minX: min_x,
				minY: min_y,
				maxX: max_x,
				maxY: max_y,
			}]
		});
		
		await Promise.all(promises);
	}

	private normalize(char: Char) {
		char.char = char.char.normalize();
		if(char.char == String.fromCodePoint(0x2588)) { // Full block
			char.bg = char.fg;
			char.fg = 0x000000;
			char.char = " ";
		} else if(char.bg !== undefined && char.fg !== undefined && (char.fg == char.bg || color_diff(hex2rgb(char.fg), hex2rgb(char.bg)) == 0)) { //FG and BG are equal
			char.bg = char.fg;
			char.fg = 0x000000;
			char.char = " ";
		} else if(char.char == String.fromCodePoint(0x2584)) { //Lower Half Block to Upper Half Block
			let bg = char.fg;
			let fg = char.bg;
			char.fg = fg;
			char.bg = bg;
			char.char = String.fromCodePoint(0x2580);
		}
		if(char.char == " ") {
			char.bold = false;
			char.italic = false;
			if(!char.underline && !char.strikethrough && !char.link) {
				delete char.fg;
			}
		}
		for(let [key, value] of Object.entries(char)) {
			if(value === undefined) delete char[key];
		}
		if(char.bold == false) delete char.bold;
		if(char.italic == false) delete char.italic;
		if(char.underline == false) delete char.underline;
		if(char.strikethrough == false) delete char.strikethrough;
	}

	public clear_edit_queue() {
		this.pending_edits.clear();
		this.next_edit_id = 0;
	}

	public queue_edits(edits: (Edit | Char)[]) {
		for(let edit of edits.flatMap(edit => {
			if(typeof (edit as Edit)["into_chars"] === "function") return (edit as Edit).into_chars();
			return edit as Char;
		})) {
			this.normalize(edit);
			
			this.pending_edits.set(this.next_edit_id++, edit);
		}
	}

	public sync_edits(): boolean {
		if(process.env.DEBUG_SYNC) console.log(`Syncing ${this.pending_edits.size} edits (#${this.next_edit_id})`);
		if(this.pending_edits.size == 0) {
			this.next_edit_id = 0;
			return false;
		}
		this.send({
			kind: "write",
			edits: [...this.pending_edits].slice(0, 512).map(([index, edit]) => {
				let [cx, cy, sx, sy] = coordsToChunkCoords(edit.x, edit.y);
				let char = edit.char;
				if(edit.bold || edit.italic || edit.underline || edit.strikethrough) {
					char += String.fromCodePoint(0x20F0 |
						Number(edit.bold) << 3 |
						Number(edit.italic) << 2 |
						Number(edit.underline) << 1 |
						Number(edit.strikethrough)
					);
				}
				let raw: RawEdit = [cy, cx, sy, sx, Date.now(), char, index];
				if(edit.fg !== undefined || edit.bg !== undefined) raw.push(edit.fg ?? 0x000000)
				if(edit.bg !== undefined) raw.push(edit.bg);
				return raw;
			}),
		});
		return true;
	}

	/** Returns Infinity..-Infinity (an empty region) if no edits are made. */
	public get_edit_region(): [number, number, number, number] {
		let min_x = Infinity;
		let max_x = -Infinity;
		let min_y = Infinity;
		let max_y = -Infinity;
		for(let [_index, edit] of this.pending_edits) {
			let { x, y } = edit;
			let [cx, cy] = coordsToChunkCoords(x, y);
			min_x = Math.min(min_x, cx);
			max_x = Math.max(max_x, cx);
			min_y = Math.min(min_y, cy);
			max_y = Math.max(max_y, cy);
		}
		return [min_x, min_y, max_x, max_y];
	}

	public remove_overlapping_edits() {
		let occupied_coords = new Map<`${number},${number}`, number>();
		let removed = 0;
		for(let [index, edit] of this.pending_edits) {
			if(occupied_coords.has(`${edit.x},${edit.y}`)) {
				let old_index = occupied_coords.get(`${edit.x},${edit.y}`);
				occupied_coords.set(`${edit.x},${edit.y}`, index);
				this.pending_edits.delete(old_index);
				removed += 1;
			} else {
				occupied_coords.set(`${edit.x},${edit.y}`, index);
			}
		}
		if(process.env.DEBUG_DEOVERLAP) console.log(`Deleted ${removed} overlapping edits`);
	}

	public async remove_duplicate_edits(load_region: boolean = true) {
		if(this.pending_edits.size == 0) return;
		let [min_x, min_y, max_x, max_y] = this.get_edit_region();
		if(load_region) {
			await this.load_region(min_x, min_y, max_x, max_y);
		}

		let removed = 0;

		for(let [index, edit] of this.pending_edits) {
			let current_char = await this.get_char(edit.x, edit.y);
			if(current_char == null) continue;
			if(Bun.deepMatch(edit, current_char)) {
				this.pending_edits.delete(index);
				removed += 1;
			} else {
				if(process.env.DEBUG_DEDUPLICATION) console.log(current_char, edit, index);
			}
		}
		if(process.env.DEBUG_DEDUPLICATION) console.log(`Deleted ${removed} duplicate edits`);
	}

	public send_edits(edits: (Edit | Char)[]) {
		this.queue_edits(edits);
		this.sync_edits();
	}

	public done_syncing(): Promise<void> {
		return new Promise(resolve => this.awaiting_sync_finish.push(resolve));
	}
}
