export const PROTOCOL_MAGIC = "WITC" as const;
export const PROTOCOL_VERSION = 1 as const;
export const CIRCLE_OPCODE = 1 as const;
export const MARKER_PAYLOAD_LENGTH = 40 as const;
export const MARKER_SCRIPT_LENGTH = 42 as const;
export const MIN_PARTICIPANTS = 2 as const;
export const MAX_PARTICIPANTS = 16 as const;
export const MIN_SUCCESSOR_VALUE_SATS = 1_000n;
export const MAX_MONEY_SATS = 2_100_000_000_000_000n;
export const REQUIRED_TRANSACTION_VERSION = 2 as const;
export const REQUIRED_LOCK_TIME = 0 as const;
export const REQUIRED_SEQUENCE = 0xffff_fffd;
export const SIGHASH_DEFAULT = 0x00 as const;
export const SIGHASH_ALL = 0x01 as const;
export const LINEAGE_DOMAIN = "WITC/lineage/v1" as const;

export const NETWORK_IDS = {
  mainnet: 0,
  testnet3: 1,
  signet: 2,
  regtest: 3,
} as const;

export type WitnessNetwork = keyof typeof NETWORK_IDS;
export type WitnessNetworkId = (typeof NETWORK_IDS)[WitnessNetwork];
export type WitnessLaunchNetwork = "signet" | "regtest";

export function isWitnessLaunchNetwork(network: WitnessNetwork): network is WitnessLaunchNetwork {
  return network === "signet" || network === "regtest";
}

export const NETWORK_NAMES = {
  0: "mainnet",
  1: "testnet3",
  2: "signet",
  3: "regtest",
} as const satisfies Record<WitnessNetworkId, WitnessNetwork>;
