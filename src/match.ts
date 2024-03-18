import { isWhiteSpace, stripAttributes } from "./utils";

export interface MatchOptions {
  /** Match granularity, defines how many words are joined into single block */
  blockSize: number;
  repeatingWordsAccuracy: number;
  ignoreWhitespaceDifferences: boolean;
}

export class Match {
  constructor(
    public readonly startInOld: number,
    public readonly startInNew: number,
    public readonly size: number,
  ) {}

  get endInOld(): number {
    return this.startInOld + this.size;
  }

  get endInNew(): number {
    return this.startInNew + this.size;
  }
}

export class MatchFinder {
  private _wordIndices: Map<string, number[]> = new Map();

  constructor(
    private _oldWords: string[],
    private _newWords: string[],
    private _startInOld: number,
    private _endInOld: number,
    private _startInNew: number,
    private _endInNew: number,
    private _options: MatchOptions,
  ) {}

  private indexNewWords(): void {
    this._wordIndices = new Map();
    const block: string[] = [];
    for (let i = this._startInNew; i < this._endInNew; i++) {
      const word = this.normalizeForIndexing(this._newWords[i]);
      const key = this.putNewWord(block, word, this._options.blockSize);
      if (key === null) continue;
      const indices = this._wordIndices.get(key) || [];
      indices.push(i);
      this._wordIndices.set(key, indices);
    }
  }

  private putNewWord(
    block: string[],
    word: string,
    blockSize: number,
  ): string | null {
    block.push(word);
    if (block.length > blockSize) block.shift();
    if (block.length !== blockSize) return null;
    return block.join("");
  }

  private normalizeForIndexing(word: string): string {
    word = stripAttributes(word);
    if (this._options.ignoreWhitespaceDifferences && isWhiteSpace(word))
      return " ";
    return word;
  }

  public findMatch(): Match | null {
    this.indexNewWords();
    this.removeRepeatingWords();

    if (this._wordIndices.size === 0) return null;

    let bestMatchInOld = this._startInOld;
    let bestMatchInNew = this._startInNew;
    let bestMatchSize = 0;
    const matchLengthAt: Record<number, number> = {};

    const block: string[] = [];

    for (
      let indexInOld = this._startInOld;
      indexInOld < this._endInOld;
      indexInOld++
    ) {
      const word = this.normalizeForIndexing(this._oldWords[indexInOld]);
      const index = this.putNewWord(block, word, this._options.blockSize);
      if (index === null) continue;

      const newMatchLengthAt: Record<number, number> = {};

      if (!this._wordIndices.has(index)) {
        Object.assign(matchLengthAt, newMatchLengthAt);
        continue;
      }

      for (const indexInNew of this._wordIndices.get(index) || []) {
        const newMatchLength =
          (matchLengthAt[indexInNew - 1] !== undefined
            ? matchLengthAt[indexInNew - 1]
            : 0) + 1;
        newMatchLengthAt[indexInNew] = newMatchLength;

        if (newMatchLength > bestMatchSize) {
          bestMatchInOld =
            indexInOld - newMatchLength + 1 - this._options.blockSize + 1;
          bestMatchInNew =
            indexInNew - newMatchLength + 1 - this._options.blockSize + 1;
          bestMatchSize = newMatchLength;
        }
      }

      Object.assign(matchLengthAt, newMatchLengthAt);
    }

    return bestMatchSize !== 0
      ? new Match(
          bestMatchInOld,
          bestMatchInNew,
          bestMatchSize + this._options.blockSize - 1,
        )
      : null;
  }

  private removeRepeatingWords(): void {
    const threshold =
      this._newWords.length * this._options.repeatingWordsAccuracy;
    const repeatingWords = [...this._wordIndices.entries()]
      .filter(([_, indices]) => indices.length > threshold)
      .map(([key, _]) => key);
    for (const word of repeatingWords) {
      this._wordIndices.delete(word);
    }
  }
}
