import { NodeVM } from "vm2";
import { Contract } from "./contract";

export class ContractLoader {
  private contractOnChain: typeof Contract;
  constructor() {}

  getClass() {
    if (config.isContractOnChain) {
      return this.contractOnChain;
    } else {
      return Contract;
    }
  }

  async init() {
    if (config.isContractOnChain) {
      const inscriptionId = env.Source;
      const contractText = await api.inscriptionContent(inscriptionId);

      const vm = new NodeVM({
        require: {
          external: true,
          root: "./",
        },
      });
      const bundle = vm.run(contractText, "vm.js");
      this.contractOnChain = bundle.Contract;
    }
  }
}
