import { bytesToHex, hexToBytes, utf8Bytes } from "./bytes.js";
import {
  CIRCLE_OPCODE,
  MARKER_PAYLOAD_LENGTH,
  MARKER_SCRIPT_LENGTH,
  NETWORK_IDS,
  NETWORK_NAMES,
  PROTOCOL_MAGIC,
  PROTOCOL_VERSION,
  type WitnessNetwork,
  type WitnessNetworkId,
} from "./constants.js";
import { invariant } from "./errors.js";

export interface CircleMarker {
  readonly magic: typeof PROTOCOL_MAGIC;
  readonly version: typeof PROTOCOL_VERSION;
  readonly network: WitnessNetwork;
  readonly networkId: WitnessNetworkId;
  readonly opcode: typeof CIRCLE_OPCODE;
  readonly participantCount: number;
  readonly contextHash: string;
}

export function encodeMarkerPayload(input: {
  readonly network: WitnessNetwork;
  readonly participantCount: number;
  readonly contextHash: string;
}): Uint8Array {
  const hash = hexToBytes(input.contextHash, 32);
  invariant(
    input.participantCount >= 2 && input.participantCount <= 16,
    "INPUT_COUNT",
    "Participant count must be between 2 and 16",
  );
  invariant(
    hash.some((byte) => byte !== 0),
    "CONTEXT_HASH_ZERO",
    "Context hash cannot be zero",
  );
  const payload = new Uint8Array(MARKER_PAYLOAD_LENGTH);
  payload.set(utf8Bytes(PROTOCOL_MAGIC), 0);
  payload[4] = PROTOCOL_VERSION;
  payload[5] = NETWORK_IDS[input.network];
  payload[6] = CIRCLE_OPCODE;
  payload[7] = input.participantCount;
  payload.set(hash, 8);
  return payload;
}

export function encodeMarkerScript(input: {
  readonly network: WitnessNetwork;
  readonly participantCount: number;
  readonly contextHash: string;
}): Uint8Array {
  const script = new Uint8Array(MARKER_SCRIPT_LENGTH);
  script[0] = 0x6a;
  script[1] = MARKER_PAYLOAD_LENGTH;
  script.set(encodeMarkerPayload(input), 2);
  return script;
}

export function isWitnessMarkerCandidate(script: Uint8Array): boolean {
  if (script[0] !== 0x6a) return false;
  const direct = script[1] === MARKER_PAYLOAD_LENGTH ? script.slice(2, 6) : undefined;
  const pushData1 =
    script[1] === 0x4c && script[2] === MARKER_PAYLOAD_LENGTH ? script.slice(3, 7) : undefined;
  const encodedMagic = bytesToHex(utf8Bytes(PROTOCOL_MAGIC));
  return bytesToHex(direct ?? pushData1 ?? new Uint8Array()) === encodedMagic;
}

export function decodeMarkerScript(script: Uint8Array): CircleMarker {
  if (
    script.length === MARKER_SCRIPT_LENGTH + 1 &&
    script[0] === 0x6a &&
    script[1] === 0x4c &&
    script[2] === MARKER_PAYLOAD_LENGTH &&
    bytesToHex(script.slice(3, 7)) === bytesToHex(utf8Bytes(PROTOCOL_MAGIC))
  ) {
    invariant(false, "AMBIGUOUS_ENCODING", "Marker must use direct PUSH40, not PUSHDATA1");
  }
  invariant(
    script.length === MARKER_SCRIPT_LENGTH,
    "INVALID_MARKER",
    "Marker script must be exactly 42 bytes",
    { actualLength: script.length },
  );
  invariant(
    script[0] === 0x6a && script[1] === MARKER_PAYLOAD_LENGTH,
    "AMBIGUOUS_ENCODING",
    "Marker must use OP_RETURN followed by direct PUSH40",
  );
  const payload = script.slice(2);
  invariant(
    bytesToHex(payload.slice(0, 4)) === bytesToHex(utf8Bytes(PROTOCOL_MAGIC)),
    "INVALID_MARKER",
    "Marker magic is not WITC",
  );
  invariant(
    payload[4] === PROTOCOL_VERSION,
    "INVALID_VERSION",
    "Unsupported Witness Circles version",
    { version: payload[4] },
  );
  const networkId = payload[5];
  invariant(
    networkId === 0 || networkId === 1 || networkId === 2 || networkId === 3,
    "INVALID_NETWORK",
    "Unknown network identifier",
    { networkId },
  );
  invariant(payload[6] === CIRCLE_OPCODE, "INVALID_OPCODE", "Only CIRCLE is valid in protocol v1", {
    opcode: payload[6],
  });
  const participantCount = payload[7] ?? 0;
  invariant(
    participantCount >= 2 && participantCount <= 16,
    "INPUT_COUNT",
    "Marker participant count must be between 2 and 16",
  );
  const hash = payload.slice(8, 40);
  invariant(
    hash.some((byte) => byte !== 0),
    "CONTEXT_HASH_ZERO",
    "Context hash cannot be zero",
  );
  return {
    magic: PROTOCOL_MAGIC,
    version: PROTOCOL_VERSION,
    network: NETWORK_NAMES[networkId],
    networkId,
    opcode: CIRCLE_OPCODE,
    participantCount,
    contextHash: bytesToHex(hash),
  };
}
