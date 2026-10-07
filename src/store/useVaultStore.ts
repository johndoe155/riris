import { create } from 'zustand';

export type FinishType = 'base' | 'holo' | 'cracked-ice' | 'gold';
export type SlabType = 'standard' | 'premium' | 'vault';

export interface NFTData {
  image: string | null;
  name: string;
  collection: string;
  tokenId: string;
  contract: string;
}

interface VaultState {
  // Pointer for shader
  pointer: { x: number; y: number };
  setPointer: (x: number, y: number) => void;
  
  // Scroll
  scrollProgress: number;
  setScrollProgress: (p: number) => void;
  
  // Forge state
  finishType: FinishType;
  setFinishType: (f: FinishType) => void;
  slabType: SlabType;
  setSlabType: (s: SlabType) => void;
  
  // NFT
  nftData: NFTData | null;
  setNftData: (d: NFTData | null) => void;
  isFetchingNFT: boolean;
  setIsFetchingNFT: (b: boolean) => void;
  
  // UI
  activeSection: string;
  setActiveSection: (s: string) => void;
  cursorHover: boolean;
  cursorLabel: string;
  setCursor: (hover: boolean, label?: string) => void;
  
  // Cart
  cartCount: number;
  setCartCount: (n: number) => void;
  
  // Audio
  audioEnabled: boolean;
  setAudioEnabled: (b: boolean) => void;

  // Gallery
  activeFilter: string;
  setActiveFilter: (f: string) => void;
}

export const useVaultStore = create<VaultState>((set) => ({
  pointer: { x: 0.5, y: 0.5 },
  setPointer: (x, y) => set({ pointer: { x, y } }),
  
  scrollProgress: 0,
  setScrollProgress: (p) => set({ scrollProgress: p }),
  
  finishType: 'holo',
  setFinishType: (f) => set({ finishType: f }),
  slabType: 'standard',
  setSlabType: (s) => set({ slabType: s }),
  
  nftData: null,
  setNftData: (d) => set({ nftData: d }),
  isFetchingNFT: false,
  setIsFetchingNFT: (b) => set({ isFetchingNFT: b }),
  
  activeSection: 'hero',
  setActiveSection: (s) => set({ activeSection: s }),
  cursorHover: false,
  cursorLabel: '',
  setCursor: (hover, label = '') => set({ cursorHover: hover, cursorLabel: label }),
  
  cartCount: 0,
  setCartCount: (n) => set({ cartCount: n }),
  
  audioEnabled: false,
  setAudioEnabled: (b) => set({ audioEnabled: b }),

  activeFilter: 'all',
  setActiveFilter: (f) => set({ activeFilter: f }),
}));
