import type { Edit, Char, CharLink } from "./websocket";

class HasCharFormat {
	public fg_color?: number;
	public bg_color?: number;
	public link?: CharLink;
	public bold: boolean = false;
	public italic: boolean = false;
	public underline: boolean = false;
	public strikethrough: boolean = false;
	public include_spaces: boolean = true;

	public with_fg(fg: number): this {
		this.fg_color = fg;
		return this;
	}
	public with_bg(bg: number): this {
		this.bg_color = bg;
		return this;
	}

	public with_link(link: CharLink): this {
		this.link = link;
		return this;
	}

	public bolded(): this {
		this.bold = true;
		return this;
	}
	public italicized(): this {
		this.italic = true;
		return this;
	}
	public underlined(): this {
		this.underline = true;
		return this;
	}
	public struck_through(): this {
		this.strikethrough = true;
		return this;
	}

	public format_spaces(format: boolean = true): this {
		this.include_spaces = format;
		return this;
	}
}

export class StringEdit extends HasCharFormat implements Edit {
	public max_width: number | null = null;
	public max_height: number | null = null;
	public break_during_words: boolean = false; //TODO

	constructor(public x: number, public y: number, public text: string) { super(); }
	into_chars(): Char[] {
	    let output: Char[] = [];
		let current_x = this.x;
		let current_y = this.y;

		for(let ch of this.text) {
			if(ch == "\n" || (this.max_width != null && current_x >= this.x + this.max_width)) {
				current_x = this.x;
				current_y += 1;
				if(this.max_height != null && current_y >= this.y + this.max_height) break;
			}
			if(ch != "\n" && ch != " ") {
				output.push({
					x: current_x,
					y: current_y,
					char: ch,
					bg: this.bg_color,
					fg: this.fg_color,
					bold: this.bold,
					italic: this.italic,
					underline: this.underline,
					strikethrough: this.strikethrough,
					link: this.link,
				});
				current_x += 1;
			} else if(ch != "\n") {
				output.push({
					x: current_x,
					y: current_y,
					char: ch,
					bg: this.bg_color,
					fg: this.fg_color,
					bold: this.bold && this.include_spaces,
					italic: this.italic && this.include_spaces,
					underline: this.underline && this.include_spaces,
					strikethrough: this.strikethrough && this.include_spaces,
					link: this.include_spaces ? this.link : undefined,
				});
				current_x += 1;
			}
		}

		return output;
	}

	public with_max_width(width: number): this {
		this.max_width = width;
		return this;
	}

	public break_no_words(): this {
		this.break_during_words = false;
		return this;
	}
}

export class RegionEdit extends HasCharFormat implements Edit {
	constructor(public x: number, public y: number, public width: number, public height: number, public char: string) { super(); }
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
				});
			}
		}
		return output;
	}
}

export class BorderEdit extends HasCharFormat implements Edit {
	constructor(public x: number, public y: number, public width: number, public height: number, public top_left: string, public top: string, public top_right: string, public left: string, public right: string, public bottom_left: string, public bottom: string, public bottom_right: string) {
		super();

	}
	into_chars(): Char[] {
	    let output: Char[] = [];
		output.push({
			x: this.x, y: this.y,
			char: this.top_left,
			bg: this.bg_color,
			fg: this.fg_color,
			bold: this.bold,
			italic: this.italic,
			underline: this.underline,
			strikethrough: this.strikethrough,
		}, {
			x: this.x+this.width, y: this.y,
			char: this.top_right,
			bg: this.bg_color,
			fg: this.fg_color,
			bold: this.bold,
			italic: this.italic,
			underline: this.underline,
			strikethrough: this.strikethrough,
		}, {
			x: this.x+this.width, y: this.y+this.height,
			char: this.bottom_right,
			bg: this.bg_color,
			fg: this.fg_color,
			bold: this.bold,
			italic: this.italic,
			underline: this.underline,
			strikethrough: this.strikethrough,
		}, {
			x: this.x, y: this.y+this.height,
			char: this.bottom_left,
			bg: this.bg_color,
			fg: this.fg_color,
			bold: this.bold,
			italic: this.italic,
			underline: this.underline,
			strikethrough: this.strikethrough,
		});
		for(let x = this.x+1; x < this.x+this.width; x++) {
			output.push({
				x: x, y: this.y,
				char: this.top,
				bg: this.bg_color,
				fg: this.fg_color,
				bold: this.bold,
				italic: this.italic,
				underline: this.underline,
				strikethrough: this.strikethrough,
			}, {
				x: x, y: this.y+this.height,
				char: this.bottom,
				bg: this.bg_color,
				fg: this.fg_color,
				bold: this.bold,
				italic: this.italic,
				underline: this.underline,
				strikethrough: this.strikethrough,
			});
		}
		for(let y = this.y+1; y < this.y+this.height; y++) {
			output.push({
				x: this.x, y: y,
				char: this.left,
				bg: this.bg_color,
				fg: this.fg_color,
				bold: this.bold,
				italic: this.italic,
				underline: this.underline,
				strikethrough: this.strikethrough,
			}, {
				x: this.x+this.width, y: y,
				char: this.right,
				bg: this.bg_color,
				fg: this.fg_color,
				bold: this.bold,
				italic: this.italic,
				underline: this.underline,
				strikethrough: this.strikethrough,
			});
		}

		return output;
	}
}

export class TranslateEdit implements Edit {
	constructor(public x: number, public y: number, public edits: (Edit | Char)[]) {

	}
	into_chars(): Char[] {
		return this.edits.flatMap(edit => {
			if(typeof (edit as Edit)["into_chars"] === "function") return (edit as Edit).into_chars();
			return edit as Char;
		}).map(edit => ({ ...edit, x: edit.x + this.x, y: edit.y + this.y }));
	}
}

