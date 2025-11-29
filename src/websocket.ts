import { EventEmitter } from "node:events";
import { coordsToChunkCoords } from "./util";

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

type ReceivedMessage = UserCountMessage | ChannelMessage | TileUpdateMessage | ChatMessage | FetchRectanglesResponseMessage | WriteResponseMessage;

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
type RawEdit = [number, number, number, number, number, string, number, number, number];

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

	constructor(public world: string = "") {
		super();
		if(world != "") this.url = `wss://ourworldoftext.com/${world}/ws/`;
		else this.url = "wss://ourworldoftext.com/ws/";
		this.ws = new WebSocket(this.url);
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
				if(resolve) resolve(msg.tiles[chunk as ChunkLocationKey] ?? null);
			}
		} else if(msg.kind == "write") {
			for(let index of msg.accepted) {
				this.pending_edits.delete(index);
			}
			for(let index in msg.rejected) {
				let number = Number(index);
				let reason = msg.rejected[index];
				console.log(`${number} rejected: ${reason}`);
			}
			if(this.pending_edits.size > 0) {
				Bun.sleep(300).then(()=>this.sync_edits());
			} else {
				for(let resolve of this.awaiting_sync_finish) {
					resolve();
				}
				this.awaiting_sync_finish.length = 0;
			}
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

	public async get_chunk(x: ChunkCoord, y: ChunkCoord): Promise<ChunkInfo | null> {
		let cached = this.chunks.get(`${x},${y}`);
		if(cached != undefined) {
			return cached;
		}

		let response: any = new Promise(resolve => {
			this.pending_chunks.set(`${x},${y}`, resolve);
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
		return this.chunks.get(`${x},${y}`);
	}

	public async get_char(x: TileCoord, y: TileCoord): Promise<Char | null> {
		let [cx, cy, tx, ty] = coordsToChunkCoords(x, y);
		let chunk = await this.get_chunk(cx, cy);
		if(chunk == null) return null;

		return {
			x: x,
			y: y,
			char: chunk.content[ty * 16 + tx] ?? "",
			fg: chunk.properties.color ? chunk.properties.color[ty * 16 + tx] ?? 0x000000 : 0x000000,
			bg: chunk.properties.bgcolor ? chunk.properties.bgcolor[ty * 16 + tx] ?? 0xFFFFFF : 0xFFFFFF,
		};
	}

	public load_region(min_x: ChunkCoord, min_y: ChunkCoord, max_x: ChunkCoord, max_y: ChunkCoord) {
		this.send({
			kind: "fetch",
			fetchRectangles: [{
				minX: min_x,
				minY: min_y,
				maxX: max_x,
				maxY: max_y,
			}]
		});
	}

	private queue_edits(edits: (Edit | Char)[]) {
		for(let edit of edits.flatMap(edit => {
			if(typeof (edit as Edit)["into_chars"] === "function") return (edit as Edit).into_chars();
			return edit as Char;
		})) {
			let [cx, cy, sx, sy] = coordsToChunkCoords(edit.x, edit.y);
			let index = ++this.next_edit_id;
			let raw: RawEdit = [cy, cx, sy, sx, Date.now(), edit.char, index, edit.fg ?? 0x000000, edit.bg ?? 0xFFFFFF];
			this.pending_edits.set(index, raw);
		}
	}

	private sync_edits() {
		console.log(`Syncing ${this.pending_edits.size} edits`);
		this.send({
			kind: "write",
			edits: [...this.pending_edits.values()]
		});
	}

	public send_edits(edits: (Edit | Char)[]) {
		this.queue_edits(edits);
		this.sync_edits();
	}

	public done_syncing(): Promise<void> {
		return new Promise(resolve => this.awaiting_sync_finish.push(resolve));
	}
}
