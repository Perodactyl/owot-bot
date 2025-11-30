import { exists, readFile, writeFile } from "node:fs/promises";
import { ServerConnection } from "./websocket";
import { BorderEdit, RegionEdit, StringEdit, TranslateEdit } from "./edit";
import { rgb2hex } from "./util";
import type { CmdUMessage } from "./owot";
import { flavors } from "@catppuccin/palette";

const FLAVOR = flavors[process.env.FLAVOR || "mocha"] as typeof flavors["mocha"];
const COLORS = <Record<keyof typeof FLAVOR["colors"], number>>Object.fromEntries(Object.entries(FLAVOR.colors).map(([k,v])=>[k,rgb2hex([v.rgb.r, v.rgb.g, v.rgb.b])]));

let con: ServerConnection;

if(process.argv.length >= 5) {
	con = new ServerConnection(process.argv[2], process.argv[3], Number(process.argv[4]));
} else {
	con = new ServerConnection();
}

if(process.env.DEBUG_MESSAGES) {
	if(con.world != "") con.on("message", ev => console.log("rx", Bun.inspect(ev, {depth: Infinity, colors: true})));
	con.on("outgoing_message", ev => console.log("tx", ev));
}

await con.ready;
console.log("Connected");
con.set_update_region(0, 0, 0, 0);
con.subscribe_cmd();

let counter = 0;
let leaderboard: {id?: string, sender: string, nickname?: string, clicks: number, last_clicked?: number, timeout?: number}[] = [];

if(await exists("leaderboard.json")) {
	let { counter: saved_counter, leaderboard: saved_leaderboard } = JSON.parse(await readFile("leaderboard.json", "utf8"));
	counter = saved_counter as any;
	leaderboard = saved_leaderboard as any;
}

let last_update = Date.now();
let updating = false;
let has_updates_pending = false;

