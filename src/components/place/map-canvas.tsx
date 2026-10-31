"use client";

import { useEffect, useRef } from "react";
import {
  AttributionControl,
  GeoJSONSource,
  Map as MlMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Turbopack rewrites the package worker URL, so the file is served from public.
setWorkerUrl("/maplibre-gl-worker.mjs");

export type MapPin = {
  id: string;
  lat: number;
  lon: number;
  label: string;
  active: boolean;
};

export type MapPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type MapCanvasProps = {
  pins: MapPin[];
  features: GeoJSON.Feature[];
  padding: MapPadding;
  flyToken: number;
  onSelect: (id: string) => void;
};

const STYLE = "https://tiles.openfreemap.org/styles/liberty";

export default function MapCanvas({ pins, features, padding, flyToken, onSelect }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const flownToken = useRef(-1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = new MlMap({
      container,
      style: STYLE,
      center: [-98.35, 39.5],
      zoom: 3.35,
      attributionControl: false,
      fadeDuration: 0,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new AttributionControl({ compact: false }), "bottom-left");
    map.on("load", () => map.resize());
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    mapRef.current = map;

    return () => {
      observer.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = pins.map((pin) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = pin.active ? "pin is-active" : "pin";
      element.setAttribute("aria-label", pin.label || "Scored address");
      element.title = pin.label;
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectRef.current(pin.id);
      });
      return new Marker({ element, anchor: "center" })
        .setLngLat([pin.lon, pin.lat])
        .addTo(map);
    });

    const active = pins.find((pin) => pin.active) ?? pins[0];
    if (!active) {
      map.setPadding(padding);
      return;
    }

    const arrive = flownToken.current !== flyToken;
    flownToken.current = flyToken;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const camera = {
      center: [active.lon, active.lat] as [number, number],
      zoom: arrive ? 16 : Math.max(map.getZoom(), 14),
      padding,
    };
    if (reduced || !arrive) {
      if (reduced) map.jumpTo(camera);
      else map.easeTo({ ...camera, duration: 220, essential: true });
      return;
    }
    map.flyTo({ ...camera, speed: 1.15, curve: 1.15, essential: true });
  }, [pins, padding, flyToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const draw = () => paintGeometry(map, features);
    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
  }, [features]);

  return <div ref={containerRef} className="map" role="region" aria-label="Map" />;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function paintGeometry(map: MlMap, features: GeoJSON.Feature[]) {
  if (!map.isStyleLoaded()) return;
  if (!map.getSource("fd-fill")) {
    map.addSource("fd-fill", { type: "geojson", data: EMPTY });
    map.addSource("fd-line", { type: "geojson", data: EMPTY });
    map.addSource("fd-circle", { type: "geojson", data: EMPTY });
    const color: ExpressionSpecification = [
      "match",
      ["get", "id"],
      "schools",
      "#155a86",
      "parks",
      "#1f6b45",
      "transit",
      "#7a4e2d",
      "highway",
      "#6b3a2a",
      "daylight",
      "#1a1916",
      "#155a86",
    ];
    map.addLayer({
      id: "fd-fill",
      type: "fill",
      source: "fd-fill",
      paint: { "fill-color": color, "fill-opacity": 0.28 },
    });
    map.addLayer({
      id: "fd-line",
      type: "line",
      source: "fd-line",
      paint: { "line-color": color, "line-width": 2 },
    });
    map.addLayer({
      id: "fd-circle",
      type: "circle",
      source: "fd-circle",
      paint: {
        "circle-color": color,
        "circle-radius": 6,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#f4faf6",
      },
    });
  }
  const fill: GeoJSON.Feature[] = [];
  const line: GeoJSON.Feature[] = [];
  const circle: GeoJSON.Feature[] = [];
  for (const feature of features) {
    const kind = feature.geometry.type;
    const id = String(feature.properties?.id ?? "");
    if (kind === "Point" || kind === "MultiPoint") circle.push(feature);
    else if (kind === "LineString" || kind === "MultiLineString") line.push(feature);
    else if (id === "daylight" || id === "highway") line.push(feature);
    else {
      fill.push(feature);
      line.push(feature);
    }
  }
  (map.getSource("fd-fill") as GeoJSONSource).setData({ type: "FeatureCollection", features: fill });
  (map.getSource("fd-line") as GeoJSONSource).setData({ type: "FeatureCollection", features: line });
  (map.getSource("fd-circle") as GeoJSONSource).setData({ type: "FeatureCollection", features: circle });
}
