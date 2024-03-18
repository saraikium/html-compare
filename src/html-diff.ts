import { Action } from "./action";
import { WordSplitter } from "./word-splitter";
import { Match, MatchFinder, MatchOptions } from "./match";
import {
	isTag,
	wrapText,
	SPECIAL_CASE_OPENING_TAG_REGEX,
	SPECIAL_CASE_CLOSING_TAGS,
	getTagName,
} from "./utils";
import { Operation } from "./ops";

export class HtmlDiff {
	/**
	 * This value defines balance between speed and memory utilization.
	 * The higher it is the faster it works and more memory consumes.
	 */
	private static readonly MAX_MATCH_GRANULARITY: number = 4;
	private static readonly DelTag: string = "del";
	private static readonly InsTag: string = "ins";
	private readonly content: string[] = [];
	private newText: string;
	private oldText: string;

	/**
	 * Tracks opening and closing formatting tags to ensure that we don't inadvertently generate invalid html during the diff process.
	 */
	private readonly specialTagDiffStack: string[] = [];
	private newWords: string[] = [];
	private oldWords: string[] = [];
	private matchGranularity: number = 4;
	private readonly blockExpressions: RegExp[] = [];
	/**
	 Defines how to compare repeating words. Valid values are from 0 to 1.
	 This value allows to exclude some words from comparison that eventually
	 reduces the total time of the diff algorithm.
	 0 means that all words are excluded so the diff will not find any matching words at all.
	 1 (default value) means that all words participate in comparison so this is the most accurate case.
	 0.5 means that any word that occurs more than 50% times may be excluded from comparison. This doesn't
	 mean that such words will definitely be excluded but only gives a permission to exclude them if necessary.
  */
	public repeatingWordsAccuracy: number;
	/**
	 * If true all whitespaces are considered as equal
	 */
	public ignoreWhitespaceDifferences: boolean = true;

	/**
     If some match is too small and located far from its neighbors then it is considered as orphan
     and removed. For example:
       ```
       aaaaa bb ccccccccc dddddd ee
       11111 bb 222222222 dddddd ee
       ```
     will find two matches `bb` and `dddddd ee` but the first will be considered
     as orphan and ignored, as result it will consider texts `aaaaa bb ccccccccc` and
     `11111 bb 222222222` as single replacement:
     ```
     &lt;del&gt;aaaaa bb ccccccccc&lt;/del&gt;&lt;ins&gt;11111 bb 222222222&lt;/ins&gt; dddddd ee
     ```
     This property defines relative size of the match to be considered as orphan, from 0 to 1.
     1 means that all matches will be considered as orphans.
     0 (default) means that no match will be considered as orphan.
     0.2 means that if match length is less than 20% of distance between its neighbors it is considered as orphan.
  */
	public orphanMatchThreshold: number = 0;

	/**
	 * @param {string} oldText old html
	 * @param {string} newText - new html
	 */
	constructor(oldText: string, newText: string) {
		this.repeatingWordsAccuracy = 1.0;
		this.oldText = oldText;
		this.newText = newText;
		this.content = [];
		this.specialTagDiffStack = [];
		this.blockExpressions = [];
	}

	public build(): string {
		if (this.oldText === this.newText) {
			return this.newText;
		}

		this.splitInputsToWords();

		this.matchGranularity = Math.min(
			HtmlDiff.MAX_MATCH_GRANULARITY,
			this.oldWords.length,
			this.newWords.length,
		);

		const operations: Operation[] = this.operations();

		for (const operation of operations) {
			this.performOperation(operation);
		}

		return this.content.join("");
	}

	public AddBlockExpression(expression: RegExp): void {
		this.blockExpressions.push(expression);
	}

	private splitInputsToWords(): void {
		this.oldWords = new WordSplitter(this.oldText, this.blockExpressions).process();
		this.oldText = "";
		this.newWords = new WordSplitter(this.newText, this.blockExpressions).process();
		this.newText = "";
	}

	private performOperation(operation: Operation): void {
		switch (operation.action) {
			case Action.Equal:
				this.ProcessEqualOperation(operation);
				break;
			case Action.Delete:
				this.ProcessDeleteOperation(operation, "diffdel");
				break;
			case Action.Insert:
				this.ProcessInsertOperation(operation, "diffins");
				break;
			case Action.Replace:
				this.processReplaceOperation(operation);
				break;
		}
	}

