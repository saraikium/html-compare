import type { Action } from "./action";

export interface Operation {
  readonly action: Action;
  readonly startInOld: number;
  readonly endInOld: number;
  readonly startInNew: number;
  readonly endInNew: number;
}
