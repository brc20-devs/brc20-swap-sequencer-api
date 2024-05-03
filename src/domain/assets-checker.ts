import { bn, decimalCal } from "../contract/bn";
import { EventType } from "../types/api";
import { need } from "./utils";

export class AssetsChecker {
  private open = true;
  // transfer  --> inscriptionId --> [amount]
  private map: { [key: string]: { [key: string]: string[] } } = {};
  constructor(map?) {
    this.map = map || {};
  }

  checkTransfer(inscriptionId: string, amount: string) {
    if (!this.open) {
      return;
    }
    const transfer = EventType.transfer;
    if (!this.map[transfer]) {
      this.map[transfer] = {};
    }
    need(!this.map[transfer][inscriptionId]);
    this.map[transfer][inscriptionId] = [amount];
  }

  checkInscribeApprove(inscriptionId: string, amount: string) {
    if (!this.open) {
      return;
    }
    const inscribeApprove = EventType.inscribeApprove;
    if (!this.map[inscribeApprove]) {
      this.map[inscribeApprove] = {};
    }
    need(!this.map[inscribeApprove][inscriptionId]);
    this.map[inscribeApprove][inscriptionId] = [amount];
  }

  checkApprove(inscriptionId: string, amount: string) {
    if (!this.open) {
      return;
    }
    const inscribeApprove = EventType.inscribeApprove;
    const approve = EventType.approve;
    need(!!this.map[inscribeApprove][inscriptionId]);

    const total = (arr: string[]) => {
      let ret = "0";
      arr.forEach((amount) => {
        ret = decimalCal([ret, "add", amount]);
      });
      return ret;
    };
    if (!this.map[approve]) {
      this.map[approve] = {};
    }
    need(
      bn(total(this.map[inscribeApprove][inscriptionId])).eq(total([amount]))
    );
    this.map[approve][inscriptionId] = [amount];
  }

  checkInscribeConditionalApprove(inscriptionId: string, amount: string) {
    if (!this.open) {
      return;
    }

    const inscribeConditionalApprove = EventType.inscribeConditionalApprove;
    if (!this.map[inscribeConditionalApprove]) {
      this.map[inscribeConditionalApprove] = {};
    }
    need(
      !this.map[inscribeConditionalApprove][inscriptionId],
      "checkInscribeConditionalApprove error, inscriptionId : " + inscriptionId
    );
    this.map[inscribeConditionalApprove][inscriptionId] = [amount];
  }

  checkConditionalApprove(
    inscriptionId: string,
    amount: string,
    transferInscriptionId: string,
    transferMax: string
  ) {
    if (!this.open) {
      return;
    }
    const inscribeConditionalApprove = EventType.inscribeConditionalApprove;
    const conditionalApprove = EventType.conditionalApprove;
    const transfer = EventType.conditionalApprove + "-" + EventType.transfer;
    need(!!this.map[inscribeConditionalApprove][inscriptionId]);

    const total = (arr: string[]) => {
      let ret = "0";
      arr.forEach((amount) => {
        ret = decimalCal([ret, "add", amount]);
      });
      return ret;
    };
    if (!this.map[conditionalApprove]) {
      this.map[conditionalApprove] = {};
    }
    if (!this.map[conditionalApprove][inscriptionId]) {
      this.map[conditionalApprove][inscriptionId] = [];
    }
    need(
      bn(total(this.map[inscribeConditionalApprove][inscriptionId])).gte(
        total(this.map[conditionalApprove][inscriptionId].concat([amount]))
      )
    );
    this.map[conditionalApprove][inscriptionId].push(amount);

    // ignore cancel
    if (transferInscriptionId) {
      if (!this.map[transfer]) {
        this.map[transfer] = {};
      }
      if (!this.map[transfer][transferInscriptionId]) {
        this.map[transfer][transferInscriptionId] = [];
      }
      need(
        bn(transferMax).gte(
          total(this.map[transfer][transferInscriptionId].concat([amount]))
        )
      );

      this.map[transfer][transferInscriptionId].push(amount);
    }
  }

  dataRefer() {
    return this.map;
  }
}