	private processReplaceOperation(operation: Operation): void {
		this.ProcessDeleteOperation(operation, "diffmod");
		this.ProcessInsertOperation(operation, "diffmod");
	}

	private ProcessInsertOperation(operation: Operation, cssClass: string): void {
		const text = this.newWords.slice(operation.startInNew, operation.endInNew);
		this.InsertTag(HtmlDiff.InsTag, cssClass, text);
	}

	private ProcessDeleteOperation(operation: Operation, cssClass: string): void {
		const text = this.oldWords.slice(operation.startInOld, operation.endInOld);
		this.InsertTag(HtmlDiff.DelTag, cssClass, text);
	}

	private ProcessEqualOperation(operation: Operation): void {
		const result = this.newWords.slice(operation.startInNew, operation.endInNew).join("");
		this.content.push(result);
	}

	private InsertTag(tag: string, cssClass: string, words: string[]): void {
		while (words.length > 0) {
			const nonTags = this.extractConsecutiveWords(words, (x: string) => isTag(x));
			let specialCaseTagInjection = "";
			let specialCaseTagInjectionIsBefore = false;

			if (nonTags.length !== 0) {
				const text = wrapText(nonTags.join(""), tag, cssClass);
				this.content.push(text);
			} else {
				if (SPECIAL_CASE_OPENING_TAG_REGEX.test(words[0])) {
					this.specialTagDiffStack.push(words[0]);
					specialCaseTagInjection = "<ins class='mod'>";
					if (tag === HtmlDiff.DelTag) {
						words.shift();
						while (words.length > 0 && SPECIAL_CASE_OPENING_TAG_REGEX.test(words[0])) {
							words.shift();
						}
					}
				} else if (SPECIAL_CASE_CLOSING_TAGS.hasOwnProperty(words[0])) {
					const openingTag =
						this.specialTagDiffStack.length === 0 ? null : this.specialTagDiffStack.pop();

					const hasOpeningTag = openingTag !== null;

					const openingAndClosingTagsMatch =
						getTagName(openingTag || "") === getTagName(words[words.length - 1]);

					if (hasOpeningTag && openingAndClosingTagsMatch) {
						specialCaseTagInjection = "</ins>";
						specialCaseTagInjectionIsBefore = true;
					}

					if (tag === HtmlDiff.DelTag) {
						words.shift();
						while (words.length > 0 && SPECIAL_CASE_CLOSING_TAGS.hasOwnProperty(words[0])) {
							words.shift();
						}
					}
				}
			}

			if (!words.length && !specialCaseTagInjection) {
				break;
			}

			if (specialCaseTagInjectionIsBefore) {
				this.content.push(
					specialCaseTagInjection + this.extractConsecutiveWords(words, isTag).join(""),
				);
			} else {
				this.content.push(
					this.extractConsecutiveWords(words, isTag).join("") + specialCaseTagInjection,
				);
			}
		}
	}

	private extractConsecutiveWords(words: string[], condition: (word: string) => boolean): string[] {
		let indexOfFirstTag: number | undefined = undefined;

		for (let i = 0; i < words.length; i++) {
			const word = words[i];

			if (i === 0 && word === " ") {
				words[i] = "&nbsp;";
			}

			if (!condition(word)) {
				indexOfFirstTag = i;
				break;
			}
		}

		let items: string[];
		if (indexOfFirstTag !== undefined) {
			items = words.slice(0, indexOfFirstTag);
			words.splice(0, indexOfFirstTag);
		} else {
			items = words.slice(0, words.length);
			words.splice(0, words.length);
		}
		return items;
	}

