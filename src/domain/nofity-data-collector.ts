import { NotifyAssetData } from "../contract/assets";
import { NotifyKlastData } from "../contract/contract";
import { Observer } from "../contract/observer";
import { need, sysFatal } from "./utils";

const TAG = "notify-data-collector";

export type AssetProcessing = (data: AssetListItem) => void;
type AssetListItem = { raw: NotifyAssetData; processing: any };
type KlastListItem = { raw: NotifyKlastData; processing: any };

export class NotifyDataCollector {
  private assetList: AssetListItem[] = [];
  private klastList: KlastListItem[] = [];

  private observer: Observer;

  private startCursor: number;
  private curHandledCursor: number; // Detecting the coherence of events

  private assetProcessing: AssetProcessing;

  get Observer() {
    return this.observer;
  }

  get AssetList() {
    return this.assetList;
  }

  get KlastList() {
    return this.klastList;
  }

  get StartCursor() {
    return this.startCursor;
  }

  constructor(cursor: number) {
    /****************************************
     * collector processing:
     * 1. collect data
     * 2. data processing (option)
     * 3. cursor++
     ****************************************/

    /*1*/ this.observer = new Observer((dataType: string, raw: any) => {
      if (dataType == "asset") {
        const item: AssetListItem = {
          raw,
          processing: {},
        };
        if (this.assetProcessing) {
          this.assetProcessing(item);
        }
        this.assetList.push(item);
      } else if (dataType == "klast") {
        const item: KlastListItem = {
          raw,
          processing: {},
        };
        this.klastList.push(item);
      }
    });
    this.reset(cursor);
  }

  setAssetProcessing(processing: AssetProcessing) {
    this.assetProcessing = processing;
  }

  checkAndUpdateCurCursor(cursor: number) {
    if (this.curHandledCursor + 1 !== cursor) {
      sysFatal({
        tag: TAG,
        msg: "checkAndUpdateCurCursor",
        cursor,
        curHandledCursor: this.curHandledCursor,
      });
    }
    this.curHandledCursor = cursor;
  }

  reset(cursor: number) {
    need(cursor >= 0);
    this.startCursor = cursor;
    this.curHandledCursor = cursor;
    this.assetList = [];
    this.klastList = [];
  }
}
