import { readFile } from "node:fs/promises";
import { EditRegion, EditString } from "./edit";
import { PPM, to_edits } from "./image";
import { ServerConnection } from "./websocket";

// const WORLD = "world12314124213512345314523452345";
const WORLD = "";

let con = new ServerConnection("", "366bfa3fc805dae9|ArqkXq3O7rpaInKfZx4cNw==", 1000);

await con.ready;
console.log("Connected");

con.set_update_region(0, 0, 0, 0);

let test = new PPM(await readFile("test.ppm"));
con.queue_edits(to_edits(test, 100, 100));
// await con.load_region(Math.floor(100 / 16), Math.floor(100 / 8), Math.ceil(256 / 16), Math.ceil(256 / 8));
await con.remove_duplicate_edits();
con.sync_edits();

await con.done_syncing();
console.log("Done");
