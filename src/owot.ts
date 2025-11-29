import { EditRegion, EditString } from "./edit";
import { ServerConnection } from "./websocket";

const WORLD = "world12314124213512345314523452345";
// const WORLD = "";

let con = new ServerConnection(WORLD);

await con.ready;
console.log("Connected");

// console.log("origin", await con.get_chunk(0, 0));

con.send_edits([
	new EditString(0, -1, "━".repeat(80)),
	new EditString(0, 25, "━".repeat(80)),
	new EditString(-1, 0, "┃".repeat(25)).vertically(),
	new EditString(80, 0, "┃".repeat(25)).vertically(),
	{ x: -1, y: -1, char: "┏", fg: 0x000000, bg: 0xFFFFFF },
	{ x: 80, y: -1, char: "┓", fg: 0x000000, bg: 0xFFFFFF },
	{ x: 80, y: 25, char: "┛", fg: 0x000000, bg: 0xFFFFFF },
	{ x: -1, y: 25, char: "┗", fg: 0x000000, bg: 0xFFFFFF },
	new EditRegion(0, 0, 80, 25, " "),
	new EditString(0, -2, "Type a command, then replace the prompt with a colon."),
]);

const PROMPT = "> ";

let cursor_x = 0;
let cursor_y = 0;

while(true) {
	con.send_edits([
		new EditString(cursor_x, cursor_y, PROMPT),
	]);

	await con.done_syncing();
	while(true) {
		let prompt_char = await con.get_char(cursor_x, cursor_y);
		if(prompt_char?.char == ":") {
			break;
		}
	}

	break;
}

console.log("Routine finished.");
