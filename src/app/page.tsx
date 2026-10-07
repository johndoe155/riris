'use client';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useVaultStore, FinishType } from '@/store/useVaultStore';
import { fetchNFT, DEMO_NFTS } from '@/lib/utils';
import { galleryData } from '@/data/gallery';
import { ForgePreviewCanvas } from '@/components/canvas/ForgePreview';

// GalleryPitPhysics calls ScrollTrigger.refresh(); in the main project the
// plugin is registered in page.tsx / Providers.tsx, so it is registered here too.
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

// Same loading pattern as the main project (Forge.tsx / Gallery.tsx).
const ForgePreview = dynamic(() => Promise.resolve(ForgePreviewCanvas), { ssr: false });
const GalleryPitPhysics = dynamic(() => import('@/components/canvas/GalleryPitPhysics'), { ssr: false });

const FINISHES: FinishType[] = ['base', 'holo', 'cracked-ice', 'gold'];
type PitFilter = 'all' | FinishType;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 font-mono text-[11px] border transition-colors ${
        active
          ? 'bg-[#F5F3EF] text-black border-[#F5F3EF]'
          : 'bg-[#111] text-[#F5F3EF]/60 border-[#2A2A2A] hover:text-[#F5F3EF]'
      }`}
    >
      {children}
    </button>
  );
}

export default function Lab() {
  const finishType = useVaultStore((s) => s.finishType);
  const setFinishType = useVaultStore((s) => s.setFinishType);
  const nftData = useVaultStore((s) => s.nftData);
  const setNftData = useVaultStore((s) => s.setNftData);
  const [busy, setBusy] = useState(false);
  const [pitFilter, setPitFilter] = useState<PitFilter>('all');

  // Same pointer listener as the main project's Providers.tsx: writes the
  // normalized pointer into the store; the shaders read it each frame.
  useEffect(() => {
    const onMove = (e: PointerEvent) =>
      useVaultStore.getState().setPointer(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const pitCards = useMemo(
    () => (pitFilter === 'all' ? galleryData : galleryData.filter((c) => c.style === pitFilter)),
    [pitFilter]
  );

  async function loadDemo(contract: string, tokenId: string) {
    setBusy(true);
    try {
      setNftData(await fetchNFT(contract, tokenId));
    } finally {
      setBusy(false);
    }
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNftData({
      image: URL.createObjectURL(file),
      name: file.name,
      collection: 'Custom Upload',
      tokenId: 'CUSTOM',
      contract: '0xCUSTOM',
    });
  }

  return (
    <main>
      <header className="sticky top-0 z-20 border-b border-[#1A1A1A] bg-[#080808]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-8 gap-y-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-[#F5F3EF]/50">Finish</span>
            {FINISHES.map((f) => (
              <Chip key={f} active={finishType === f} onClick={() => setFinishType(f)}>{f}</Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-[#F5F3EF]/50">Forge image</span>
            {DEMO_NFTS.map((n) => (
              <Chip key={n.label} active={nftData?.contract === n.contract} onClick={() => loadDemo(n.contract, n.tokenId)}>
                {n.label}
              </Chip>
            ))}
            <label className="cursor-pointer border border-[#2A2A2A] bg-[#111] px-2.5 py-1 font-mono text-[11px] text-[#F5F3EF]/60 hover:text-[#F5F3EF]">
              Upload
              <input type="file" accept="image/*" onChange={onUpload} className="sr-only" />
            </label>
            <Chip active={false} onClick={() => setNftData(null)}>Reset</Chip>
            <span className="font-mono text-[11px] text-[#FF4D00]">
              {busy ? 'Loading…' : nftData ? `${nftData.collection} · ${nftData.name}` : 'Placeholder image'}
            </span>
          </div>
        </div>
      </header>

      <section id="forge" className="mx-auto max-w-[1400px] scroll-mt-16 px-6 py-10">
        <h2 className="mb-4 font-mono text-sm text-[#F5F3EF]/70">Forge preview</h2>
        <div className="mx-auto aspect-[3/4] max-w-md bg-[#050505]">
          <ForgePreview />
        </div>
      </section>

      <section id="pit" className="mx-auto max-w-[1400px] px-6 pb-16">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="font-mono text-sm text-[#F5F3EF]/70">Gallery pit ({pitCards.length})</h2>
          {(['all', ...FINISHES] as PitFilter[]).map((f) => (
            <Chip key={f} active={pitFilter === f} onClick={() => setPitFilter(f)}>{f}</Chip>
          ))}
        </div>
        <GalleryPitPhysics cards={pitCards} />
      </section>
    </main>
  );
}
