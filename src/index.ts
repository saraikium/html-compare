import { HtmlDiff } from "./html-diff";

export default function diff(oldText: string, newText: string): string {
	return new HtmlDiff(oldText, newText).build();
}
