import { bn, uintCal } from "./bn";
import { need } from "./contract-utils";

export class Brc20 {
  readonly balance: { [key: string]: string } = {};
  readonly tick: string;
  private _supply: string;

  constructor(balance: { [key: string]: string }, tick: string) {
    this.balance = balance;
    this.tick = tick;
    this._supply = "0";
    for (const address in this.balance) {
      this._supply = uintCal([this._supply, "add", this.balance[address]]);
    }
  }

  get supply() {
    return this._supply;
  }

  balanceOf(address: string) {
    return this.balance[address] || "0";
  }

  transfer(from: string, to: string, amount: string) {
    this.checkAmount(amount);
    this.checkAddress(from, amount);
    this.balance[from] = uintCal([this.balance[from], "sub", amount]);
    this.balance[to] = uintCal([this.balance[to] || "0", "add", amount]);
    this.checkAddress(from);
    this.checkAddress(to);
  }

  mint(address: string, amount: string) {
    this.checkAmount(amount);
    this.balance[address] = uintCal([
      this.balance[address] || "0",
      "add",
      amount,
    ]);
    this._supply = uintCal([this._supply, "add", amount]);
    this.checkAddress(address);
  }

  burn(address: string, amount: string) {
    this.checkAmount(amount);
    this.checkAddress(address, amount);
    this.balance[address] = uintCal([
      this.balance[address] || "0",
      "sub",
      amount,
    ]);
    this._supply = uintCal([this._supply, "sub", amount]);
    this.checkAddress(address);
  }

  private checkAmount(amount: string) {
    need(bn(amount).gt("0"), "invalid amount: " + this.tick);
  }

  private checkAddress(address: string, value = "0") {
    need(
      bn(this.balance[address]).gte(value),
      "insufficient amount: " + this.tick
    );
  }
}
