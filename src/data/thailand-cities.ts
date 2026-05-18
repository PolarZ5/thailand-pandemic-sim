// Approximate city centers and metro populations for synthesizing Thailand's
// population-density grid. Numbers are 2024-ish provincial / metro figures.
// This is a stand-in for real HRSL/WorldPop data — swapped behind the
// DensitySource interface (see density.ts) so the simulation engine never
// changes when real data lands.

export interface CitySeed {
  name: string;
  nameTh: string;
  lat: number;
  lng: number;
  population: number; // metro / urbanized population
  sigmaKm: number;    // gaussian spread (rough urban footprint)
}

export const THAILAND_CITIES: CitySeed[] = [
  // ----- Bangkok metropolitan region -----
  { name: "Bangkok",        nameTh: "กรุงเทพฯ",       lat: 13.7563, lng: 100.5018, population: 10_500_000, sigmaKm: 22 },
  { name: "Nonthaburi",     nameTh: "นนทบุรี",         lat: 13.8622, lng: 100.5144, population:  1_200_000, sigmaKm:  8 },
  { name: "Samut Prakan",   nameTh: "สมุทรปราการ",    lat: 13.5990, lng: 100.5998, population:  1_300_000, sigmaKm:  9 },
  { name: "Pathum Thani",   nameTh: "ปทุมธานี",        lat: 14.0208, lng: 100.5250, population:  1_100_000, sigmaKm:  9 },
  { name: "Nakhon Pathom",  nameTh: "นครปฐม",          lat: 13.8196, lng: 100.0625, population:    920_000, sigmaKm:  9 },
  { name: "Samut Sakhon",   nameTh: "สมุทรสาคร",      lat: 13.5475, lng: 100.2745, population:    580_000, sigmaKm:  7 },

  // ----- North -----
  { name: "Chiang Mai",     nameTh: "เชียงใหม่",       lat: 18.7883, lng:  98.9853, population:  1_100_000, sigmaKm: 12 },
  { name: "Chiang Rai",     nameTh: "เชียงราย",        lat: 19.9105, lng:  99.8406, population:    260_000, sigmaKm:  8 },
  { name: "Lampang",        nameTh: "ลำปาง",           lat: 18.2783, lng:  99.4877, population:    230_000, sigmaKm:  7 },
  { name: "Phitsanulok",    nameTh: "พิษณุโลก",        lat: 16.8211, lng: 100.2659, population:    300_000, sigmaKm:  8 },
  { name: "Nakhon Sawan",   nameTh: "นครสวรรค์",       lat: 15.7030, lng: 100.1366, population:    260_000, sigmaKm:  8 },

  // ----- Northeast (Isan) -----
  { name: "Nakhon Ratchasima", nameTh: "นครราชสีมา",   lat: 14.9799, lng: 102.0978, population:    470_000, sigmaKm: 10 },
  { name: "Khon Kaen",      nameTh: "ขอนแก่น",         lat: 16.4322, lng: 102.8236, population:    400_000, sigmaKm: 10 },
  { name: "Udon Thani",     nameTh: "อุดรธานี",        lat: 17.4138, lng: 102.7872, population:    400_000, sigmaKm: 10 },
  { name: "Ubon Ratchathani",nameTh: "อุบลราชธานี",    lat: 15.2448, lng: 104.8473, population:    370_000, sigmaKm:  9 },
  { name: "Buriram",        nameTh: "บุรีรัมย์",        lat: 14.9930, lng: 103.1029, population:    240_000, sigmaKm:  8 },
  { name: "Surin",          nameTh: "สุรินทร์",        lat: 14.8820, lng: 103.4960, population:    220_000, sigmaKm:  8 },
  { name: "Sakon Nakhon",   nameTh: "สกลนคร",          lat: 17.1664, lng: 104.1486, population:    200_000, sigmaKm:  8 },
  { name: "Roi Et",         nameTh: "ร้อยเอ็ด",        lat: 16.0538, lng: 103.6520, population:    180_000, sigmaKm:  7 },

  // ----- East -----
  { name: "Chonburi",       nameTh: "ชลบุรี",          lat: 13.3611, lng: 100.9847, population:    900_000, sigmaKm: 10 },
  { name: "Pattaya",        nameTh: "พัทยา",           lat: 12.9236, lng: 100.8825, population:    320_000, sigmaKm:  6 },
  { name: "Rayong",         nameTh: "ระยอง",           lat: 12.6810, lng: 101.2789, population:    330_000, sigmaKm:  8 },
  { name: "Chachoengsao",   nameTh: "ฉะเชิงเทรา",      lat: 13.6904, lng: 101.0779, population:    230_000, sigmaKm:  8 },

  // ----- West / Central -----
  { name: "Ayutthaya",      nameTh: "พระนครศรีอยุธยา", lat: 14.3692, lng: 100.5876, population:    400_000, sigmaKm:  8 },
  { name: "Saraburi",       nameTh: "สระบุรี",         lat: 14.5289, lng: 100.9108, population:    240_000, sigmaKm:  7 },
  { name: "Kanchanaburi",   nameTh: "กาญจนบุรี",      lat: 14.0227, lng:  99.5328, population:    220_000, sigmaKm:  9 },
  { name: "Ratchaburi",     nameTh: "ราชบุรี",         lat: 13.5283, lng:  99.8134, population:    230_000, sigmaKm:  8 },

  // ----- South -----
  { name: "Hat Yai",        nameTh: "หาดใหญ่",         lat:  7.0086, lng: 100.4747, population:    400_000, sigmaKm:  8 },
  { name: "Songkhla",       nameTh: "สงขลา",           lat:  7.1898, lng: 100.5954, population:    200_000, sigmaKm:  7 },
  { name: "Phuket",         nameTh: "ภูเก็ต",          lat:  7.8804, lng:  98.3923, population:    420_000, sigmaKm:  8 },
  { name: "Surat Thani",    nameTh: "สุราษฎร์ธานี",    lat:  9.1382, lng:  99.3215, population:    300_000, sigmaKm:  9 },
  { name: "Nakhon Si Thammarat", nameTh: "นครศรีฯ",    lat:  8.4304, lng:  99.9633, population:    310_000, sigmaKm:  9 },
  { name: "Krabi",          nameTh: "กระบี่",          lat:  8.0863, lng:  98.9063, population:    150_000, sigmaKm:  7 },
  { name: "Trang",          nameTh: "ตรัง",            lat:  7.5593, lng:  99.6110, population:    160_000, sigmaKm:  7 },
  { name: "Yala",           nameTh: "ยะลา",            lat:  6.5413, lng: 101.2803, population:    180_000, sigmaKm:  7 },
];

// Approximate ellipsoid: a "rural baseline" density (people per km²)
// inside Thailand, used to fill cells far from any city seed. The country
// bounding box now lives in thailand-mask.ts (derived from the real
// boundary polygon).
export const RURAL_BASELINE_DENSITY = 65; // people per km²
