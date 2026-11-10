import { PublicKey } from '@solana/web3.js';
import { SEEDS } from './constants';

const utf8 = (s: string) => new TextEncoder().encode(s);

/** u64 little-endian, without relying on Node's Buffer (this module also runs in the browser). */
export function u64Le(value: bigint | number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true);
  return out;
}

export function findConfigPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([utf8(SEEDS.config)], programId);
}

export function findCampaignPda(programId: PublicKey, merchant: PublicKey, campaignId: bigint | number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([utf8(SEEDS.campaign), merchant.toBytes(), u64Le(campaignId)], programId);
}

export function findClaimMintPda(programId: PublicKey, campaign: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([utf8(SEEDS.claimMint), campaign.toBytes()], programId);
}

export function findRefundVaultPda(programId: PublicKey, campaign: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([utf8(SEEDS.refundVault), campaign.toBytes()], programId);
}
