export function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

// Mock NFT fetch using Alchemy demo key
export async function fetchNFT(contract: string, tokenId: string) {
  // Try Alchemy demo endpoint first
  try {
    const url = `https://eth-mainnet.g.alchemy.com/nft/v3/demo/getNFTMetadata?contractAddress=${contract}&tokenId=${tokenId}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const image = data?.image?.cachedUrl || data?.image?.originalUrl || data?.raw?.metadata?.image || null;
      // Convert ipfs to gateway
      let img = image;
      if (img?.startsWith('ipfs://')) {
        img = img.replace('ipfs://', 'https://ipfs.io/ipfs/');
      }
      return {
        image: img,
        name: data?.name || data?.raw?.metadata?.name || `#${tokenId}`,
        collection: data?.contract?.name || data?.contract?.openSeaMetadata?.collectionName || 'Unknown Collection',
        tokenId,
        contract,
      };
    }
  } catch (e) {
    console.warn('Alchemy fetch failed', e);
  }

  // Fallback to mock
  return {
    image: `https://picsum.photos/seed/${contract}${tokenId}/800/800`,
    name: `Token #${tokenId}`,
    collection: contract.slice(0, 6) + '...' + contract.slice(-4),
    tokenId,
    contract,
  };
}

// Popular test NFTs for demo
export const DEMO_NFTS = [
  { contract: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', tokenId: '1', label: 'BAYC #1' },
  { contract: '0x60E4d786628Fea6478F785A6d7e704777c86a7c6', tokenId: '1', label: 'MAYC #1' },
  { contract: '0x23581767a106ae21c074b2276D25e5C3e136a68', tokenId: '1', label: 'Moonbird #1' },
  { contract: '0x49cF6f5d44E70224e2E23fDcdd2C053F30aDA28B', tokenId: '1', label: 'CloneX #1' },
];
