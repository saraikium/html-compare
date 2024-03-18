export const OPENING_TAG_REGEX = /^\s*<[^>]+>\s*$/;
export const CLOSING_TAG_TEX_REGEX = /^\s*<\/[^>]+>\s*$/;
export const TAG_WORD_REGEX = /<[^\s>]+/;
export const WHITESPACE_REGEX = /^(?:\s|&nbsp;)+$/;
export const WORD_REGEX = /[\w#@]+/;
export const TAG_REGEX = /<\/?(?<name>[^\s/>]+)[^>]*>/;
export const SPECIAL_CASE_OPENING_TAG_REGEX: RegExp = new RegExp(
	"<((strong)|(b)|(i)|(em)|(big)|(small)|(u)|(sub)|(sup)|(strike)|(s)|(span))[\\>\\s]+",
	"i",
);

export const SPECIAL_CASE_CLOSING_TAGS = {
	"</strong>": 0,
	"</em>": 0,
	"</b>": 0,
	"</i>": 0,
	"</big>": 0,
	"</small>": 0,
	"</u>": 0,
	"</sub>": 0,
	"</sup>": 0,
	"</strike>": 0,
	"</s>": 0,
	"</span>": 0,
} as const;

export const SPECIAL_CASE_WORD_TAGS: string[] = ["<img"];

export function isTag(item: string): boolean {
	if (SPECIAL_CASE_WORD_TAGS.some((re) => item != null && item.startsWith(re))) return false;

	return isOpeningTag(item) || isClosingTag(item);
}

export function isOpeningTag(item: string): boolean {
	return OPENING_TAG_REGEX.test(item);
}

export function isClosingTag(item: string): boolean {
	return CLOSING_TAG_TEX_REGEX.test(item);
}

export function stripTagAttributes(word: string): string {
	const tag = TAG_WORD_REGEX.exec(word)?.[0] || "";
	word = tag + (word.endsWith("/>") ? "/>" : ">");
	return word;
}

export function stripAttributes(word: string): string {
	if (isTag(word)) {
		return stripTagAttributes(word);
	}
	return word;
}

export function wrapText(text: string, tagName: string, cssClass: string): string {
	return `<${tagName} class='${cssClass}'>${text}</${tagName}>`;
}

export function isStartOfTag(val: string): boolean {
	return val === "<";
}

export function isEndOfTag(val: string): boolean {
	return val === ">";
}

export function isStartOfEntity(val: string): boolean {
	return val === "&";
}

export function isEndOfEntity(val: string): boolean {
	return val === ";";
}

export function isWhiteSpace(value: string): boolean {
	return WHITESPACE_REGEX.test(value);
}

export function isWord(text: string): boolean {
	return WORD_REGEX.test(text);
}

export function getTagName(word: string): string {
	const noResult = "";
	if (!word) {
		return noResult;
	}
	const tagMatch = TAG_REGEX.exec(word);
	return tagMatch?.groups?.name?.toLowerCase() || noResult;
}