	private operations(): Operation[] {
		let positionInOld = 0;
		let positionInNew = 0;
		const operations: Operation[] = [];

		const matches: Match[] = this.matchingBlocks();

		matches.push({
			startInOld: this.oldWords.length,
			endInOld: this.oldWords.length,
			startInNew: this.newWords.length,
			endInNew: this.newWords.length,
			size: 0,
		});

		const mathesWithoutOrphans = this.RemoveOrphans(matches);

		for (const match of mathesWithoutOrphans) {
			const matchStartsAtCurrentPositionInOld = positionInOld === match.startInOld;
			const matchStartsAtCurrentPositionInNew = positionInNew === match.startInNew;

			let action: Action;

			if (!matchStartsAtCurrentPositionInOld && !matchStartsAtCurrentPositionInNew) {
				action = Action.Replace;
			} else if (matchStartsAtCurrentPositionInOld && !matchStartsAtCurrentPositionInNew) {
				action = Action.Insert;
			} else if (!matchStartsAtCurrentPositionInOld) {
				action = Action.Delete;
			} else {
				action = Action.None;
			}

			if (action !== Action.None) {
				operations.push({
					action: action,
					startInOld: positionInOld,
					endInOld: match.startInOld,
					startInNew: positionInNew,
					endInNew: match.startInNew,
				});
			}

			if (match.size !== 0) {
				operations.push({
					action: Action.Equal,
					startInOld: match.startInOld,
					endInOld: match.endInOld,
					startInNew: match.startInNew,
					endInNew: match.endInNew,
				});
			}

			positionInOld = match.endInOld;
			positionInNew = match.endInNew;
		}

		return operations;
	}

	private *RemoveOrphans(matches: Match[]): IterableIterator<Match> {
		let prev: Match = {
			startInOld: 0,
			endInOld: 0,
			startInNew: 0,
			endInNew: 0,
			size: 0,
		};
		let curr: Match | null = null;

		for (const next of matches) {
			if (curr === null) {
				curr = next;
				continue;
			}

			if (
				(prev.endInOld === curr.startInOld && prev.endInNew === curr.startInNew) ||
				(curr.endInOld === next.startInOld && curr.endInNew === next.startInNew)
			) {
				yield curr;
				prev = curr;
				curr = next;
				continue;
			}

			const oldDistanceInChars = Array.from(
				{ length: next.startInOld - prev.endInOld },
				(_, i) => prev.endInOld + i,
			)
				.map((i) => this.oldWords[i].length)
				.reduce((acc, val) => acc + val, 0);

			const newDistanceInChars = Array.from(
				{ length: next.startInNew - prev.endInNew },
				(_, i) => prev.endInNew + i,
			)
				.map((i) => this.newWords[i].length)
				.reduce((acc, val) => acc + val, 0);

			const currMatchLengthInChars = Array.from(
				{ length: curr.endInNew - curr.startInNew },
				(_, i) => curr.startInNew + i,
			)
				.map((i) => this.newWords[i].length)
				.reduce((acc, val) => acc + val, 0);
			if (
				currMatchLengthInChars >
				Math.max(oldDistanceInChars, newDistanceInChars) * this.orphanMatchThreshold
			) {
				yield curr;
			}

			prev = curr;
			curr = next;
		}

		yield curr;
	}

	private matchingBlocks(): Match[] {
		const matchingBlocks: Match[] = [];
		this.findMatchingBlocks(0, this.oldWords.length, 0, this.newWords.length, matchingBlocks);
		return matchingBlocks;
	}

	private findMatchingBlocks(
		startInOld: number,
		endInOld: number,
		startInNew: number,
		endInNew: number,
		matchingBlocks: Match[],
	): void {
		const match = this.findMatch(startInOld, endInOld, startInNew, endInNew);

		if (match !== null) {
			if (startInOld < match.startInOld && startInNew < match.startInNew) {
				this.findMatchingBlocks(
					startInOld,
					match.startInOld,
					startInNew,
					match.startInNew,
					matchingBlocks,
				);
			}

			matchingBlocks.push(match);

			if (match.endInOld < endInOld && match.endInNew < endInNew) {
				this.findMatchingBlocks(match.endInOld, endInOld, match.endInNew, endInNew, matchingBlocks);
			}
		}
	}

	private findMatch(
		startInOld: number,
		endInOld: number,
		startInNew: number,
		endInNew: number,
	): Match {
		for (let i = this.matchGranularity; i > 0; i--) {
			const options: MatchOptions = {
				blockSize: i,
				repeatingWordsAccuracy: this.repeatingWordsAccuracy,
				ignoreWhitespaceDifferences: this.ignoreWhitespaceDifferences,
			};
			const finder = new MatchFinder(
				this.oldWords,
				this.newWords,
				startInOld,
				endInOld,
				startInNew,
				endInNew,
				options,
			);
			const match = finder.findMatch();
			if (match !== null) {
				return match;
			}
		}
		return null;
	}
}
