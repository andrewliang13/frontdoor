export type FactorId =
  | "commute"
  | "schools"
  | "parks"
  | "transit"
  | "highway"
  | "noise"
  | "night"
  | "daylight"
  | "flood"
  | "crime";

export type FactorStatus = "measured" | "modeled" | "not_covered";

export type Factor = {
  id: FactorId;
  label: string;
  /** 0–100 when the factor is covered. Null when status is not_covered. */
  score: number | null;
  status: FactorStatus;
  detail: string;
  source: string;
  year?: number;
};

export type PlacePin = {
  lat: number;
  lon: number;
  label: string;
  county: string;
  state: string;
};

export type Photo = {
  url: string;
  source: string;
  year?: number;
};

export type PlaceResult = {
  pin: PlacePin;
  factors: Factor[];
  /** Weighted average of covered factors. Null when none are covered. */
  overall: number | null;
  brief: string;
  photos: Photo[];
};

export type PlaceMode = "drive" | "bike" | "walk";

export type Weights = Partial<Record<FactorId, number>>;

export type PlaceRequest = {
  address: string;
  office?: string;
  mode: PlaceMode;
  weights: Weights;
  note?: string;
};

export type CompareResult = {
  first: PlaceResult;
  second: PlaceResult;
};
