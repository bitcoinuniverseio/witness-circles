import { Transaction as ScureTransaction, SigHash } from "@scure/btc-signer";
import {
  bytesToHex,
  decodeTransaction,
  encodeTransaction,
  hexToBytes,
  inspectUnsignedSigningIntent,
  safeValidateCircle,
  taprootKeyPathSighash,
  transactionId,
  transactionMetrics,
  verifyGoldenCircleVector,
  witnessTransactionId,
} from "../src/index.js";
import { goldenContext, loadGolden } from "./fixture.js";

describe("transaction codec and validator", () => {
  it("verifies the committed golden transaction", () => {
    const vector = loadGolden();
    expect(verifyGoldenCircleVector(vector)).toEqual({
      valid: true,
      name: vector.name,
      txid: vector.txid,
      participantCount: 3,
      stateHash: vector.stateTransition.expectedStateHash,
    });
  });

  it("round trips raw bytes and derives stable transaction identifiers", () => {
    const vector = loadGolden();
    const transaction = decodeTransaction(vector.rawTransaction);
    expect(bytesToHex(encodeTransaction(transaction, true))).toBe(vector.rawTransaction);
    expect(transactionId(transaction)).toBe(vector.txid);
    expect(witnessTransactionId(transaction)).toBe(vector.wtxid);
    expect(transactionMetrics(transaction).virtualBytes).toBe(363);
  });

  it("matches an independent BIP341 sighash implementation", () => {
    const vector = loadGolden();
    const { transaction, prevouts } = goldenContext();
    const independent = ScureTransaction.fromRaw(hexToBytes(vector.rawTransaction), {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
    });
    const scripts = prevouts.map((prevout) => prevout.scriptPubKey);
    const amounts = prevouts.map((prevout) => prevout.value);
    for (let index = 0; index < transaction.inputs.length; index += 1) {
      expect(bytesToHex(taprootKeyPathSighash(transaction, index, prevouts))).toBe(
        bytesToHex(independent.preimageWitnessV1(index, scripts, SigHash.DEFAULT, amounts)),
      );
    }
  });

  it("fails a reordered input before applying state", () => {
    const { transaction, prevouts } = goldenContext();
    const [first, second, third] = transaction.inputs;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("Golden inputs missing");
    }
    const reordered = {
      ...transaction,
      inputs: [second, first, third],
    };
    const result = safeValidateCircle(reordered, {
      network: "signet",
      currentBlockHeight: 200,
      prevouts,
      signatureMode: "shape",
    });
    expect(result).toMatchObject({ valid: false, code: "INPUT_ORDER" });
  });

  it("fails a changed successor amount", () => {
    const { transaction, prevouts } = goldenContext();
    const marker = transaction.outputs[0];
    const output = transaction.outputs[1];
    if (marker === undefined || output === undefined) throw new Error("Golden outputs missing");
    const changed = {
      ...transaction,
      outputs: [marker, { ...output, value: output.value - 2n }, ...transaction.outputs.slice(2)],
    };
    const result = safeValidateCircle(changed, {
      network: "signet",
      currentBlockHeight: 200,
      prevouts,
      signatureMode: "shape",
    });
    expect(result).toMatchObject({ valid: false, code: "OUTPUT_MAPPING" });
  });

  it("fails unsafe sighash and unconfirmed prevouts", () => {
    const { transaction, prevouts } = goldenContext();
    const firstInput = transaction.inputs[0];
    const signature = firstInput?.witness[0];
    if (firstInput === undefined || signature === undefined)
      throw new Error("Golden signature missing");
    const unsafe = {
      ...transaction,
      inputs: [
        { ...firstInput, witness: [new Uint8Array([...signature, 0x81])] },
        ...transaction.inputs.slice(1),
      ],
    };
    expect(
      safeValidateCircle(unsafe, {
        network: "signet",
        currentBlockHeight: 200,
        prevouts,
        signatureMode: "shape",
      }),
    ).toMatchObject({ valid: false, code: "SIGHASH_UNSAFE" });
    expect(
      safeValidateCircle(transaction, {
        network: "signet",
        currentBlockHeight: 199,
        prevouts,
      }),
    ).toMatchObject({ valid: false, code: "INPUT_UNCONFIRMED" });
  });

  it("produces a complete unsigned signing summary", () => {
    const vector = loadGolden();
    const { transaction, prevouts } = goldenContext();
    const unsigned = {
      ...transaction,
      inputs: transaction.inputs.map((input) => ({ ...input, witness: [] })),
    };
    const ownedPrevout = prevouts[0];
    if (ownedPrevout === undefined) throw new Error("Golden prevout missing");
    const summary = inspectUnsignedSigningIntent(
      bytesToHex(encodeTransaction(unsigned, false)),
      { network: "signet", currentBlockHeight: 200, prevouts },
      {
        ownedOutpoint: ownedPrevout,
        expectedContextHash: vector.contextHash,
        maximumFeeShare: 2_000n,
        maximumTotalFee: 4_000n,
        maximumFeeRateSatsPerVbyte: 10n,
      },
    );
    expect(summary).toMatchObject({
      operation: "CIRCLE",
      participantCount: 3,
      feeShareSats: "1210",
      totalFeeSats: "3630",
    });
    expect(() =>
      inspectUnsignedSigningIntent(
        bytesToHex(encodeTransaction(unsigned, false)),
        { network: "signet", currentBlockHeight: 200, prevouts },
        {
          ownedOutpoint: ownedPrevout,
          expectedContextHash: vector.contextHash,
          maximumFeeShare: 2_000n,
          maximumTotalFee: 3_629n,
          maximumFeeRateSatsPerVbyte: 10n,
        },
      ),
    ).toThrow(/total fee/);
  });
});
