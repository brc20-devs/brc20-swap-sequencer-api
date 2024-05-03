export class Decimal {
  private map: { [key: string]: string };
  constructor(map: { [key: string]: string }) {
    this.map = map;
  }
  getRealTick(tick: string) {
    for (let k in this.map) {
      if (k.toLowerCase() == tick.toLowerCase()) {
        return k;
      }
    }
    return tick;
  }

  get(tick: string) {
    let ret = this.map[tick];
    if (!ret) {
      for (let k in this.map) {
        if (k.toLowerCase() == tick.toLowerCase()) {
          ret = this.map[k];
          break;
        }
      }
    }
    return ret;
  }
  set(tick: string, decimal: string) {
    this.map[tick] = decimal;
  }
}
