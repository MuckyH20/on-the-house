import { EventEmitter } from 'node:events';
import { PublicKey } from '@solana/web3.js';
import { fetchAllCampaigns, fetchCampaign, type CampaignView } from '@oth/shared/program';
import type { Chain } from './solana';

/**
 * In-memory cache of on-chain Campaign accounts plus a change bus. Anything that changes what a dashboard shows
 * (new event, fill, hedger/settler state) calls `changed(address)`, which SSE streams listen to.
 */
export class Registry extends EventEmitter {
  private readonly campaigns = new Map<string, CampaignView>();

  constructor(private readonly chain: Chain) {
    super();
    this.setMaxListeners(500);
  }

  async loadAll(): Promise<number> {
    for (const c of await fetchAllCampaigns(this.chain.program)) this.campaigns.set(c.address, c);
    return this.campaigns.size;
  }

  /** Re-read one campaign from chain (confirmed) and notify listeners. */
  async refresh(address: string): Promise<CampaignView | null> {
    const view = await fetchCampaign(this.chain.program, new PublicKey(address));
    if (view) {
      this.campaigns.set(address, view);
      this.changed(address);
    }
    return view;
  }

  get(address: string): CampaignView | undefined {
    return this.campaigns.get(address);
  }

  async getOrFetch(address: string): Promise<CampaignView | null> {
    return this.campaigns.get(address) ?? (isPubkey(address) ? this.refresh(address) : null);
  }

  all(): CampaignView[] {
    return [...this.campaigns.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  changed(address: string): void {
    this.emit('change', address);
  }
}

export function isPubkey(s: string): boolean {
  try {
    new PublicKey(s);
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
  } catch {
    return false;
  }
}
