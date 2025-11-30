//Types describing things sent / received from the OWOT server

export type ChunkCoord = number;
export type TileCoord = number;

/** y,x */
export type ChunkLocationKey = `${number},${number}`;

export interface ChunkInfo {
	content: string;
	properties: {
		writability: null | 0 | 1 | 2;
		color?: Array<number>;
		bgcolor?: Array<number>;
		/** [y][x] */
		cell_props?: Record<TileCoord, Record<TileCoord, {
			link?: { type: "url", url: string } | { type: "coord", link_tileX: number, link_tileY: number };
		}>>;
	}
}

export interface ChatHistoryMessage {
	kind: "chathistory";
	page_chat_prev: Omit<ChatMessage, "kind">[];
	global_chat_prev: Omit<ChatMessage, "kind">[];
}

export interface UserCountMessage {
	kind: "user_count";
	count: number;
}

export interface ChannelMessage {
	kind: "channel";
}

export interface TileUpdateMessage {
	kind: "tileUpdate";
	channel: string;
	source: "write" | string;
	tiles: Record<ChunkLocationKey, ChunkInfo | null>
}

export interface ChatMessage {
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

export interface FetchRectanglesResponseMessage {
	kind: "fetch";
	tiles: Record<ChunkLocationKey, ChunkInfo | null>
}

export interface WriteResponseMessage {
	kind: "write";
	accepted: number[];
	rejected: Record<string, 0 | 1 | 2>;
}

export interface ErrorMessage {
	kind: "error";
	code: "PARAM" | string;
	message: string;
}

export interface CmdOptMessage {
	kind: "cmd_opt";
	enabled: boolean;
}

export interface CmdMessage {
	kind: "cmd";
	data: string;
	source: "cmd";
	sender: string;
	coords: [ChunkCoord, ChunkCoord, TileCoord, TileCoord];
}

export interface CmdUMessage extends CmdMessage {
	username: string;
	id: string;
}

export interface CursorMessage {
	kind: "cursor";
	position: {
		tileX: number;
		tileY: number;
		charX: number;
		charY: number;
	};
	channel: string;
}

export type ReceivedMessage = UserCountMessage | ChannelMessage | TileUpdateMessage | ChatMessage | FetchRectanglesResponseMessage | WriteResponseMessage | ErrorMessage | CmdMessage | CmdUMessage | CursorMessage;

export interface ChatRequest {
	kind: "chat";
	nickname: string;
	location: "page" | "global";
	color: `#${string}`;
	message: string;
}

export interface ChatHistoryRequest {
	kind: "chathistory";
}

export interface SetBoundaryRequest { // Presumably used to set areas in which tileUpdate events should be received.
	kind: "boundary";
	centerX: number;
	centerY: number;
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface FetchRectanglesRequest {
	kind: "fetch";
	fetchRectangles: {
		minX: ChunkCoord,
		minY: ChunkCoord,
		maxX: ChunkCoord,
		maxY: ChunkCoord,
	}[];
}

export interface WriteRequest {
	kind: "write";
	edits: RawEdit[];
}

export interface CmdOptRequest {
	kind: "cmd_opt";
}

export interface CmdRequest {
	kind: "cmd";
	data: string;
	include_username: boolean;
	coords: [ChunkCoord, ChunkCoord, TileCoord, TileCoord];
}

export interface CursorRequest {
	kind: "cursor";
	position: {
		tileX: number;
		tileY: number;
		charX: number;
		charY: number;
	};
}

export interface LinkRequest {
	kind: "link";
	data: {
		tileY: ChunkCoord;
		tileX: ChunkCoord;
		charY: TileCoord;
		charX: TileCoord;
	}
}

export interface CoordLinkRequest extends LinkRequest {
	type: "coord";
	data: LinkRequest["data"] & {
		link_tileX: number;
		link_tileY: number;
	}
}

export interface URLLinkRequest extends LinkRequest {
	type: "url";
	data: LinkRequest["data"] & {
		url: string;
	}
}

export type SentMessage = ChatRequest | ChatHistoryRequest | SetBoundaryRequest | FetchRectanglesRequest | WriteRequest | CmdOptRequest | CmdRequest | CursorRequest | CoordLinkRequest | URLLinkRequest;

/** [ChunkY, ChunkX, CharY, CharX, Timestamp, Char, ID, FG, BG] */
export type RawEdit = [number, number, number, number, number, string, number, number?, number?];
