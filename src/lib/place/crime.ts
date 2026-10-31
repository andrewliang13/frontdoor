import "server-only";

import type { Located } from "./geocode";
import { asArray, asNumber, asRecord, asString, fetchJson } from "./http";
import { covered, crimeScore, uncovered } from "./score";
import type { Factor } from "./types";

const CDE = "https://cde.ucr.cjis.gov/LATEST";

type Agency = {
  ori: string;
  name: string;
  type: string;
};

function norm(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countyKey(name: string): string {
  return norm(name)
    .replace(/\bCOUNTY\b/g, "")
    .replace(/\bPARISH\b/g, "")
    .replace(/\bCENSUS AREA\b/g, "")
    .replace(/\bCITY AND BOROUGH\b/g, "")
    .replace(/\bBOROUGH\b/g, "")
    .replace(/\bMUNICIPALITY\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function agenciesIn(payload: unknown, county: string, state: string): Agency[] {
  const directory = asRecord(payload);
  if (!directory) return [];
  const rows: unknown[] = [];
  if (state === "DC") {
    for (const value of Object.values(directory)) rows.push(...asArray(value));
  } else {
    const want = countyKey(county);
    for (const [key, value] of Object.entries(directory)) {
      if (countyKey(key) === want) rows.push(...asArray(value));
    }
  }
  const agencies: Agency[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    const ori = asString(record?.ori);
    const name = asString(record?.agency_name);
    const type = asString(record?.agency_type_name) ?? "";
    if (!ori || !name) continue;
    agencies.push({ ori, name, type });
  }
  return agencies;
}

function rankAgency(agency: Agency, placeName: string): number {
  const name = norm(agency.name);
  const place = norm(placeName);
  const local = /POLICE|SHERIFF/.test(name);
  const stateForce = /HIGHWAY PATROL|STATE POLICE/.test(name);
  if (!local || stateForce) return 0;
  let score = 0;
  if (/CITY/i.test(agency.type) && place && name.includes(place)) score += 50;
  if (/COUNTY|PARISH/i.test(agency.type)) score += 30;
  if (/POLICE DEPARTMENT/.test(name)) score += 10;
  if (/UNIVERSITY|COLLEGE/i.test(agency.type)) score -= 20;
  return score;
}

function chooseAgency(agencies: Agency[], placeName: string): Agency | null {
  const ranked = agencies
    .map((agency) => ({ agency, score: rankAgency(agency, placeName) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.agency.name.length - b.agency.name.length);
  return ranked[0]?.agency ?? null;
}

function monthsByYear(series: unknown): Map<number, Map<string, number>> {
  const record = asRecord(series) ?? {};
  const byYear = new Map<number, Map<string, number>>();
  for (const [key, value] of Object.entries(record)) {
    const match = /^(\d{2})-(\d{4})$/.exec(key);
    const amount = asNumber(value);
    if (!match || amount == null) continue;
    const year = Number(match[2]);
    const months = byYear.get(year) ?? new Map<string, number>();
    months.set(match[1], amount);
    byYear.set(year, months);
  }
  return byYear;
}

function rateForYear(series: unknown, year: number): number | null {
  const months = monthsByYear(series).get(year);
  if (!months || months.size < 12) return null;
  let total = 0;
  for (const value of months.values()) total += value;
  return total;
}

function latestYear(series: unknown): number | null {
  const years = [...monthsByYear(series).keys()].sort((a, b) => b - a);
  for (const year of years) {
    if (rateForYear(series, year) != null) return year;
  }
  return null;
}

function stateNameFrom(directory: unknown): string {
  const record = asRecord(directory);
  if (!record) return "";
  for (const value of Object.values(record)) {
    const agency = asRecord(asArray(value)[0]);
    const name = asString(agency?.state_name);
    if (name) return name;
  }
  return "";
}

function offenseSeries(rates: Record<string, unknown>, agencyName: string, stateName: string): unknown {
  const entries = Object.entries(rates).filter(
    ([key]) => /offenses/i.test(key) && !/clearance/i.test(key),
  );
  const named = entries.find(([key]) => key.toLowerCase().includes(agencyName.toLowerCase()));
  if (named) return named[1];
  const stateLabel = stateName.toLowerCase();
  const local = entries.find(([key]) => {
    const label = key.toLowerCase();
    if (label.startsWith("united states")) return false;
    if (stateLabel && label.startsWith(stateLabel)) return false;
    return true;
  });
  return local?.[1] ?? null;
}

export async function crimeFactor(located: Located): Promise<Factor> {
  const state = located.pin.state;
  const county = located.pin.county;
  if (!state || !county) {
    return uncovered("crime", "Census did not return a county for this address.");
  }
  try {
    const directory = await fetchJson(`${CDE}/agency/byStateAbbr/${encodeURIComponent(state)}`, undefined, 5000);
    const agencies = agenciesIn(directory, county, state);
    const agency = chooseAgency(agencies, located.placeName);
    if (!agency) {
      return uncovered(
        "crime",
        "FBI Crime Data Explorer has no reporting agency for this county.",
      );
    }
    const offenseUrl = `${CDE}/summarized/agency/${encodeURIComponent(agency.ori)}/V?from=01-2022&to=12-2026&type=counts`;
    const payload = asRecord(await fetchJson(offenseUrl, undefined, 5000));
    const rates = asRecord(asRecord(payload?.offenses)?.rates);
    if (!rates) {
      return uncovered("crime", "The Crime Data Explorer did not return a violent-crime rate.");
    }
    const stateName = stateNameFrom(directory);
    const agencySeries = offenseSeries(rates, agency.name, stateName);
    const nationalSeries = Object.entries(rates).find(
      ([key]) => /^united states offenses$/i.test(key),
    )?.[1];
    const year = agencySeries ? latestYear(agencySeries) : null;
    const agencyRate = year != null ? rateForYear(agencySeries, year) : null;
    const nationalRate = year != null ? rateForYear(nationalSeries, year) : null;
    if (year == null || agencyRate == null || nationalRate == null) {
      return uncovered(
        "crime",
        `${agency.name} has no full year of violent-crime rates in the Crime Data Explorer.`,
      );
    }
    const agencyRounded = Math.round(agencyRate);
    const nationalRounded = Math.round(nationalRate);
    return covered({
      id: "crime",
      score: crimeScore(agencyRate, nationalRate),
      status: "measured",
      year,
      detail: `${agency.name}, ${year}, reported violent-crime rate ${agencyRounded} per 100000. National rate ${nationalRounded} per 100000. This is the jurisdiction's reported rate, not incidents at this door.`,
    });
  } catch {
    return uncovered("crime", "The Crime Data Explorer did not return a rate.");
  }
}
