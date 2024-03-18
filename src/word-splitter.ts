import { Mode } from "./mode";
import {
	isWhiteSpace,
	isWord,
	isStartOfTag,
	isEndOfTag,
	isEndOfEntity,
	isStartOfEntity,
} from "./utils";

export type From = number;
export type To = number;

export class WordSplitter {
	private text: string;
	private isBlockCheckRequired: boolean;
	private blockLocations: Map<To, From>;
	private mode: Mode;
	private isGrouping: boolean = false;
	private globbingUntil: number;
	private currentWord: string[];
	private words: string[];
	private static NotGlobbing: number = -1;

	constructor(text: string, blockExpressions: RegExp[]) {
		this.text = text;
		this.blockLocations = this.findBlocksToBeGrouped(text, blockExpressions);
		this.isBlockCheckRequired = this.blockLocations.size > 0;
		this.mode = Mode.Character;
		this.globbingUntil = WordSplitter.NotGlobbing;
		this.currentWord = [];
		this.words = [];
	}

	public process(): string[] {
		for (let index = 0; index < this.text.length; index++) {
			const character = this.text[index];
			this.processCharacter(index, character);
		}
		this.appendCurrentWordToWords();
		return this.words;
	}

	private processCharacter(index: number, character: string): void {
		if (this.isGlobbing(index, character)) {
			return;
		}
		switch (this.mode) {
			case Mode.Character:
				this.processTextCharacter(character);
				break;
			case Mode.Tag:
				this.processHtmlTagContinuation(character);
				break;
			case Mode.Whitespace:
				this.processWhiteSpaceContinuation(character);
				break;
			case Mode.Entity:
				this.processEntityContinuation(character);
				break;
		}
	}

	private processEntityContinuation(character: string): void {
		if (isStartOfTag(character)) {
			this.appendCurrentWordToWords();
			this.currentWord.push(character);
			this.mode = Mode.Tag;
		} else if (character.trim() === "") {
			this.appendCurrentWordToWords();
			this.currentWord.push(character);
			this.mode = Mode.Whitespace;
		} else if (isEndOfEntity(character)) {
			let switchToNextMode = true;
			if (this.currentWord.length > 0) {
				this.currentWord.push(character);
				this.words.push(this.currentWord.join(""));

				// Join &nbsp; entity with last whitespace
				if (
					this.words.length > 2 &&
					isWhiteSpace(this.words[this.words.length - 2]) &&
					isWhiteSpace(this.words[this.words.length - 1])
				) {
					const w1 = this.words[this.words.length - 2];
					const w2 = this.words[this.words.length - 1];
					this.words.splice(-2, 2);
					this.currentWord = [...w1, ...w2];
					this.mode = Mode.Whitespace;
					switchToNextMode = false;
				}
			}

			if (switchToNextMode) {
				this.currentWord = [];
				this.mode = Mode.Character;
			}
		} else if (isWord(character)) {
			this.currentWord.push(character);
		} else {
			this.appendCurrentWordToWords();
			this.currentWord.push(character);
			this.mode = Mode.Character;
		}
	}

	private processWhiteSpaceContinuation(character: string): void {
		if (isStartOfTag(character)) {
			this.appendCurrentWordToWords();
			this.currentWord.push(character);
			this.mode = Mode.Tag;
		} else if (isStartOfEntity(character)) {
			this.appendCurrentWordToWords();
			this.currentWord.push(character);
			this.mode = Mode.Entity;
		} else if (character.trim() === "") {
			this.currentWord.push(character);
		} else {
			this.appendCurrentWordToWords();
			this.currentWord.push(character);
			this.mode = Mode.Character;
		}
	}

	private processHtmlTagContinuation(character: string): void {
		if (isEndOfTag(character)) {
			this.currentWord.push(character);
			this.appendCurrentWordToWords();
			this.mode = isWhiteSpace(character) ? Mode.Whitespace : Mode.Character;
		} else {
			this.currentWord.push(character);
		}
	}

	private processTextCharacter(character: string): void {
		if (isStartOfTag(character)) {
			this.appendCurrentWordToWords();
			this.currentWord.push("<");
			this.mode = Mode.Tag;
		} else if (isStartOfEntity(character)) {
			this.appendCurrentWordToWords();
			this.currentWord.push(character);
			this.mode = Mode.Entity;
		} else if (character.trim() === "") {
			this.appendCurrentWordToWords();
			this.currentWord.push(character);
			this.mode = Mode.Whitespace;
		} else if (
			isWord(character) &&
			(!this.currentWord.length || isWord(this.currentWord[this.currentWord.length - 1]))
		) {
			this.currentWord.push(character);
		} else {
			this.appendCurrentWordToWords();
			this.currentWord.push(character);
		}
	}

	private appendCurrentWordToWords(): void {
		if (this.currentWord.length > 0) {
			this.words.push(this.currentWord.join(""));
			this.currentWord = [];
		}
	}

	private isGlobbing(index: number, character: string): boolean {
		if (!this.isBlockCheckRequired) {
			return false;
		}

		const isCurrentBlockTerminating = index === this.globbingUntil;

		if (isCurrentBlockTerminating) {
			this.globbingUntil = WordSplitter.NotGlobbing;
			this.isGrouping = false;
			this.appendCurrentWordToWords();
		}

		const until = this.blockLocations.get(index);
		if (until !== undefined) {
			this.isGrouping = true;
			this.globbingUntil = until;
		}

		if (this.isGrouping) {
			this.currentWord.push(character);
			this.mode = Mode.Character;
		}
		return this.isGrouping;
	}

	private findBlocksToBeGrouped(text: string, blockExpressions: RegExp[]): Map<To, From> {
		const result = new Map<To, From>();
		if (!blockExpressions) {
			return result;
		}

		for (const regexp of blockExpressions) {
			this.processBlockMatcher(text, regexp, result);
		}
		return result;
	}

	private processBlockMatcher(text: string, exp: RegExp, result: Map<To, From>): void {
		const matches = text.matchAll(exp);

		for (const match of matches) {
			try {
				const from = match.index || 0;
				const to = (match.index || 0) + match[0].length;
				result.set(from, to);
			} catch (error) {
				const msg = `One or more block expressions result in a text sequence that overlaps. Current expression: ${exp}`;
				throw new Error(msg);
			}
		}
	}
}
