export interface GalleryCard {
  id: string;
  name: string;
  collection: string;
  style: 'base' | 'holo' | 'cracked-ice' | 'gold';
  type: '1/1' | 'batch';
  image: string;
  quote?: string;
  commissioner?: string;
  price: string;
  year: string;
}

// Real slab photography from Nemo's X - 42 images
const realImages = [
  'Gf7URRUWgAAsj-8.jpg',
  'GfQ6ywDXcAAE_lj.jpg',
  'GfbqtJcWgAAy3PD.jpg',
  'Gfq0PT6W8AEZ1qU.jpg',
  'GgEREahWgAAT_LW.jpg',
  'GgVU-INXsAA8Qe_.jpg',
  'GgYa2zVXUAMyfBl.jpg',
  'GgYa3MWXUAApB43.jpg',
  'GiEdRNdWgAAOrVO.jpg',
  'Gjw0CRRXoAMjU8i.jpg',
  'Gk0BGCMX0AASAN0.jpg',
  'GkelAwuWYAAHrmn.jpg',
  'Gm5ZrNoXUAAovkY.jpg',
  'Gm69nJTakAAGkny.jpg',
  'Gm6BzB0bYAEDdBm.jpg',
  'Gm6BzBtbYAEKZBi.jpg',
  'GmWxVMYa8AADD68.jpg',
  'Go6luCPWEAA4F2A.jpg',
  'GoSlgV-bcAAmHVs.jpg',
  'GoSlgZDXEAAgcbU.jpg',
  'Gpo4KagWkAEXZg7.jpg',
  'Gpo4KaiWYAA7sLK.jpg',
  'Gpo4KaoWUAAhtXw.jpg',
  'Gpo4KaxWAAAPcEH.jpg',
  'Gq3-xReXIAAx4hF.jpg',
  'Gq6zugTXQAUJ_dr.jpg',
  'Gr4giVUXAAAX-XC.jpg',
  'Gs3PsPobwAAz140.jpg',
  'Gs3PsPpbwAAZjny.jpg',
  'Gs3PsPqbgAEIXRd.jpg',
  'Gs3PsPqbsAEU4rw.jpg',
  'GtB6XfiaYAA4th1.jpg',
  'GtBYXrvW8AArtFb.jpg',
  'GtlaXogakAAU4Va.jpg',
  'GvM11N9WYAAbVmJ.jpg',
  'GzyDtcnXIAEPHl6.jpg',
  'GzyDteiXAAEcZD-.jpg',
  'HHWpbYcagAElClx.jpg',
  'HRZKCAZWIAMz40H.jpg',
  'HRZKCAZXIAE1Y3Q.jpg',
  'HRsyRcxWgAAVyH5.jpg',
  'HSBx3_NWAAo5_wm.jpg',
];

