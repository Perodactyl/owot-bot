import { hsvToRgb } from "./util";

export function* constantGen<T>(input: T): Generator<T> {
	while(true) {
		yield input;
	}
}

export function* mapGen<T, U>(input: Iterator<T>, mapper: (value: T)=> U): Generator<U> {
	while(true) {
		let value = input.next();
		if(value.done) {
			break;
		} else {
			yield mapper(value.value);
		}
	}
}

export function* cycleGen<T>(input: Iterable<T>): Generator<T> {
	let outputs: T[] = [];
	let iter = input[Symbol.iterator]();

	while(true) {
		let result = iter.next();
		if(result.done) {
			break;
		} else {
			yield result.value;
			outputs.push(result.value);
		}
	}

	while(true) {
		yield* outputs;
	}
}

export function* rainbow(length: number, saturation: number, value: number): Generator<number> {
	while(true) {
		for(let i = 0; i < length; i++) {
			let progress = i / length;
			yield hsvToRgb(progress, saturation, value);
		}
	}
}
