/*
 * Witness Circles browser engine.
 *
 * A dependency-free re-implementation of the rules in src/marker.ts,
 * src/transaction.ts, src/validator.ts and src/state.ts of this repository,
 * used by the circle state simulator on simulator.html.
 *
 * It reproduces the published test vectors in test-vectors/v1 exactly:
 * marker decoding, transaction decoding, txid, wtxid, virtual size, fee
 * allocation, lineage identifiers, the state snapshot and the state hash.
 *
 * It does NOT verify BIP340 signatures. Browsers expose no Schnorr primitive,
 * so witness data is checked for shape only. That is the "shape" signature
 * mode of the reference validator and it is not sufficient for authoritative
 * indexing. Nothing here is transmitted, stored or logged.
 */
(function (global) {
  "use strict";

  var MAGIC = "WITC";
  var PROTOCOL_VERSION = 1;
  var CIRCLE_OPCODE = 1;
  var MARKER_PAYLOAD_LENGTH = 40;
  var MARKER_SCRIPT_LENGTH = 42;
  var MIN_PARTICIPANTS = 2;
  var MAX_PARTICIPANTS = 16;
  var MIN_SUCCESSOR_VALUE_SATS = 1000n;
  var MAX_MONEY_SATS = 2100000000000000n;
  var REQUIRED_TRANSACTION_VERSION = 2;
  var REQUIRED_LOCK_TIME = 0;
  var REQUIRED_SEQUENCE = 0xfffffffd;
  var LINEAGE_DOMAIN = "WITC/lineage/v1";
  var NETWORK_NAMES = ["mainnet", "testnet3", "signet", "regtest"];
  var NETWORK_IDS = { mainnet: 0, testnet3: 1, signet: 2, regtest: 3 };

  function WitcError(code, message, details) {
    var error = new Error(message);
    error.name = "WitcError";
    error.code = code;
    error.details = details || {};
    return error;
  }

  function check(condition, code, message, details) {
    if (!condition) throw WitcError(code, message, details);
  }

  /* ---------- bytes ---------- */

  var HEX = "0123456789abcdef";

  function bytesToHex(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i += 1) {
      out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
    }
    return out;
  }

  function hexToBytes(hex, expectedLength) {
    check(typeof hex === "string", "INVALID_HEX", "Hex input must be a string");
    var clean = hex.trim().toLowerCase();
    check(/^[0-9a-f]*$/.test(clean), "INVALID_HEX", "Hex input contains a non-hex character");
    check(clean.length % 2 === 0, "INVALID_HEX", "Hex input must have an even length");
    var bytes = new Uint8Array(clean.length / 2);
    for (var i = 0; i < bytes.length; i += 1) {
      bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    if (expectedLength !== undefined) {
      check(
        bytes.length === expectedLength,
        "INVALID_HEX",
        "Hex input must be " + expectedLength + " bytes",
        { actualLength: bytes.length }
      );
    }
    return bytes;
  }

  function utf8Bytes(text) {
    return new TextEncoder().encode(text);
  }

  function concatBytes() {
    var total = 0;
    var i;
    for (i = 0; i < arguments.length; i += 1) total += arguments[i].length;
    var out = new Uint8Array(total);
    var offset = 0;
    for (i = 0; i < arguments.length; i += 1) {
      out.set(arguments[i], offset);
      offset += arguments[i].length;
    }
    return out;
  }

  function reverseBytes(bytes) {
    var out = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i += 1) out[i] = bytes[bytes.length - 1 - i];
    return out;
  }

  function uint32LE(value) {
    var out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value >>> 0, true);
    return out;
  }

  function uint64LE(value) {
    var out = new Uint8Array(8);
    new DataView(out.buffer).setBigUint64(0, BigInt(value), true);
    return out;
  }

  function compareBytes(left, right) {
    var length = Math.min(left.length, right.length);
    for (var i = 0; i < length; i += 1) {
      if (left[i] !== right[i]) return left[i] - right[i];
    }
    return left.length - right.length;
  }

  /* ---------- hashing ---------- */

  function subtle() {
    var api = global.crypto && global.crypto.subtle;
    check(
      api !== undefined && api !== null,
      "INVALID_STATE",
      "This browser exposes no Web Crypto SHA-256 implementation"
    );
    return api;
  }

  async function sha256(bytes) {
    var digest = await subtle().digest("SHA-256", bytes);
    return new Uint8Array(digest);
  }

  async function doubleSha256(bytes) {
    return sha256(await sha256(bytes));
  }

  async function taggedHash(tag, message) {
    var tagHash = await sha256(utf8Bytes(tag));
    return sha256(concatBytes(tagHash, tagHash, message));
  }

  /* ---------- outpoints ---------- */

  function normalizeTxid(txid) {
    return bytesToHex(hexToBytes(txid, 32));
  }

  function outpointKey(outpoint) {
    return normalizeTxid(outpoint.txid) + ":" + outpoint.vout;
  }

  function compareOutpoints(left, right) {
    var order = compareBytes(
      hexToBytes(normalizeTxid(left.txid)),
      hexToBytes(normalizeTxid(right.txid))
    );
    return order !== 0 ? order : left.vout - right.vout;
  }

  function serializeOutpoint(outpoint) {
    return concatBytes(reverseBytes(hexToBytes(normalizeTxid(outpoint.txid), 32)), uint32LE(outpoint.vout));
  }

  /* ---------- transaction codec ---------- */

  function encodeCompactSize(value) {
    var amount = BigInt(value);
    check(
      amount >= 0n && amount <= 0xffffffffffffffffn,
      "INTEGER_RANGE",
      "CompactSize value is out of range"
    );
    if (amount < 0xfdn) return Uint8Array.of(Number(amount));
    if (amount <= 0xffffn) {
      return Uint8Array.of(0xfd, Number(amount & 0xffn), Number((amount >> 8n) & 0xffn));
    }
    if (amount <= 0xffffffffn) return concatBytes(Uint8Array.of(0xfe), uint32LE(Number(amount)));
    return concatBytes(Uint8Array.of(0xff), uint64LE(amount));
  }

  function ByteReader(bytes) {
    this.bytes = bytes;
    this.offset = 0;
  }

  ByteReader.prototype.read = function (length) {
    check(
      Number.isInteger(length) && length >= 0 && this.offset + length <= this.bytes.length,
      "INVALID_TRANSACTION",
      "Transaction data is truncated"
    );
    var value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  };

  ByteReader.prototype.byte = function () {
    return this.read(1)[0];
  };

  ByteReader.prototype.uint32 = function () {
    var raw = this.read(4);
    return new DataView(raw.buffer, raw.byteOffset, 4).getUint32(0, true);
  };

  ByteReader.prototype.uint64 = function () {
    var raw = this.read(8);
    return new DataView(raw.buffer, raw.byteOffset, 8).getBigUint64(0, true);
  };

  ByteReader.prototype.compactSize = function () {
    var prefix = this.byte();
    if (prefix < 0xfd) return BigInt(prefix);
    if (prefix === 0xfd) {
      var raw = this.read(2);
      var short = BigInt(raw[0] | (raw[1] << 8));
      check(short >= 0xfdn, "AMBIGUOUS_ENCODING", "CompactSize uint16 is not minimally encoded");
      return short;
    }
    if (prefix === 0xfe) {
      var wide = BigInt(this.uint32());
      check(wide > 0xffffn, "AMBIGUOUS_ENCODING", "CompactSize uint32 is not minimally encoded");
      return wide;
    }
    var huge = this.uint64();
    check(huge > 0xffffffffn, "AMBIGUOUS_ENCODING", "CompactSize uint64 is not minimally encoded");
    return huge;
  };

  ByteReader.prototype.count = function (label, maximum) {
    var value = this.compactSize();
    check(value <= BigInt(maximum), "INVALID_TRANSACTION", label + " exceeds the decoder limit");
    return Number(value);
  };

  function serializeInput(input) {
    return concatBytes(
      serializeOutpoint(input),
      encodeCompactSize(input.scriptSig.length),
      input.scriptSig,
      uint32LE(input.sequence)
    );
  }

  function serializeOutput(output) {
    check(
      output.value >= 0n && output.value <= MAX_MONEY_SATS,
      "INTEGER_RANGE",
      "Transaction output value is out of range"
    );
    return concatBytes(
      uint64LE(output.value),
      encodeCompactSize(output.scriptPubKey.length),
      output.scriptPubKey
    );
  }

  function serializeWitness(items) {
    var parts = [encodeCompactSize(items.length)];
    for (var i = 0; i < items.length; i += 1) {
      parts.push(encodeCompactSize(items[i].length), items[i]);
    }
    return concatBytes.apply(null, parts);
  }

  function hasWitness(transaction) {
    return transaction.inputs.some(function (input) {
      return input.witness.length > 0;
    });
  }

  function encodeTransaction(transaction, includeWitness) {
    var useWitness = includeWitness !== false && hasWitness(transaction);
    var parts = [uint32LE(transaction.version)];
    if (useWitness) parts.push(Uint8Array.of(0x00, 0x01));
    parts.push(encodeCompactSize(transaction.inputs.length));
    transaction.inputs.forEach(function (input) {
      parts.push(serializeInput(input));
    });
    parts.push(encodeCompactSize(transaction.outputs.length));
    transaction.outputs.forEach(function (output) {
      parts.push(serializeOutput(output));
    });
    if (useWitness) {
      transaction.inputs.forEach(function (input) {
        parts.push(serializeWitness(input.witness));
      });
    }
    parts.push(uint32LE(transaction.lockTime));
    return concatBytes.apply(null, parts);
  }

  function decodeTransaction(raw) {
    var bytes = typeof raw === "string" ? hexToBytes(raw) : raw;
    var reader = new ByteReader(bytes);
    var version = reader.uint32();
    var segwit = false;
    var inputCount = reader.compactSize();
    if (inputCount === 0n) {
      check(reader.byte() === 1, "AMBIGUOUS_ENCODING", "Only the SegWit marker and flag 0001 are accepted");
      segwit = true;
      inputCount = reader.compactSize();
    }
    check(inputCount > 0n && inputCount <= 10000n, "INVALID_TRANSACTION", "Input count is invalid");
    var inputs = [];
    var index;
    for (index = 0; index < Number(inputCount); index += 1) {
      var txid = bytesToHex(reverseBytes(reader.read(32)));
      var vout = reader.uint32();
      var scriptSig = reader.read(reader.count("scriptSig length", 10000));
      inputs.push({ txid: txid, vout: vout, scriptSig: scriptSig, sequence: reader.uint32(), witness: [] });
    }
    var outputCount = reader.count("output count", 10000);
    check(outputCount > 0, "INVALID_TRANSACTION", "Transaction must contain at least one output");
    var outputs = [];
    for (index = 0; index < outputCount; index += 1) {
      var value = reader.uint64();
      check(value <= MAX_MONEY_SATS, "INTEGER_RANGE", "Transaction output exceeds MAX_MONEY");
      outputs.push({ value: value, scriptPubKey: reader.read(reader.count("scriptPubKey length", 10000)) });
    }
    if (segwit) {
      for (index = 0; index < inputs.length; index += 1) {
        var itemCount = reader.count("witness item count", 1000);
        var witness = [];
        for (var item = 0; item < itemCount; item += 1) {
          witness.push(reader.read(reader.count("witness item length", 1000000)));
        }
        inputs[index].witness = witness;
      }
      check(hasWitness({ inputs: inputs }), "AMBIGUOUS_ENCODING", "Superfluous SegWit marker and flag are not accepted");
    }
    var lockTime = reader.uint32();
    check(reader.offset === bytes.length, "TRAILING_DATA", "Raw transaction contains trailing data");
    return { version: version, inputs: inputs, outputs: outputs, lockTime: lockTime };
  }

  async function transactionId(transaction) {
    return bytesToHex(reverseBytes(await doubleSha256(encodeTransaction(transaction, false))));
  }

  async function witnessTransactionId(transaction) {
    return bytesToHex(reverseBytes(await doubleSha256(encodeTransaction(transaction, true))));
  }

  function transactionMetrics(transaction) {
    var baseBytes = encodeTransaction(transaction, false).length;
    var totalBytes = encodeTransaction(transaction, true).length;
    var witnessBytes = totalBytes - baseBytes;
    var weight = baseBytes * 4 + witnessBytes;
    return {
      baseBytes: baseBytes,
      totalBytes: totalBytes,
      witnessBytes: witnessBytes,
      weight: weight,
      virtualBytes: Math.ceil(weight / 4)
    };
  }

  function isNativeP2tr(scriptPubKey) {
    return scriptPubKey.length === 34 && scriptPubKey[0] === 0x51 && scriptPubKey[1] === 0x20;
  }

  /* ---------- marker ---------- */

  function encodeMarkerPayload(input) {
    check(
      input.network === "signet" || input.network === "regtest",
      "INVALID_NETWORK",
      "Marker creation is enabled only on Signet and regtest"
    );
    var hash = hexToBytes(input.contextHash, 32);
    check(
      input.participantCount >= MIN_PARTICIPANTS && input.participantCount <= MAX_PARTICIPANTS,
      "INPUT_COUNT",
      "Participant count must be between 2 and 16"
    );
    check(
      hash.some(function (byte) {
        return byte !== 0;
      }),
      "CONTEXT_HASH_ZERO",
      "Context hash cannot be zero"
    );
    var payload = new Uint8Array(MARKER_PAYLOAD_LENGTH);
    payload.set(utf8Bytes(MAGIC), 0);
    payload[4] = PROTOCOL_VERSION;
    payload[5] = NETWORK_IDS[input.network];
    payload[6] = CIRCLE_OPCODE;
    payload[7] = input.participantCount;
    payload.set(hash, 8);
    return payload;
  }

  function encodeMarkerScript(input) {
    var script = new Uint8Array(MARKER_SCRIPT_LENGTH);
    script[0] = 0x6a;
    script[1] = MARKER_PAYLOAD_LENGTH;
    script.set(encodeMarkerPayload(input), 2);
    return script;
  }

  function decodeMarkerScript(script) {
    var magicHex = bytesToHex(utf8Bytes(MAGIC));
    if (
      script.length === MARKER_SCRIPT_LENGTH + 1 &&
      script[0] === 0x6a &&
      script[1] === 0x4c &&
      script[2] === MARKER_PAYLOAD_LENGTH &&
      bytesToHex(script.slice(3, 7)) === magicHex
    ) {
      check(false, "AMBIGUOUS_ENCODING", "Marker must use direct PUSH40, not PUSHDATA1");
    }
    check(script.length === MARKER_SCRIPT_LENGTH, "INVALID_MARKER", "Marker script must be exactly 42 bytes", {
      actualLength: script.length
    });
    check(
      script[0] === 0x6a && script[1] === MARKER_PAYLOAD_LENGTH,
      "AMBIGUOUS_ENCODING",
      "Marker must use OP_RETURN followed by direct PUSH40"
    );
    var payload = script.slice(2);
    check(bytesToHex(payload.slice(0, 4)) === magicHex, "INVALID_MARKER", "Marker magic is not WITC");
    check(payload[4] === PROTOCOL_VERSION, "INVALID_VERSION", "Unsupported Witness Circles version", {
      version: payload[4]
    });
    var networkId = payload[5];
    check(networkId >= 0 && networkId <= 3, "INVALID_NETWORK", "Unknown network identifier", {
      networkId: networkId
    });
    check(payload[6] === CIRCLE_OPCODE, "INVALID_OPCODE", "Only CIRCLE is valid in protocol v1", {
      opcode: payload[6]
    });
    var participantCount = payload[7];
    check(
      participantCount >= MIN_PARTICIPANTS && participantCount <= MAX_PARTICIPANTS,
      "INPUT_COUNT",
      "Marker participant count must be between 2 and 16"
    );
    var hash = payload.slice(8, 40);
    check(
      hash.some(function (byte) {
        return byte !== 0;
      }),
      "CONTEXT_HASH_ZERO",
      "Context hash cannot be zero"
    );
    return {
      magic: MAGIC,
      version: PROTOCOL_VERSION,
      network: NETWORK_NAMES[networkId],
      networkId: networkId,
      opcode: CIRCLE_OPCODE,
      participantCount: participantCount,
      contextHash: bytesToHex(hash)
    };
  }

  /* ---------- fees and size ---------- */

  function allocateEqualFeeShares(totalFee, participantCount) {
    check(totalFee >= 0n, "FEE_NEGATIVE", "Transaction fee cannot be negative");
    check(
      participantCount >= MIN_PARTICIPANTS && participantCount <= MAX_PARTICIPANTS,
      "INPUT_COUNT",
      "Participant count must be between 2 and 16"
    );
    var divisor = BigInt(participantCount);
    var quotient = totalFee / divisor;
    var remainder = Number(totalFee % divisor);
    var shares = [];
    for (var index = 0; index < participantCount; index += 1) {
      shares.push(quotient + (index < remainder ? 1n : 0n));
    }
    return shares;
  }

  function estimateCircleVsize(participantCount, explicitSighashAllCount) {
    var explicit = explicitSighashAllCount || 0;
    check(
      Number.isInteger(participantCount) &&
        participantCount >= MIN_PARTICIPANTS &&
        participantCount <= MAX_PARTICIPANTS,
      "INPUT_COUNT",
      "Participant count must be between 2 and 16"
    );
    return Math.ceil((246 + 402 * participantCount + explicit) / 4);
  }

  /* ---------- witness shape ---------- */

  function decodeCircleSignature(witness) {
    check(witness.length === 1, "WITNESS_SHAPE", "Circle inputs require exactly one key-path witness item");
    var item = witness[0];
    check(item.length === 64 || item.length === 65, "WITNESS_SHAPE", "Circle signature must be 64 or 65 bytes");
    if (item.length === 64) return { hashType: 0 };
    check(item[64] === 1, "SIGHASH_UNSAFE", "Only explicit SIGHASH_ALL is permitted on 65-byte signatures", {
      hashType: item[64]
    });
    return { hashType: 1 };
  }

  /* ---------- validator ---------- */

  async function validateCircle(transaction, context) {
    var mode = context.signatureMode || "shape";
    var index;
    check(
      transaction.version === REQUIRED_TRANSACTION_VERSION,
      "TRANSACTION_VERSION",
      "Circle transaction version must be 2"
    );
    check(transaction.lockTime === REQUIRED_LOCK_TIME, "LOCK_TIME", "Circle locktime must be zero");
    check(
      Number.isInteger(context.currentBlockHeight) && context.currentBlockHeight >= 1,
      "PREVOUT_HEIGHT",
      "Current block height must be positive"
    );
    check(transaction.outputs.length > 0, "OUTPUT_COUNT", "Circle requires a marker output");
    var markerOutput = transaction.outputs[0];
    var marker = decodeMarkerScript(markerOutput.scriptPubKey);
    check(marker.network === context.network, "INVALID_NETWORK", "Marker network does not match validation context", {
      markerNetwork: marker.network,
      contextNetwork: context.network
    });
    check(markerOutput.value === 0n, "MARKER_VALUE", "Circle marker output must have zero value");
    check(
      transaction.inputs.length === marker.participantCount,
      "INPUT_COUNT",
      "Input count must equal marker participant count"
    );
    check(
      transaction.outputs.length === marker.participantCount + 1,
      "OUTPUT_COUNT",
      "Circle must contain one marker and one successor per participant"
    );

    var seenInputs = Object.create(null);
    for (index = 0; index < transaction.inputs.length; index += 1) {
      var input = transaction.inputs[index];
      check(input.sequence === REQUIRED_SEQUENCE, "SEQUENCE", "Every Circle input sequence must be 0xfffffffd", {
        slot: index
      });
      check(input.scriptSig.length === 0, "INVALID_P2TR", "Native P2TR input scriptSig must be empty", {
        slot: index
      });
      var key = outpointKey(input);
      check(seenInputs[key] === undefined, "DUPLICATE_INPUT", "Circle contains a duplicate input", {
        outpoint: key
      });
      seenInputs[key] = true;
      if (index > 0) {
        check(
          compareOutpoints(transaction.inputs[index - 1], input) < 0,
          "INPUT_ORDER",
          "Inputs must be strictly sorted by display txid then vout",
          { slot: index }
        );
      }
    }

    var byOutpoint = Object.create(null);
    var prevoutCount = 0;
    context.prevouts.forEach(function (prevout) {
      var key = outpointKey(prevout);
      check(byOutpoint[key] === undefined, "DUPLICATE_INPUT", "Validation context contains a duplicate prevout", {
        outpoint: key
      });
      byOutpoint[key] = prevout;
      prevoutCount += 1;
    });
    check(
      prevoutCount === transaction.inputs.length,
      "INPUT_PREVOUT_MISSING",
      "Validation context must contain exactly one prevout per input"
    );

    var orderedPrevouts = [];
    var scripts = Object.create(null);
    var inputTotal = 0n;
    for (index = 0; index < transaction.inputs.length; index += 1) {
      var slotInput = transaction.inputs[index];
      var prevout = byOutpoint[outpointKey(slotInput)];
      check(prevout !== undefined, "INPUT_PREVOUT_MISSING", "Input prevout is missing", {
        outpoint: outpointKey(slotInput)
      });
      check(
        Number.isInteger(prevout.blockHeight) && prevout.blockHeight >= 0,
        "PREVOUT_HEIGHT",
        "Prevout block height is invalid"
      );
      check(
        prevout.blockHeight < context.currentBlockHeight,
        "INPUT_UNCONFIRMED",
        "Circle inputs must be confirmed in an earlier block",
        { slot: index, prevoutHeight: prevout.blockHeight, currentBlockHeight: context.currentBlockHeight }
      );
      check(prevout.value >= 0n && prevout.value <= MAX_MONEY_SATS, "INTEGER_RANGE", "Prevout value is out of range");
      check(isNativeP2tr(prevout.scriptPubKey), "INVALID_P2TR", "Every Circle input must spend native P2TR", {
        slot: index
      });
      var scriptHex = bytesToHex(prevout.scriptPubKey);
      check(scripts[scriptHex] === undefined, "DUPLICATE_SCRIPT", "Each participant must use a distinct P2TR output key", {
        slot: index
      });
      scripts[scriptHex] = true;
      orderedPrevouts.push(prevout);
      inputTotal += prevout.value;
      check(inputTotal <= MAX_MONEY_SATS, "INTEGER_RANGE", "Circle input total exceeds MAX_MONEY");
    }

    var outputTotal = 0n;
    transaction.outputs.forEach(function (output) {
      check(output.value >= 0n && output.value <= MAX_MONEY_SATS, "INTEGER_RANGE", "Output value is out of range");
      outputTotal += output.value;
      check(outputTotal <= MAX_MONEY_SATS, "INTEGER_RANGE", "Circle output total exceeds MAX_MONEY");
    });
    check(inputTotal >= outputTotal, "FEE_NEGATIVE", "Circle outputs exceed inputs");
    var fee = inputTotal - outputTotal;
    var feeShares = allocateEqualFeeShares(fee, marker.participantCount);
    var txid = await transactionId(transaction);

    var members = [];
    for (index = 0; index < marker.participantCount; index += 1) {
      var memberInput = transaction.inputs[index];
      var memberPrevout = orderedPrevouts[index];
      var output = transaction.outputs[index + 1];
      var feeShare = feeShares[index];
      check(
        bytesToHex(output.scriptPubKey) === bytesToHex(memberPrevout.scriptPubKey),
        "OUTPUT_MAPPING",
        "Successor script must exactly match the corresponding input script",
        { slot: index }
      );
      check(
        output.value >= MIN_SUCCESSOR_VALUE_SATS,
        "SUCCESSOR_DUST",
        "Successor output is below the protocol minimum",
        { slot: index, minimum: MIN_SUCCESSOR_VALUE_SATS.toString(), actual: output.value.toString() }
      );
      check(
        output.value === memberPrevout.value - feeShare,
        "OUTPUT_MAPPING",
        "Successor value does not match deterministic fee allocation",
        {
          slot: index,
          expected: (memberPrevout.value - feeShare).toString(),
          actual: output.value.toString()
        }
      );
      var signatureHashType = null;
      if (mode === "unsigned") {
        check(memberInput.witness.length === 0, "WITNESS_SHAPE", "Unsigned Circle inputs must not contain witness data", {
          slot: index
        });
      } else {
        signatureHashType = decodeCircleSignature(memberInput.witness).hashType;
      }
      members.push({
        slot: index,
        input: { txid: memberInput.txid, vout: memberInput.vout },
        inputValue: memberPrevout.value,
        scriptPubKey: memberPrevout.scriptPubKey,
        successor: { txid: txid, vout: index + 1 },
        successorValue: output.value,
        feeShare: feeShare,
        signatureHashType: signatureHashType
      });
    }

    return {
      valid: true,
      txid: txid,
      wtxid: await witnessTransactionId(transaction),
      marker: marker,
      fee: fee,
      metrics: transactionMetrics(transaction),
      members: members,
      signatureMode: mode
    };
  }

  async function safeValidateCircle(transaction, context) {
    try {
      return await validateCircle(transaction, context);
    } catch (error) {
      if (error.name !== "WitcError") throw error;
      return { valid: false, code: error.code, message: error.message, details: error.details };
    }
  }

  /* ---------- lineage ---------- */

  async function deriveLineageId(genesisOutpoint) {
    return bytesToHex(await sha256(concatBytes(utf8Bytes(LINEAGE_DOMAIN), serializeOutpoint(genesisOutpoint))));
  }

  /* ---------- RFC 8785 serialization for the state snapshot ---------- */

  function canonicalizeJson(value) {
    if (value === null) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") {
      check(Number.isFinite(value), "INVALID_STATE", "Serialized numbers must be finite");
      return JSON.stringify(value);
    }
    if (typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return "[" + value.map(canonicalizeJson).join(",") + "]";
    }
    var keys = Object.keys(value).sort();
    return (
      "{" +
      keys
        .map(function (key) {
          return JSON.stringify(key) + ":" + canonicalizeJson(value[key]);
        })
        .join(",") +
      "}"
    );
  }

  /* ---------- state engine ---------- */

  function emptySnapshot() {
    return { protocol: "witc", version: 1, revision: 0, lineages: [], shards: [], circles: [], edges: [] };
  }

  function compareOrdinal(left, right) {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  function splitStateOutpoint(value) {
    var separator = value.lastIndexOf(":");
    return { txid: value.slice(0, separator), vout: Number(value.slice(separator + 1)) };
  }

  function sortSnapshot(snapshot) {
    return {
      protocol: snapshot.protocol,
      version: snapshot.version,
      revision: snapshot.revision,
      lineages: snapshot.lineages.slice().sort(function (a, b) {
        return compareOrdinal(a.lineageId, b.lineageId);
      }),
      shards: snapshot.shards.slice().sort(function (a, b) {
        return compareOrdinal(a.outpoint, b.outpoint);
      }),
      circles: snapshot.circles
        .map(function (circle) {
          var copy = Object.assign({}, circle);
          copy.members = circle.members.slice().sort(function (a, b) {
            return a.slot - b.slot;
          });
          return copy;
        })
        .sort(function (a, b) {
          return (
            a.blockHeight - b.blockHeight ||
            a.transactionIndex - b.transactionIndex ||
            compareOrdinal(a.txid, b.txid)
          );
        }),
      edges: snapshot.edges.slice().sort(function (a, b) {
        return compareOrdinal(a.toCircle, b.toCircle) || compareOrdinal(a.lineageId, b.lineageId);
      })
    };
  }

  async function hashWitnessState(snapshot) {
    return bytesToHex(await sha256(utf8Bytes(canonicalizeJson(sortSnapshot(snapshot)))));
  }

  function cloneSnapshot(snapshot) {
    return JSON.parse(JSON.stringify(snapshot));
  }

  function WitnessStateEngine(snapshot) {
    this.snapshotValue = sortSnapshot(snapshot || emptySnapshot());
    this.journal = [];
    this.journalTxids = [];
  }

  WitnessStateEngine.prototype.snapshot = function () {
    return cloneSnapshot(sortSnapshot(this.snapshotValue));
  };

  WitnessStateEngine.prototype.stateHash = function () {
    return hashWitnessState(this.snapshotValue);
  };

  WitnessStateEngine.prototype.apply = async function (event) {
    var self = this;
    var lineages = new Map();
    var shards = new Map();
    var activeByOutpoint = new Map();
    this.snapshotValue.lineages.forEach(function (lineage) {
      lineages.set(lineage.lineageId, lineage);
      if (lineage.status === "active" && lineage.currentOutpoint !== null) {
        activeByOutpoint.set(lineage.currentOutpoint, lineage);
      }
    });
    this.snapshotValue.shards.forEach(function (shard) {
      shards.set(shard.outpoint, shard);
    });

    var touchesActive = event.spentOutpoints.some(function (spent) {
      return activeByOutpoint.has(outpointKey(spent));
    });
    if (event.circle === null && !touchesActive) {
      return {
        txid: event.txid,
        kind: "unrelated",
        closedLineages: [],
        createdLineages: [],
        continuedLineages: [],
        stateHash: await this.stateHash()
      };
    }

    var previousSnapshot = this.snapshot();
    var circles = this.snapshotValue.circles.slice();
    var edges = this.snapshotValue.edges.slice();
    var closedLineages = [];
    var createdLineages = [];
    var continuedLineages = [];

    if (event.circle === null) {
      event.spentOutpoints.forEach(function (spent) {
        var key = outpointKey(spent);
        var lineage = activeByOutpoint.get(key);
        if (lineage === undefined) return;
        var shard = shards.get(key);
        shards.set(key, Object.assign({}, shard, { spentByTxid: event.txid, spentHeight: event.blockHeight }));
        lineages.set(
          lineage.lineageId,
          Object.assign({}, lineage, {
            currentOutpoint: null,
            status: "closed",
            lastHeight: event.blockHeight,
            closedByTxid: event.txid
          })
        );
        closedLineages.push(lineage.lineageId);
      });
    } else {
      var circleMembers = [];
      var lineagesInCircle = Object.create(null);
      for (var index = 0; index < event.circle.members.length; index += 1) {
        var member = event.circle.members[index];
        var inputKey = outpointKey(member.input);
        var existing = activeByOutpoint.get(inputKey);
        var lineageId = existing ? existing.lineageId : await deriveLineageId(member.input);
        check(lineagesInCircle[lineageId] === undefined, "DUPLICATE_LINEAGE", "A lineage cannot appear twice in one Circle", {
          lineageId: lineageId
        });
        lineagesInCircle[lineageId] = true;
        if (existing) {
          var previousShard = shards.get(inputKey);
          check(previousShard !== undefined, "INVALID_STATE", "Existing lineage shard is missing");
          check(
            previousShard.valueSats === member.inputValue.toString() &&
              previousShard.scriptPubKey === bytesToHex(member.scriptPubKey),
            "INVALID_STATE",
            "Validated Circle prevout disagrees with the current lineage shard",
            { lineageId: lineageId, outpoint: inputKey }
          );
          shards.set(
            inputKey,
            Object.assign({}, previousShard, { spentByTxid: event.txid, spentHeight: event.blockHeight })
          );
          if (previousShard.createdByCircle.length === 64) {
            edges.push({
              fromCircle: previousShard.createdByCircle,
              toCircle: event.txid,
              lineageId: lineageId,
              viaOutpoint: inputKey
            });
          }
          continuedLineages.push(lineageId);
        } else {
          check(
            !lineages.has(lineageId) && !shards.has(inputKey),
            "INVALID_STATE",
            "Derived fresh lineage or input shard already exists",
            { lineageId: lineageId }
          );
          createdLineages.push(lineageId);
        }
        var outputKeyValue = outpointKey(member.successor);
        check(!shards.has(outputKeyValue), "INVALID_STATE", "Successor shard already exists", {
          outpoint: outputKeyValue
        });
        shards.set(outputKeyValue, {
          outpoint: outputKeyValue,
          lineageId: lineageId,
          scriptPubKey: bytesToHex(member.scriptPubKey),
          valueSats: member.successorValue.toString(),
          createdByCircle: event.txid,
          previousOutpoint: inputKey,
          createdHeight: event.blockHeight,
          spentByTxid: null,
          spentHeight: null
        });
        lineages.set(lineageId, {
          lineageId: lineageId,
          genesisOutpoint: existing ? existing.genesisOutpoint : inputKey,
          currentOutpoint: outputKeyValue,
          status: "active",
          firstHeight: existing ? existing.firstHeight : event.blockHeight,
          lastHeight: event.blockHeight,
          circleCount: (existing ? existing.circleCount : 0) + 1,
          closedByTxid: null
        });
        circleMembers.push({
          slot: member.slot,
          lineageId: lineageId,
          inputOutpoint: inputKey,
          outputOutpoint: outputKeyValue,
          inputValueSats: member.inputValue.toString(),
          outputValueSats: member.successorValue.toString(),
          feeShareSats: member.feeShare.toString(),
          wasExistingLineage: existing !== undefined
        });
      }
      circles.push({
        txid: event.txid,
        wtxid: event.circle.wtxid,
        contextHash: event.circle.marker.contextHash,
        participantCount: event.circle.marker.participantCount,
        feeSats: event.circle.fee.toString(),
        blockHeight: event.blockHeight,
        blockHash: event.blockHash,
        transactionIndex: event.transactionIndex,
        members: circleMembers
      });
    }

    var nextSnapshot = sortSnapshot({
      protocol: "witc",
      version: 1,
      revision: this.snapshotValue.revision + 1,
      lineages: Array.from(lineages.values()),
      shards: Array.from(shards.values()),
      circles: circles,
      edges: edges
    });
    var nextStateHash = await hashWitnessState(nextSnapshot);
    self.journal.push(previousSnapshot);
    self.journalTxids.push(event.txid);
    self.snapshotValue = nextSnapshot;
    return {
      txid: event.txid,
      kind: event.circle !== null ? "circle" : closedLineages.length > 0 ? "ordinary-spend" : "unrelated",
      closedLineages: closedLineages,
      createdLineages: createdLineages,
      continuedLineages: continuedLineages,
      stateHash: nextStateHash
    };
  };

  WitnessStateEngine.prototype.rollbackLast = async function (expectedTxid) {
    check(this.journal.length > 0, "INVALID_STATE", "No transition is available to roll back");
    var txid = this.journalTxids[this.journalTxids.length - 1];
    if (expectedTxid !== undefined) {
      check(txid === expectedTxid, "INVALID_STATE", "Rollback txid does not match the journal tip", {
        expectedTxid: expectedTxid,
        actualTxid: txid
      });
    }
    var previous = this.journal.pop();
    this.journalTxids.pop();
    this.snapshotValue = previous;
    return hashWitnessState(previous);
  };

  global.WITC = {
    MAGIC: MAGIC,
    PROTOCOL_VERSION: PROTOCOL_VERSION,
    CIRCLE_OPCODE: CIRCLE_OPCODE,
    MIN_PARTICIPANTS: MIN_PARTICIPANTS,
    MAX_PARTICIPANTS: MAX_PARTICIPANTS,
    MIN_SUCCESSOR_VALUE_SATS: MIN_SUCCESSOR_VALUE_SATS,
    MARKER_SCRIPT_LENGTH: MARKER_SCRIPT_LENGTH,
    REQUIRED_SEQUENCE: REQUIRED_SEQUENCE,
    NETWORK_NAMES: NETWORK_NAMES,
    NETWORK_IDS: NETWORK_IDS,
    bytesToHex: bytesToHex,
    hexToBytes: hexToBytes,
    utf8Bytes: utf8Bytes,
    concatBytes: concatBytes,
    sha256: sha256,
    doubleSha256: doubleSha256,
    taggedHash: taggedHash,
    outpointKey: outpointKey,
    compareOutpoints: compareOutpoints,
    serializeOutpoint: serializeOutpoint,
    encodeTransaction: encodeTransaction,
    decodeTransaction: decodeTransaction,
    transactionId: transactionId,
    witnessTransactionId: witnessTransactionId,
    transactionMetrics: transactionMetrics,
    isNativeP2tr: isNativeP2tr,
    encodeMarkerPayload: encodeMarkerPayload,
    encodeMarkerScript: encodeMarkerScript,
    decodeMarkerScript: decodeMarkerScript,
    allocateEqualFeeShares: allocateEqualFeeShares,
    estimateCircleVsize: estimateCircleVsize,
    decodeCircleSignature: decodeCircleSignature,
    validateCircle: validateCircle,
    safeValidateCircle: safeValidateCircle,
    deriveLineageId: deriveLineageId,
    canonicalizeJson: canonicalizeJson,
    hashWitnessState: hashWitnessState,
    emptySnapshot: emptySnapshot,
    splitStateOutpoint: splitStateOutpoint,
    WitnessStateEngine: WitnessStateEngine,
    error: WitcError
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
