export const ERROR_CODES = [
  "AMBIGUOUS_ENCODING",
  "CONTEXT_HASH_ZERO",
  "DUPLICATE_INPUT",
  "DUPLICATE_LINEAGE",
  "DUPLICATE_SCRIPT",
  "FEE_CAP_EXCEEDED",
  "FEE_NEGATIVE",
  "INPUT_COUNT",
  "INPUT_ORDER",
  "INPUT_PREVOUT_MISSING",
  "INPUT_UNCONFIRMED",
  "INTEGER_RANGE",
  "INVALID_CONTEXT_MANIFEST",
  "INVALID_HEX",
  "INVALID_MARKER",
  "INVALID_NETWORK",
  "INVALID_OPCODE",
  "INVALID_OUTPOINT",
  "INVALID_P2TR",
  "INVALID_SIGNATURE",
  "INVALID_STATE",
  "INVALID_TRANSACTION",
  "INVALID_VERSION",
  "LOCK_TIME",
  "MARKER_VALUE",
  "NON_CANONICAL_JSON",
  "OUTPUT_COUNT",
  "OUTPUT_MAPPING",
  "PREVOUT_HEIGHT",
  "SEQUENCE",
  "SUCCESSOR_DUST",
  "SIGHASH_UNSAFE",
  "TRANSACTION_VERSION",
  "TRAILING_DATA",
  "UNSUPPORTED_OPERATION",
  "WITNESS_SHAPE",
] as const;

export type WitnessErrorCode = (typeof ERROR_CODES)[number];

export class WitnessProtocolError extends Error {
  readonly code: WitnessErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: WitnessErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "WitnessProtocolError";
    this.code = code;
    this.details = details;
  }
}

export function invariant(
  condition: unknown,
  code: WitnessErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): asserts condition {
  if (!condition) {
    throw new WitnessProtocolError(code, message, details);
  }
}

export function errorResult(error: unknown): {
  readonly valid: false;
  readonly code: WitnessErrorCode;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
} {
  if (error instanceof WitnessProtocolError) {
    return { valid: false, code: error.code, message: error.message, details: error.details };
  }
  throw error;
}
