import type { Edit, Char } from "./websocket";

export class EditString implements Edit {
	public max_width: number | null = null;
	public max_height: number | null = null;
	public fg_color: number = 0x000000;
	public bg_color: number = 0xFFFFFF;
	public vertical: boolean = false;
	constructor(public x: number, public y: number, public text: string) {}
	into_chars(): Char[] {
	    let output: Char[] = [];
		let current_x = this.x;
		let current_y = this.y;
		if(this.vertical) {
			for(let ch of this.text) {
				output.push({
					x: current_x,
					y: current_y,
					char: ch,
					bg: this.bg_color,
					fg: this.fg_color,
				});

				current_y += 1;
			}
		} else {
			for(let ch of this.text) {
				if(ch == "\n" || (this.max_width != null && current_x >= this.x + this.max_width)) {
					current_x = this.x;
					current_y += 1;
					if(this.max_height != null && current_y >= this.y + this.max_height) break;
				}
				if(ch != "\n") {
					output.push({
						x: current_x,
						y: current_y,
						char: ch,
						bg: this.bg_color,
						fg: this.fg_color,
					});
					current_x += 1;
				}
			}
		}

		return output;
	}
	with_fg(fg: number): this {
		this.fg_color = fg;
		return this;
	}
	with_bg(bg: number): this {
		this.bg_color = bg;
		return this;
	}
	vertically(): this {
		this.vertical = true;
		return this;
	}
}

export class EditRegion implements Edit {
	public fg_color: number = 0x000000;
	public bg_color: number = 0xFFFFFF;
	constructor(public x: number, public y: number, public width: number, public height: number, public char: string) {}
	into_chars(): Char[] {
		let output: Char[] = [];
	    for(let x = this.x; x < this.x+this.width; x++) {
			for(let y = this.y; y < this.y+this.height; y++) {
				output.push({
					x,
					y,
					char: this.char,
					fg: this.fg_color,
					bg: this.bg_color,
				})
			}
		}
		return output;
	}
	with_fg(fg: number): this {
		this.fg_color = fg;
		return this;
	}
	with_bg(bg: number): this {
		this.bg_color = bg;
		return this;
	}
}
