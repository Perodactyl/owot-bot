import { EventEmitter } from "node:events";
import { char2ansi, coordsToChunkCoords, hex2rgb, raw2char } from "./util";
import { color_diff } from "./image";

type ChunkLocationKey = `${number},${number}`;

interface ChunkInfo {
	content: string;
	properties: {
		writability: null | 0 | 1 | 2;
		color?: Array<number>;
		bgcolor?: Array<number>;
	}
}

interface UserCountMessage {
	kind: "user_count";
	count: number;
}

interface ChannelMessage {
	kind: "channel";
}

interface TileUpdateMessage {
	kind: "tileUpdate";
	channel: string;
	source: "write" | string;
	tiles: Record<ChunkLocationKey, ChunkInfo | null>
}

interface ChatMessage {
	kind: "chat";

	nickname: string;
	realUsername: string;
	id: number;
	registered: boolean;
	op: boolean;
	admin: boolean;
	staff: boolean;
	color: string;

	date: number;
	message: string;
	location: "page" | "global";
}

interface FetchRectanglesResponseMessage {
	kind: "fetch";
	tiles: Record<ChunkLocationKey, ChunkInfo | null>
}

interface WriteResponseMessage {
	kind: "write";
	accepted: number[];
	rejected: Record<string, 0 | 1 | 2>;
}

interface ErrorMessage {
	kind: "error";
	code: "PARAM" | string;
	message: string;
}

type ReceivedMessage = UserCountMessage | ChannelMessage | TileUpdateMessage | ChatMessage | FetchRectanglesResponseMessage | WriteResponseMessage | ErrorMessage;

interface ChatHistoryRequest {
	kind: "chathistory";
}

interface SetBoundaryRequest { // Presumably used to set areas in which tileUpdate events should be received.
	kind: "boundary";
	centerX: number;
	centerY: number;
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

interface FetchRectanglesRequest {
	kind: "fetch";
	fetchRectangles: {
		minX: ChunkCoord,
		minY: ChunkCoord,
		maxX: ChunkCoord,
		maxY: ChunkCoord,
	}[];
}

interface WriteRequest {
	kind: "write";
	edits: RawEdit[];
}

type SentMessage = ChatHistoryRequest | SetBoundaryRequest | FetchRectanglesRequest | WriteRequest;

/** [ChunkY, ChunkX, CharY, CharX, Timestamp, Char, ID, FG, BG] */
export type RawEdit = [number, number, number, number, number, string, number, number, number];

export interface Char {
	x: number,
	y: number,
	char: string,
	fg: number,
	bg: number,
}

export interface Edit {
	into_chars(): Char[];
}

export type ChunkCoord = number;
export type TileCoord = number;

export class ServerConnection extends EventEmitter {
	public readonly url;
	private ws: WebSocket;
	private chunks = new Map<ChunkLocationKey, ChunkInfo | null>();
	private next_edit_id = 0;
	private pending_edits = new Map<number, RawEdit>();
	private pending_chunks = new Map<ChunkLocationKey, (chunk: ChunkInfo | null)=>void>;
	private awaiting_sync_finish: Array<()=>void> = [];

	constructor(public world: string = "", private token?: string, public rate_limit: number = 1000) {
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
	}