async function put_counter_link(allow_reload_region: boolean = false, force: boolean = false) {
	if(updating && !force) {
		has_updates_pending = true;
		return;
	}
	updating = true;
	con.clear_edit_queue();
	let leaderboard_lines = [];
	leaderboard.sort((a,b)=>b.clicks - a.clicks);
	let y = 2;
	for(let row of leaderboard) {
		let id = row.id;
		if(!id) id = "-".repeat(16);
		let nick: string;
		if(row.nickname) nick = row.nickname;
		else nick = "-".repeat(32);
		let sender = row.sender;
		if(sender == "ea7eab88589922") nick = "[anonymous]";
		nick = nick.slice(0, 23);
		let clicks = row.clicks.toString().padStart(8);

		let id_edit = new StringEdit(0, 0, id).with_fg(COLORS.mauve).with_bg(COLORS.crust).italicized();
		let sender_edit = new StringEdit(17, 0, sender).with_fg(COLORS.lavender).with_bg(COLORS.crust).italicized();
		let name_edit = new StringEdit(32, 0, nick).with_fg(COLORS.blue).with_bg(COLORS.crust).bolded();
		let clicks_edit = new StringEdit(56, 0, clicks).with_fg(COLORS.green).with_bg(COLORS.crust).bolded();
		if(sender == "ea7eab88589922") name_edit.link = { type: "url", url: "note:Sum of all clicks from users who pressed the anonymous button or pressed either button while not signed in" };
		if(sender == "3336f9ca023d78") name_edit.underline = true;

		if(row.timeout) {
			clicks_edit.link = { type: "url", url: `note:Timed out for ${row.timeout / 1000} seconds` };
			clicks_edit.fg_color = COLORS.red;
		}

		leaderboard_lines.push(new TranslateEdit(0, y, [
			id_edit, sender_edit, name_edit, clicks_edit,
		]));
		y++;
		if(leaderboard_lines.length > 29) break;
	}

	con.queue_edits([new TranslateEdit(0, 100, [
		// Container
		new RegionEdit(-2, -2, 100, 36, " "),
		new BorderEdit(-1, -1, 97, 33, "▟", "█", "▙", "█", "█", "▜", "█", "▛").with_fg(COLORS.base),
		new RegionEdit(0, 0, 96, 32, " ").with_bg(COLORS.base),

		// Counter UI
		new StringEdit(72, 0, `Counter:${counter.toString().padStart(16)}`).with_bg(COLORS.base).with_fg(COLORS.green).bolded(),
		new StringEdit(72, 1, `[+]`).with_link({ type: "url", url: "comu:count_up" }).bolded().with_bg(COLORS.base).with_fg(COLORS.yellow),
		new StringEdit(76, 1, `[A]`).with_link({ type: "url", url: "com:count_up" }).bolded().with_bg(COLORS.base).with_fg(COLORS.peach),
		new StringEdit(80, 1, `Info`).with_link({ type: "url", url: "note:[+] counts up and sends your username (for leaderboard purposes), but [A] does not send your username." }).with_bg(COLORS.base).with_fg(COLORS.text),

		// Notice to users
		new StringEdit(72, 3, "Notice to Users").with_bg(COLORS.base).with_fg(COLORS.text).bolded().underlined(),
		new RegionEdit(66, 4, 30, 17, " ").with_bg(COLORS.mantle),
		new StringEdit(66, 4, "Created by Perodactyl.\nI wrote a custom OWOT client,\nso it might be buggy.\nThis system is subject to change.").with_max_width(30).with_bg(COLORS.mantle).with_fg(COLORS.text).break_no_words(),
		new StringEdit(69, 19, "[My text looks like this]").with_max_width(30).with_bg(0x000000).with_fg(0x00AA00).break_no_words(),

		// Leaderboard container
		new RegionEdit(0, 0, 64, 32, " ").with_bg(COLORS.crust),
		new RegionEdit(0, -1, 64, 1, "▀").with_bg(COLORS.crust).with_fg(COLORS.base),
		new RegionEdit(0, 32, 64, 1, "▄").with_bg(COLORS.crust).with_fg(COLORS.base),
		new RegionEdit(-1, 0, 1, 32, "▌").with_bg(COLORS.crust).with_fg(COLORS.base),
		new RegionEdit(64, 0, 1, 32, "▐").with_bg(COLORS.crust).with_fg(COLORS.base),

		// Leaderboard UI
		new StringEdit(26,0, "LEADER BOARD").with_bg(COLORS.crust).with_fg(COLORS.yellow).underlined(),
		new StringEdit(0, 1, "User ID         ").with_bg(COLORS.crust).with_fg(COLORS.mauve).bolded().underlined(),
		new StringEdit(17,1, "Sender ID     ").with_bg(COLORS.crust).with_fg(COLORS.lavender).bolded().underlined(),
		new StringEdit(32,1, "Name                   ").with_bg(COLORS.crust).with_fg(COLORS.blue).bolded().underlined(),
		new StringEdit(56,1, "  Clicks").with_bg(COLORS.crust).with_fg(COLORS.green).bolded().underlined(),
		...leaderboard_lines,
	])]);
	if(allow_reload_region) {
		let [min_x, min_y, max_x, max_y] = con.get_edit_region();
		await con.set_update_region(min_x, max_x, min_y, max_y);
	}
	con.remove_overlapping_edits();
	await con.remove_duplicate_edits(allow_reload_region);
	if(con.sync_edits()) await con.done_syncing();
	last_update = Date.now();
	updating = false;
	if(has_updates_pending) {
		has_updates_pending = false;
		setImmediate(()=>put_counter_link(false, true));
	}
}

put_counter_link(true);

let update_timer = null;

con.commands.on("count_up", async ev => {
	counter += 1;
	let ev2 = ev as CmdUMessage;
	let entry = leaderboard.find(l=>l.nickname == ev2.username || l.sender == ev2.sender);
	if(!entry) {
		entry = { id: ev2.id, sender: ev2.sender, nickname: ev2.username, clicks: 0 };
		leaderboard.push(entry);
	}
	if(entry.timeout == undefined || entry.timeout <= 0) entry.clicks += 1;
	if(entry.last_clicked != undefined) {
		if(Date.now() - entry.last_clicked < 25) {
			// if(!entry.timeout) entry.timeout = 1000;
			// else entry.timeout *= 2.0;
			// console.log(entry);
		}
	}
	entry.last_clicked = Date.now();
	if(Date.now() - last_update < 100) {
		if(update_timer !== null) clearTimeout(update_timer);
		update_timer = setTimeout(()=>put_counter_link(), 250);
	} else {
		if(update_timer !== null) clearTimeout(update_timer);
		update_timer = null;
		put_counter_link();
	}
	await writeFile("leaderboard.json", JSON.stringify({ counter, leaderboard }));
});

await Bun.sleep(10000);

setInterval(()=>{
	for(let entry of leaderboard) {
		if(entry.timeout && entry.timeout != 0) {
			entry.timeout = Math.max(entry.timeout - 1000, 0);
		}
	}
}, 1000);
