import { ethers } from "hardhat";
import { expect } from "chai";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { AddressZero } from "@ethersproject/constants";
import type { TransactionResponse } from "@ethersproject/abstract-provider";

// types
import {
  ERC725Y,
  ERC725YWriter__factory,
  ERC725YReader__factory,
} from "../types";

import { bytecode as ERC725Bytecode } from "../artifacts/contracts/ERC725.sol/ERC725.json";

// constants
import { INTERFACE_ID } from "../constants";

export type ERC725YTestAccounts = {
  owner: SignerWithAddress;
  caller: SignerWithAddress;
  creator: SignerWithAddress;
  anyone: SignerWithAddress;
};

export const getNamedAccounts = async (): Promise<ERC725YTestAccounts> => {
  const [owner, caller, creator, anyone] = await ethers.getSigners();
  return {
    owner,
    caller,
    creator,
    anyone,
  };
};

export type ERC725YDeployParams = {
  newOwner: string;
};

export type ERC725YTestContext = {
  accounts: ERC725YTestAccounts;
  erc725Y: ERC725Y;
  deployParams: ERC725YDeployParams;
};

export const shouldBehaveLikeERC725Y = (
  buildContext: () => Promise<ERC725YTestContext>
) => {
  let context: ERC725YTestContext;

  beforeEach(async () => {
    context = await buildContext();
  });

  describe("When testing ownership", () => {
    describe("When owner is transferring ownership", () => {
      it("should pass and emit OwnershipTransferred event", async () => {
        await expect(
          context.erc725Y
            .connect(context.accounts.owner)
            .transferOwnership(context.accounts.anyone.address)
        )
          .to.emit(context.erc725Y, "OwnershipTransferred")
          .withArgs(
            context.accounts.owner.address,
            context.accounts.anyone.address
          );

        const accountOwner = await context.erc725Y.callStatic.owner();

        expect(accountOwner).to.equal(context.accounts.anyone.address);
      });
    });

    describe("When non-owner is transferring ownership", () => {
      it("should revert", async () => {
        await expect(
          context.erc725Y
            .connect(context.accounts.anyone)
            .transferOwnership(context.accounts.anyone.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });

    describe("When owner is renouncing ownership", () => {
      it("should pass and emit OwnershipTransferred event", async () => {
        await expect(
          context.erc725Y.connect(context.accounts.owner).renounceOwnership()
        )
          .to.emit(context.erc725Y, "OwnershipTransferred")
          .withArgs(context.accounts.owner.address, AddressZero);

        const accountOwner = await context.erc725Y.callStatic.owner();

        expect(accountOwner).to.equal(AddressZero);
      });
    });

    describe("When non-owner is renouncing ownership", () => {
      it("should revert", async () => {
        await expect(
          context.erc725Y.connect(context.accounts.anyone).renounceOwnership()
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });

  describe("When testing setting data", () => {
    describe("When using setData(bytes32,bytes)", () => {
      describe("When owner is setting data", () => {
        it("should pass and emit DataChanged event", async () => {
          const txParams = {
            dataKey: ethers.utils.solidityKeccak256(
              ["string"],
              ["FirstDataKey"]
            ),
            dataValue: "0xaabbccdd",
          };

          await expect(
            context.erc725Y
              .connect(context.accounts.owner)
              ["setData(bytes32,bytes)"](txParams.dataKey, txParams.dataValue)
          )
            .to.emit(context.erc725Y, "DataChanged")
            .withArgs(txParams.dataKey, txParams.dataValue);

          const fetchedData = await context.erc725Y.callStatic[
            "getData(bytes32)"
          ](txParams.dataKey);

          expect(fetchedData).to.equal(txParams.dataValue);
        });
      });

      describe("When non-owner is setting data", () => {
        it("should revert", async () => {
          const txParams = {
            dataKey: ethers.utils.solidityKeccak256(
              ["string"],
              ["FirstDataKey"]
            ),
            dataValue: "0xaabbccdd",
          };

          await expect(
            context.erc725Y
              .connect(context.accounts.anyone)
              ["setData(bytes32,bytes)"](txParams.dataKey, txParams.dataValue)
          ).to.be.revertedWith("Ownable: caller is not the owner");

          const fetchedData = await context.erc725Y.callStatic[
            "getData(bytes32)"
          ](txParams.dataKey);

          expect(fetchedData).to.equal("0x");
        });
      });

      describe("When interacting from a smart Contract", () => {
        let erc725YWriter;
        beforeEach(async () => {
          erc725YWriter = await new ERC725YWriter__factory(
            context.accounts.anyone
          ).deploy();

          await context.erc725Y
            .connect(context.accounts.owner)
            .transferOwnership(erc725YWriter.address);
        });

        it("should pass and emit DataChanged event", async () => {
          const txParams = {
            dataKey: ethers.utils.solidityKeccak256(
              ["string"],
              ["FirstDataKey"]
            ),
            dataValue: "0xaabbccdd",
          };

          await expect(
            erc725YWriter
              .connect(context.accounts.owner)
              .callSetDataSingle(
                context.erc725Y.address,
                txParams.dataKey,
                txParams.dataValue
              )
          )
            .to.emit(context.erc725Y, "DataChanged")
            .withArgs(txParams.dataKey, txParams.dataValue);

          const fetchedData = await context.erc725Y.callStatic[
            "getData(bytes32)"
          ](txParams.dataKey);

          expect(fetchedData).to.equal(txParams.dataValue);
        });
      });

      describe("When interacting from an EOA", () => {
        describe("when setting a new data Key", () => {
          it("should pass and emit DataChanged event", async () => {
            const txParams = {
              dataKey: ethers.utils.solidityKeccak256(
                ["string"],
                ["FirstDataKey"]
              ),
              dataValue: "0xaabbccdd",
            };

            await expect(
              context.erc725Y
                .connect(context.accounts.owner)
                ["setData(bytes32,bytes)"](txParams.dataKey, txParams.dataValue)
            )
              .to.emit(context.erc725Y, "DataChanged")
              .withArgs(txParams.dataKey, txParams.dataValue);

            const fetchedData = await context.erc725Y.callStatic[
              "getData(bytes32)"
            ](txParams.dataKey);

            expect(fetchedData).to.equal(txParams.dataValue);
          });
        });

        describe("when updating an existing data Key", () => {
          let tx1Params;
          before(async () => {
            tx1Params = {
              dataKey: ethers.utils.solidityKeccak256(
                ["string"],
                ["FirstDataKey"]
              ),
              dataValue: "0xaabbccdd",
            };

            // Setting for first time
            await context.erc725Y
              .connect(context.accounts.owner)
              ["setData(bytes32,bytes)"](
                tx1Params.dataKey,
                tx1Params.dataValue
              );

            const fetchedData = await context.erc725Y.callStatic[
              "getData(bytes32)"
            ](tx1Params.dataKey);

            expect(fetchedData).to.equal(tx1Params.dataValue);
          });
          it("should pass and emit DataChanged event", async () => {
            const tx2Params = {
              dataKey: tx1Params.dataKey,
              dataValue: "0xaabbccdd",
            };

            await expect(
              context.erc725Y
                .connect(context.accounts.owner)
                ["setData(bytes32,bytes)"](
                  tx2Params.dataKey,
                  tx2Params.dataValue
                )
            )
              .to.emit(context.erc725Y, "DataChanged")
              .withArgs(tx2Params.dataKey, tx2Params.dataValue);

            const fetchedData = await context.erc725Y.callStatic[
              "getData(bytes32)"
            ](tx2Params.dataKey);

            expect(fetchedData).to.equal(tx2Params.dataValue);
          });
        });

        describe("when removing an existing data Key", () => {
          let tx1Params;
          before(async () => {
            tx1Params = {
              dataKey: ethers.utils.solidityKeccak256(
                ["string"],
                ["FirstDataKey"]
              ),
              dataValue: "0xaabbccdd",
            };

            // Setting for first time
            await context.erc725Y
              .connect(context.accounts.owner)
              ["setData(bytes32,bytes)"](
                tx1Params.dataKey,
                tx1Params.dataValue
              );

            const fetchedData = await context.erc725Y.callStatic[
              "getData(bytes32)"
            ](tx1Params.dataKey);

            expect(fetchedData).to.equal(tx1Params.dataValue);
          });

          it("should pass and emit DataChanged event", async () => {
            const tx2Params = {
              dataKey: tx1Params.dataKey,
              dataValue: "0x",
            };

            await expect(
              context.erc725Y
                .connect(context.accounts.owner)
                ["setData(bytes32,bytes)"](
                  tx2Params.dataKey,
                  tx2Params.dataValue
                )
            )
              .to.emit(context.erc725Y, "DataChanged")
              .withArgs(tx2Params.dataKey, tx2Params.dataValue);

            const fetchedData = await context.erc725Y.callStatic[
              "getData(bytes32)"
            ](tx2Params.dataKey);

            expect(fetchedData).to.equal(tx2Params.dataValue);
          });
        });

        describe("when setting large bytes in the storage", () => {
          it("should pass and emit DataChanged event", async () => {
            const txParams = {
              dataKey: ethers.utils.solidityKeccak256(
                ["string"],
                ["BytecodeOfMyFavoriteContract"]
              ),
              dataValue: ERC725Bytecode,
            };

            await expect(
              context.erc725Y
                .connect(context.accounts.owner)
                ["setData(bytes32,bytes)"](txParams.dataKey, txParams.dataValue)
            )
              .to.emit(context.erc725Y, "DataChanged")
              .withArgs(txParams.dataKey, txParams.dataValue);

            const fetchedData = await context.erc725Y.callStatic[
              "getData(bytes32)"
            ](txParams.dataKey);

            expect(fetchedData).to.equal(txParams.dataValue);
          });
        });
      });
    });
    describe("When using setData(bytes32[],bytes[])", () => {
      describe("When owner is setting data", () => {
        it("should pass and emit DataChanged event", async () => {
          const txParams = {
            dataKey: ethers.utils.solidityKeccak256(
              ["string"],
              ["FirstDataKey"]
            ),
            dataValue: "0xaabbccdd",
          };

          await expect(
            context.erc725Y
              .connect(context.accounts.owner)
              ["setData(bytes32[],bytes[])"](
                [txParams.dataKey],
                [txParams.dataValue]
              )
          )
            .to.emit(context.erc725Y, "DataChanged")
            .withArgs(txParams.dataKey, txParams.dataValue);

          const fetchedData = await context.erc725Y.callStatic[
            "getData(bytes32)"
          ](txParams.dataKey);

          expect(fetchedData).to.equal(txParams.dataValue);
        });
      });

      describe("When non-owner is setting data", () => {
        it("should revert", async () => {
          const txParams = {
            dataKey: ethers.utils.solidityKeccak256(
              ["string"],
              ["FirstDataKey"]
            ),
            dataValue: "0xaabbccdd",
          };

          await expect(
            context.erc725Y
              .connect(context.accounts.anyone)
              ["setData(bytes32[],bytes[])"](
                [txParams.dataKey],
                [txParams.dataValue]
              )
          ).to.be.revertedWith("Ownable: caller is not the owner");

          const fetchedData = await context.erc725Y.callStatic[
            "getData(bytes32)"
          ](txParams.dataKey);

          expect(fetchedData).to.equal("0x");
        });
      });

      describe("When interacting from a smart Contract", () => {
        let erc725YWriter;
        beforeEach(async () => {
          erc725YWriter = await new ERC725YWriter__factory(
            context.accounts.anyone
          ).deploy();

          await context.erc725Y
            .connect(context.accounts.owner)
            .transferOwnership(erc725YWriter.address);
        });

        it("should pass and emit DataChanged event", async () => {
          const txParams = {
            dataKey: ethers.utils.solidityKeccak256(
              ["string"],
              ["FirstDataKey"]
            ),
            dataValue: "0xaabbccdd",
          };

          await expect(
            erc725YWriter
              .connect(context.accounts.owner)
              .callSetDataArray(
                context.erc725Y.address,
                [txParams.dataKey],
                [txParams.dataValue]
              )
          )
            .to.emit(context.erc725Y, "DataChanged")
            .withArgs(txParams.dataKey, txParams.dataValue);

          const fetchedData = await context.erc725Y.callStatic[
            "getData(bytes32)"
          ](txParams.dataKey);

          expect(fetchedData).to.equal(txParams.dataValue);
        });
      });

      describe("When interacting from an EOA", () => {
        describe("when setting a new data Key", () => {
          it("should pass and emit DataChanged event", async () => {
            const txParams = {
              dataKey: ethers.utils.solidityKeccak256(
                ["string"],
                ["FirstDataKey"]
              ),
              dataValue: "0xaabbccdd",
            };

            await expect(
              context.erc725Y
                .connect(context.accounts.owner)
                ["setData(bytes32[],bytes[])"](
                  [txParams.dataKey],
                  [txParams.dataValue]
                )
            )
              .to.emit(context.erc725Y, "DataChanged")
              .withArgs(txParams.dataKey, txParams.dataValue);

            const fetchedData = await context.erc725Y.callStatic[
              "getData(bytes32)"
            ](txParams.dataKey);

            expect(fetchedData).to.equal(txParams.dataValue);
          });
        });
        describe("when updating an existing data Key", () => {
          let tx1Params;
          before(async () => {
            tx1Params = {
              dataKey: ethers.utils.solidityKeccak256(
                ["string"],
                ["FirstDataKey"]
              ),
              dataValue: "0xaabbccdd",
            };

            // Setting for first time
            await context.erc725Y
              .connect(context.accounts.owner)
              ["setData(bytes32[],bytes[])"](
                [tx1Params.dataKey],
                [tx1Params.dataValue]
              );

            const fetchedData = await context.erc725Y.callStatic[
              "getData(bytes32)"
            ](tx1Params.dataKey);

            expect(fetchedData).to.equal(tx1Params.dataValue);
          });
          it("should pass and emit DataChanged event", async () => {
            const tx2Params = {
              dataKey: tx1Params.dataKey,
              dataValue: "0xaabbccdd",
            };

            await expect(
              context.erc725Y
                .connect(context.accounts.owner)
                ["setData(bytes32[],bytes[])"](
                  [tx2Params.dataKey],
                  [tx2Params.dataValue]
                )
            )
              .to.emit(context.erc725Y, "DataChanged")
              .withArgs(tx2Params.dataKey, tx2Params.dataValue);

            const fetchedData = await context.erc725Y.callStatic[
              "getData(bytes32)"
            ](tx2Params.dataKey);

            expect(fetchedData).to.equal(tx2Params.dataValue);
          });
        });
        describe("when removing an existing data Key", () => {
          let tx1Params;
          before(async () => {
            tx1Params = {
              dataKey: ethers.utils.solidityKeccak256(
                ["string"],
                ["FirstDataKey"]
              ),
              dataValue: "0xaabbccdd",
            };

            // Setting for first time
            await context.erc725Y
              .connect(context.accounts.owner)
              ["setData(bytes32[],bytes[])"](
                [tx1Params.dataKey],
                [tx1Params.dataValue]
              );

            const fetchedData = await context.erc725Y.callStatic[
              "getData(bytes32)"
            ](tx1Params.dataKey);

            expect(fetchedData).to.equal(tx1Params.dataValue);
          });

          it("should pass and emit DataChanged event", async () => {
            const tx2Params = {
              dataKey: tx1Params.dataKey,
              dataValue: "0x",
            };

            await expect(
              context.erc725Y
                .connect(context.accounts.owner)
                ["setData(bytes32[],bytes[])"](
                  [tx2Params.dataKey],
                  [tx2Params.dataValue]
                )
            )
              .to.emit(context.erc725Y, "DataChanged")
              .withArgs(tx2Params.dataKey, tx2Params.dataValue);

            const fetchedData = await context.erc725Y.callStatic[
              "getData(bytes32)"
            ](tx2Params.dataKey);

            expect(fetchedData).to.equal(tx2Params.dataValue);
          });
        });

        describe("when setting large bytes in the storage", () => {
          it("should pass and emit DataChanged event", async () => {
            const txParams = {
              dataKey: ethers.utils.solidityKeccak256(
                ["string"],
                ["BytecodeOfMyFavoriteContract"]
              ),
              dataValue: ERC725Bytecode,
            };

            await expect(
              context.erc725Y
                .connect(context.accounts.owner)
                ["setData(bytes32[],bytes[])"](
                  [txParams.dataKey],
                  [txParams.dataValue]
                )
            )
              .to.emit(context.erc725Y, "DataChanged")
              .withArgs(txParams.dataKey, txParams.dataValue);

            const fetchedData = await context.erc725Y.callStatic[
              "getData(bytes32)"
            ](txParams.dataKey);

            expect(fetchedData).to.equal(txParams.dataValue);
          });
        });

        describe("when data keys length != data values length", () => {
          it("should revert", async () => {
            const txParams = {
              dataKey: ethers.utils.solidityKeccak256(
                ["string"],
                ["FirstDataKey"]
              ),
              dataValue: "0xaabbccdd",
            };

            await expect(
              context.erc725Y
                .connect(context.accounts.owner)
                ["setData(bytes32[],bytes[])"](
                  [txParams.dataKey, txParams.dataKey],
                  [txParams.dataValue]
                )
            )
              .to.be.revertedWithCustomError(
                context.erc725Y,
                "ERC725Y_DataKeysValuesLengthMismatch"
              )
              .withArgs(2, 1);
          });
        });
      });
    });
  });

  describe("When testing getting data", () => {
    describe("When using getData(bytes32)", () => {
      describe("When owner is setting data", () => {
        let txParams;
        beforeEach(async () => {
          txParams = {
            dataKey: ethers.utils.solidityKeccak256(
              ["string"],
              ["FirstDataKey"]
            ),
            dataValue: "0xaabbccdd",
          };

          await context.erc725Y
            .connect(context.accounts.owner)
            ["setData(bytes32,bytes)"](txParams.dataKey, txParams.dataValue);
        });
        it("should pass", async () => {
          const result = await context.erc725Y
            .connect(context.accounts.owner)
            .callStatic["getData(bytes32)"](txParams.dataKey);

          expect(result).to.equal(txParams.dataValue);
        });
      });
      describe("When non-owner is setting data", () => {
        let txParams;
        beforeEach(async () => {
          txParams = {
            dataKey: ethers.utils.solidityKeccak256(
              ["string"],
              ["FirstDataKey"]
            ),
            dataValue: "0xaabbccdd",
          };

          await context.erc725Y
            .connect(context.accounts.owner)
            ["setData(bytes32,bytes)"](txParams.dataKey, txParams.dataValue);
        });
        it("should pass", async () => {
          const result = await context.erc725Y
            .connect(context.accounts.anyone)
            .callStatic["getData(bytes32)"](txParams.dataKey);

          expect(result).to.equal(txParams.dataValue);
        });
      });
      describe("When interacting from a smart Contract", () => {
        let erc725YReader;
        let txParams;
        beforeEach(async () => {
          erc725YReader = await new ERC725YReader__factory(
            context.accounts.anyone
          ).deploy();

          txParams = {
            dataKey: ethers.utils.solidityKeccak256(
              ["string"],
              ["FirstDataKey"]
            ),
            dataValue: "0xaabbccdd",
          };

          await context.erc725Y
            .connect(context.accounts.owner)
            ["setData(bytes32,bytes)"](txParams.dataKey, txParams.dataValue);
        });
        it("should pass", async () => {
          const result = await erc725YReader
            .connect(context.accounts.anyone)
            .callStatic.callGetDataSingle(
              context.erc725Y.address,
              txParams.dataKey
            );

          expect(result).to.equal(txParams.dataValue);
        });
      });
      describe("When interacting from an EOA", () => {
        describe("When getting normal sizeData", () => {
          let txParams;
          beforeEach(async () => {
            txParams = {
              dataKey: ethers.utils.solidityKeccak256(
                ["string"],
                ["FirstDataKey"]
              ),
              dataValue: "0xaabbccdd",
            };

            await context.erc725Y
              .connect(context.accounts.owner)
              ["setData(bytes32,bytes)"](txParams.dataKey, txParams.dataValue);
          });
          it("should pass", async () => {
            const result = await context.erc725Y
              .connect(context.accounts.owner)
              .callStatic["getData(bytes32)"](txParams.dataKey);

            expect(result).to.equal(txParams.dataValue);
          });
        });
        describe("When getting big sizeData", () => {
          let txParams;
          beforeEach(async () => {
            txParams = {
              dataKey: ethers.utils.solidityKeccak256(
                ["string"],
                ["FirstDataKey"]
              ),
              dataValue: ERC725Bytecode,
            };

            await context.erc725Y
              .connect(context.accounts.owner)
              ["setData(bytes32,bytes)"](txParams.dataKey, txParams.dataValue);
          });
          it("should pass", async () => {
            const result = await context.erc725Y
              .connect(context.accounts.owner)
              .callStatic["getData(bytes32)"](txParams.dataKey);

            expect(result).to.equal(txParams.dataValue);
          });
        });
      });
    });
    describe("When using getData(bytes32[])", () => {
      describe("When owner is setting data", () => {
        let txParams;
        beforeEach(async () => {
          txParams = {
            dataKey: ethers.utils.solidityKeccak256(
              ["string"],
              ["FirstDataKey"]
            ),
            dataValue: "0xaabbccdd",
          };

          await context.erc725Y
            .connect(context.accounts.owner)
            ["setData(bytes32[],bytes[])"](
              [txParams.dataKey],
              [txParams.dataValue]
            );
        });
        it("should pass", async () => {
          const [result] = await context.erc725Y
            .connect(context.accounts.owner)
            .callStatic["getData(bytes32[])"]([txParams.dataKey]);

          expect(result).to.equal(txParams.dataValue);
        });
      });
      describe("When non-owner is setting data", () => {
        let txParams;
        beforeEach(async () => {
          txParams = {
            dataKey: ethers.utils.solidityKeccak256(
              ["string"],
              ["FirstDataKey"]
            ),
            dataValue: "0xaabbccdd",
          };

          await context.erc725Y
            .connect(context.accounts.owner)
            ["setData(bytes32[],bytes[])"](
              [txParams.dataKey],
              [txParams.dataValue]
            );
        });
        it("should pass", async () => {
          const [result] = await context.erc725Y
            .connect(context.accounts.anyone)
            .callStatic["getData(bytes32[])"]([txParams.dataKey]);

          expect(result).to.equal(txParams.dataValue);
        });
      });
      describe("When interacting from a smart Contract", () => {
        let erc725YReader;
        let txParams;
        beforeEach(async () => {
          erc725YReader = await new ERC725YReader__factory(
            context.accounts.anyone
          ).deploy();

          txParams = {
            dataKey: ethers.utils.solidityKeccak256(
              ["string"],
              ["FirstDataKey"]
            ),
            dataValue: "0xaabbccdd",
          };

          await context.erc725Y
            .connect(context.accounts.owner)
            ["setData(bytes32[],bytes[])"](
              [txParams.dataKey],
              [txParams.dataValue]
            );
        });
        it("should pass", async () => {
          const [result] = await erc725YReader
            .connect(context.accounts.anyone)
            .callStatic.callGetDataArray(context.erc725Y.address, [
              txParams.dataKey,
            ]);

          expect(result).to.equal(txParams.dataValue);
        });
      });
      describe("When interacting from an EOA", () => {
        describe("When getting normal sizeData", () => {
          let txParams;
          beforeEach(async () => {
            txParams = {
              dataKey: ethers.utils.solidityKeccak256(
                ["string"],
                ["FirstDataKey"]
              ),
              dataValue: "0xaabbccdd",
            };

            await context.erc725Y
              .connect(context.accounts.owner)
              ["setData(bytes32[],bytes[])"](
                [txParams.dataKey],
                [txParams.dataValue]
              );
          });
          it("should pass", async () => {
            const [result] = await context.erc725Y
              .connect(context.accounts.owner)
              .callStatic["getData(bytes32[])"]([txParams.dataKey]);

            expect(result).to.equal(txParams.dataValue);
          });
        });

        describe("When getting big sizeData", () => {
          let txParams;
          beforeEach(async () => {
            txParams = {
              dataKey: ethers.utils.solidityKeccak256(
                ["string"],
                ["FirstDataKey"]
              ),
              dataValue: ERC725Bytecode,
            };

            await context.erc725Y
              .connect(context.accounts.owner)
              ["setData(bytes32[],bytes[])"](
                [txParams.dataKey],
                [txParams.dataValue]
              );
          });
          it("should pass", async () => {
            const [result] = await context.erc725Y
              .connect(context.accounts.owner)
              .callStatic["getData(bytes32[])"]([txParams.dataKey]);

            expect(result).to.equal(txParams.dataValue);
          });
        });

        describe("When getting many entries", () => {
          let txParams;
          beforeEach(async () => {
            txParams = {
              dataKey1: ethers.utils.solidityKeccak256(
                ["string"],
                ["FirstDataKey"]
              ),
              dataValue1: "0xddccbbaa",
              dataKey2: ethers.utils.solidityKeccak256(
                ["string"],
                ["SecondDataKey"]
              ),
              dataValue2: "0xaabbccdd",
            };

            await context.erc725Y
              .connect(context.accounts.owner)
              ["setData(bytes32[],bytes[])"](
                [txParams.dataKey1, txParams.dataKey2],
                [txParams.dataValue1, txParams.dataValue2]
              );
          });
          it("should pass", async () => {
            const [result1, result2] = await context.erc725Y
              .connect(context.accounts.owner)
              .callStatic["getData(bytes32[])"]([
                txParams.dataKey1,
                txParams.dataKey2,
              ]);

            expect(result1).to.equal(txParams.dataValue1);
            expect(result2).to.equal(txParams.dataValue2);
          });
        });
      });
    });
  });
};

export type ERC725YInitializeTestContext = {
  erc725Y: ERC725Y;
  deployParams: ERC725YDeployParams;
  initializeTransaction: TransactionResponse;
};

export const shouldInitializeLikeERC725Y = (
  buildContext: () => Promise<ERC725YInitializeTestContext>
) => {
  let context: ERC725YInitializeTestContext;

  beforeEach(async () => {
    context = await buildContext();
  });

  describe("when the contract was initialized", () => {
    it("should have registered the ERC165 interface", async () => {
      expect(await context.erc725Y.supportsInterface(INTERFACE_ID.ERC165)).to.be
        .true;
    });

    it("should have registered the ERC725Y interface", async () => {
      expect(await context.erc725Y.supportsInterface(INTERFACE_ID.ERC725Y));
    });

    it("should have set the correct owner", async () => {
      expect(await context.erc725Y.callStatic.owner()).to.be.equal(
        context.deployParams.newOwner
      );
    });
  });
};