	private on_message(msg: ReceivedMessage) {
		// if(msg.kind != "tileUpdate") console.log(msg);
		// console.log(msg);
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
		} else if(msg.kind == "write") {
			for(let index of msg.accepted) {
				this.pending_edits.delete(index);
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
				this.awaiting_sync_finish.length = 0;
			}
		} else if(msg.kind == "error") {
			console.error(`${msg.code}: ${msg.message}`);
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
		this.ws.send(JSON.stringify(message));
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

	public async get_char(x: TileCoord, y: TileCoord): Promise<Char | null> {
		let [cx, cy, tx, ty] = coordsToChunkCoords(x, y);
		let chunk = await this.get_chunk(cx, cy);
		if(chunk == null) return null;

		return {
			x: x,
			y: y,
			char: [...chunk.content][ty * 16 + tx] ?? "",
			fg: chunk.properties.color ? chunk.properties.color[ty * 16 + tx] ?? 0x000000 : 0x000000,
			bg: chunk.properties.bgcolor ? chunk.properties.bgcolor[ty * 16 + tx] ?? 0xFFFFFF : 0xFFFFFF,
		};
	}

	private readonly MAX_REGION_SIZE = 2048;

	public async load_region(min_x: ChunkCoord, min_y: ChunkCoord, max_x: ChunkCoord, max_y: ChunkCoord): Promise<void> {
		if(Math.abs(max_x - min_x) * Math.abs(max_y - min_y) > this.MAX_REGION_SIZE) {
			let width = Math.abs(max_x - min_x);
			let height = Math.abs(max_y - min_y);

			let rows = Math.ceil(height / Math.sqrt(this.MAX_REGION_SIZE));
			let cols = Math.ceil(width / Math.sqrt(this.MAX_REGION_SIZE));
			console.log(`load_region: Area too large; splitting into ${cols}x${rows} grid`);

			let subarea_width = width / cols;
			let subarea_height = height / rows;

			for(let row = 0; row < rows; row++) {
				for(let col = 0; col < cols; col++) {
					let subarea_min_x = min_x + col * subarea_width;
					let subarea_min_y = min_y + row * subarea_height;
					let subarea_max_x = Math.min(subarea_min_x + subarea_width, max_x);
					let subarea_max_y = Math.min(subarea_min_y + subarea_height, max_y);

					await this.load_region(subarea_min_x, subarea_min_y, subarea_max_x, subarea_max_y);
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
		} else if(char.fg == char.bg || color_diff(hex2rgb(char.fg), hex2rgb(char.bg)) == 0) { //FG and BG are equal
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
	}

	public queue_edits(edits: (Edit | Char)[]) {
		for(let edit of edits.flatMap(edit => {
			if(typeof (edit as Edit)["into_chars"] === "function") return (edit as Edit).into_chars();
			return edit as Char;
		})) {
			this.normalize(edit);
			let [cx, cy, sx, sy] = coordsToChunkCoords(edit.x, edit.y);
			let index = ++this.next_edit_id;
			let raw: RawEdit = [cy, cx, sy, sx, Date.now(), edit.char.normalize(), index, edit.fg ?? 0x000000, edit.bg ?? 0xFFFFFF];
			this.pending_edits.set(index, raw);
		}
	}

	public sync_edits() {
		console.log(`Syncing ${this.pending_edits.size} edits`);
		if(this.pending_edits.size == 0) return;
		this.send({
			kind: "write",
			edits: [...this.pending_edits.values()].slice(0, 512)
		});
	}

	public async remove_duplicate_edits() {
		let min_x = 0;
		let max_x = 0;
		let min_y = 0;
		let max_y = 0;
		for(let [_index, edit] of this.pending_edits) {
			let [cy, cx] = edit;
			min_x = Math.min(min_x, cx);
			max_x = Math.max(max_x, cx);
			min_y = Math.min(min_y, cy);
			max_y = Math.max(max_y, cy);
		}

		console.log(`Loading edited region (${max_x-min_x}x${max_y-min_y} chunks)`);
		await this.load_region(min_x, min_y, max_x, max_y);

		console.log("Deleting duplicate edits");
		let removed = 0;
		for(let [index, edit] of this.pending_edits) {
			let [cy, cx, sy, sx, _t, char, _i, fg, bg] = edit;
			let current_char = await this.get_char(cx * 16 + sx, cy * 8 + sy);
			if(current_char == null) continue;
			if(
				(current_char.fg == fg || color_diff(hex2rgb(current_char.fg), hex2rgb(fg)) == 0) &&
				(current_char.bg == bg || color_diff(hex2rgb(current_char.bg), hex2rgb(bg)) == 0) &&
				current_char.char.normalize() == char.normalize()
			) {
				this.pending_edits.delete(index);
				removed += 1;
			} else {
				// console.log(`${char2ansi(raw2char(edit))}${char2ansi(current_char)} (U+${char.codePointAt(0).toString(16).padStart(4, "0")} vs U+${current_char.char.codePointAt(0).toString(16).padStart(4, "0")}, FG ${current_char.fg.toString(16).padStart(6, "0")} vs ${fg.toString(16).padStart(6, "0")}, BG ${current_char.fg.toString(16).padStart(6, "0")} vs ${bg.toString(16).padStart(6, "0")}, FGdiff=${color_diff(hex2rgb(current_char.fg), hex2rgb(fg))}, BGdiff=${color_diff(hex2rgb(current_char.bg), hex2rgb(bg))})\n`);
			}
		}
		console.log(`Deleted ${removed} edits`);
	}

	public send_edits(edits: (Edit | Char)[]) {
		this.queue_edits(edits);
		this.sync_edits();
	}

	public done_syncing(): Promise<void> {
		return new Promise(resolve => this.awaiting_sync_finish.push(resolve));
	}
}