export const galleryData: GalleryCard[] = [
  {
    id: '001',
    name: 'BAYC #2087 - Golden Fur',
    collection: 'Bored Ape Yacht Club',
    style: 'gold',
    type: '1/1',
    image: `/gallery/${realImages[0]}`,
    quote: 'Holy. This is heavier than I expected. Museum quality.',
    commissioner: '@ape2087',
    price: '$40',
    year: '2024'
  },
  {
    id: '002',
    name: 'Azuki #9605 - Spirit',
    collection: 'Azuki',
    style: 'holo',
    type: '1/1',
    image: `/gallery/${realImages[1]}`,
    quote: 'The holo hits different IRL. Photos don\'t do it justice.',
    commissioner: '@zenft',
    price: '$25',
    year: '2024'
  },
  {
    id: '003',
    name: 'Doodle #6914',
    collection: 'Doodles',
    style: 'cracked-ice',
    type: '1/1',
    image: `/gallery/${realImages[2]}`,
    price: '$30',
    year: '2023'
  },
  {
    id: '004',
    name: 'CloneX #4594 - Murakami',
    collection: 'CloneX',
    style: 'holo',
    type: 'batch',
    image: `/gallery/${realImages[3]}`,
    quote: 'Batch of 50 for our holders. Flawless.',
    commissioner: 'CloneX DAO',
    price: '$25',
    year: '2024'
  },
  {
    id: '005',
    name: 'Pudgy #3448',
    collection: 'Pudgy Penguins',
    style: 'base',
    type: '1/1',
    image: `/gallery/${realImages[4]}`,
    price: '$20',
    year: '2023'
  },
  {
    id: '006',
    name: 'Moonbird #2642 - Legendary',
    collection: 'Moonbirds',
    style: 'gold',
    type: '1/1',
    image: `/gallery/${realImages[5]}`,
    price: '$40',
    year: '2024'
  },
  {
    id: '007',
    name: 'Ape Reunion Drop',
    collection: 'Ape Reunion',
    style: 'cracked-ice',
    type: 'batch',
    image: `/gallery/${realImages[6]}`,
    quote: '200 slabs for our IRL meetup. Nemo delivered in 9 days.',
    commissioner: 'Ape Reunion',
    price: '$30',
    year: '2024'
  },
  {
    id: '008',
    name: 'Milady #1523',
    collection: 'Milady Maker',
    style: 'holo',
    type: '1/1',
    image: `/gallery/${realImages[7]}`,
    price: '$25',
    year: '2024'
  },
  {
    id: '009',
    name: 'DeGods #1234',
    collection: 'DeGods',
    style: 'cracked-ice',
    type: '1/1',
    image: `/gallery/${realImages[8]}`,
    price: '$30',
    year: '2023'
  },
  {
    id: '010',
    name: 'Captains #888',
    collection: 'Memeland',
    style: 'gold',
    type: 'batch',
    image: `/gallery/${realImages[9]}`,
    price: '$40',
    year: '2024'
  },
  {
    id: '011',
    name: 'Kanpai Panda #420',
    collection: 'Kanpai Pandas',
    style: 'base',
    type: '1/1',
    image: `/gallery/${realImages[10]}`,
    price: '$20',
    year: '2023'
  },
  {
    id: '012',
    name: 'Chimpers #1337',
    collection: 'Chimpers',
    style: 'holo',
    type: '1/1',
    image: `/gallery/${realImages[11]}`,
    quote: 'This is now my most prized possession.',
    commissioner: '@chimpermaxi',
    price: '$25',
    year: '2024'
  },
  // Additional real slabs
  {
    id: '013',
    name: 'Kanpai #881',
    collection: 'Kanpai Pandas',
    style: 'cracked-ice',
    type: '1/1',
    image: `/gallery/${realImages[12]}`,
    price: '$30',
    year: '2024'
  },
  {
    id: '014',
    name: 'Ape #8812 - Trippy',
    collection: 'Bored Ape Yacht Club',
    style: 'holo',
    type: '1/1',
    image: `/gallery/${realImages[13]}`,
    price: '$25',
    year: '2024'
  },
  {
    id: '015',
    name: 'Doodle #7721 - Rainbow',
    collection: 'Doodles',
    style: 'gold',
    type: 'batch',
    image: `/gallery/${realImages[14]}`,
    price: '$40',
    year: '2024'
  },
  {
    id: '016',
    name: 'Pudgy #1928 - Ice',
    collection: 'Pudgy Penguins',
    style: 'cracked-ice',
    type: '1/1',
    image: `/gallery/${realImages[15]}`,
    price: '$30',
    year: '2024'
  },
  {
    id: '017',
    name: 'CloneX #8821',
    collection: 'CloneX',
    style: 'base',
    type: '1/1',
    image: `/gallery/${realImages[16]}`,
    price: '$20',
    year: '2023'
  },
  {
    id: '018',
    name: 'Azuki #4412',
    collection: 'Azuki',
    style: 'gold',
    type: '1/1',
    image: `/gallery/${realImages[17]}`,
    price: '$40',
    year: '2024'
  },
  {
    id: '019',
    name: 'Moonbird #1021',
    collection: 'Moonbirds',
    style: 'holo',
    type: 'batch',
    image: `/gallery/${realImages[18]}`,
    price: '$25',
    year: '2024'
  },
  {
    id: '020',
    name: 'DeGods #882',
    collection: 'DeGods',
    style: 'base',
    type: '1/1',
    image: `/gallery/${realImages[19]}`,
    price: '$20',
    year: '2023'
  },
  // More real slabs for physics pit
  ...realImages.slice(20).map((img, i) => ({
    id: `${(21 + i).toString().padStart(3, '0')}`,
    name: `Vault Slab #${21 + i}`,
    collection: ['Bored Ape Yacht Club', 'Azuki', 'Doodles', 'CloneX', 'Pudgy Penguins', 'Moonbirds', 'Chimpers'][i % 7],
    style: (['base', 'holo', 'cracked-ice', 'gold'] as const)[i % 4],
    type: (i % 3 === 0 ? 'batch' : '1/1') as '1/1' | 'batch',
    image: `/gallery/${img}`,
    price: `$${[20,25,30,40][i % 4]}`,
    year: i % 2 === 0 ? '2024' : '2023',
  })),
];

export const collections = ['all', 'Bored Ape Yacht Club', 'Azuki', 'Doodles', 'CloneX', 'Pudgy Penguins', 'Moonbirds', 'Chimpers', 'Kanpai Pandas'];
export const styles = ['all', 'base', 'holo', 'cracked-ice', 'gold'];
