import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

const GLOBE_RADIUS = 2;
const FILL_RADIUS = GLOBE_RADIUS * 1.005;
const PIN_RADIUS = GLOBE_RADIUS * 1.006;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// --- Projections ---
function latLngToSphere(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

const FLAT_SCALE_X = 2.0;
const FLAT_SCALE_Y = 2.0;

function morphedXYZ(lat: number, lng: number, radius: number, t: number): [number, number, number] {
  const et = easeInOutCubic(t);
  const sp = latLngToSphere(lat, lng, radius);
  const fpX = (lng / 180) * radius * FLAT_SCALE_X;
  const fpY = (lat / 90) * radius * FLAT_SCALE_Y * 0.5;
  const zFade = Math.pow(1 - et, 2);
  return [
    sp[0] + (fpX - sp[0]) * et,
    sp[1] + (fpY - sp[1]) * et,
    sp[2] * zFade,
  ];
}

// --- Pinned countries (hoverable, with map pins) ---
type Continent = 'na' | 'sa' | 'eu' | 'af' | 'as';

interface PinnedCountry {
  name: string;
  lat: number;
  lng: number;
  locked?: boolean;
  continent: Continent;
}

const PINNED_COUNTRIES: PinnedCountry[] = [
  // North America
  { name: 'USA', lat: 39.8, lng: -98.6, continent: 'na' },
  { name: 'Canada', lat: 56.1, lng: -106.3, continent: 'na' },
  { name: 'Mexico', lat: 23.6, lng: -102.6, continent: 'na' },
  { name: 'Costa Rica', lat: 9.7, lng: -84.0, continent: 'na' },
  { name: 'Cuba', lat: 21.5, lng: -77.8, locked: true, continent: 'na' },
  // South America
  { name: 'Brazil', lat: -14.2, lng: -53.1, continent: 'sa' },
  { name: 'Argentina', lat: -38.4, lng: -63.6, locked: true, continent: 'sa' },
  { name: 'Colombia', lat: 4.6, lng: -74.3, locked: true, continent: 'sa' },
  { name: 'Peru', lat: -9.2, lng: -75.0, locked: true, continent: 'sa' },
  { name: 'Chile', lat: -35.7, lng: -71.5, continent: 'sa' },
  { name: 'Ecuador', lat: -1.8, lng: -78.2, continent: 'sa' },
  { name: 'Venezuela', lat: 6.4, lng: -66.6, continent: 'sa' },
  { name: 'Bolivia', lat: -16.3, lng: -63.6, locked: true, continent: 'sa' },
  { name: 'Uruguay', lat: -32.5, lng: -55.8, continent: 'sa' },
  // Europe
  { name: 'France', lat: 46.6, lng: 2.2, continent: 'eu' },
  { name: 'England', lat: 54.0, lng: -2.5, continent: 'eu' },
  { name: 'Spain', lat: 39.9, lng: -3.5, continent: 'eu' },
  { name: 'Italy', lat: 42.5, lng: 12.6, continent: 'eu' },
  { name: 'Germany', lat: 51.2, lng: 10.4, continent: 'eu' },
  { name: 'Greece', lat: 39.1, lng: 22.0, locked: true, continent: 'eu' },
  { name: 'Portugal', lat: 39.4, lng: -8.2, continent: 'eu' },
  { name: 'Turkey', lat: 39.1, lng: 35.2, locked: true, continent: 'eu' },
  { name: 'Norway', lat: 60.5, lng: 8.5, locked: true, continent: 'eu' },
  { name: 'Croatia', lat: 45.1, lng: 15.2, continent: 'eu' },
  { name: 'Switzerland', lat: 46.8, lng: 8.2, locked: true, continent: 'eu' },
  // Africa
  { name: 'Egypt', lat: 26.8, lng: 30.8, locked: true, continent: 'af' },
  { name: 'South Africa', lat: -30.6, lng: 25.0, locked: true, continent: 'af' },
  { name: 'Morocco', lat: 31.8, lng: -7.1, locked: true, continent: 'af' },
  { name: 'Kenya', lat: -0.2, lng: 37.9, continent: 'af' },
  { name: 'Nigeria', lat: 9.1, lng: 8.7, locked: true, continent: 'af' },
  { name: 'Ghana', lat: 7.9, lng: -1.0, continent: 'af' },
  { name: 'Ethiopia', lat: 9.1, lng: 40.5, continent: 'af' },
  { name: 'Madagascar', lat: -18.8, lng: 46.9, continent: 'af' },
  { name: 'Senegal', lat: 14.5, lng: -14.5, continent: 'af' },
  { name: 'Algeria', lat: 28.0, lng: 1.7, continent: 'af' },
  { name: 'Mozambique', lat: -18.7, lng: 35.5, continent: 'af' },
  { name: 'Cameroon', lat: 7.4, lng: 12.4, continent: 'af' },
  { name: 'Uganda', lat: 1.4, lng: 32.3, continent: 'af' },
  // Asia & Oceania
  { name: 'Japan', lat: 36.2, lng: 138.3, continent: 'as' },
  { name: 'Thailand', lat: 15.9, lng: 101.0, locked: true, continent: 'as' },
  { name: 'India', lat: 20.6, lng: 79.0, locked: true, continent: 'as' },
  { name: 'China', lat: 35.9, lng: 104.2, locked: true, continent: 'as' },
  { name: 'South Korea', lat: 35.9, lng: 127.8, continent: 'as' },
  { name: 'Indonesia', lat: -0.8, lng: 113.9, locked: true, continent: 'as' },
  { name: 'Australia', lat: -25.3, lng: 133.8, continent: 'as' },
  { name: 'Vietnam', lat: 14.1, lng: 108.3, continent: 'as' },
  { name: 'Philippines', lat: 12.9, lng: 121.8, locked: true, continent: 'as' },
  { name: 'New Zealand', lat: -40.9, lng: 174.9, continent: 'as' },
];

const LOCKED_SET = new Set(PINNED_COUNTRIES.filter(c => c.locked).map(c => c.name));

const PINNED_SET = new Set(PINNED_COUNTRIES.map(c => c.name));

// --- Point-in-polygon ---
function pointInRing(testLat: number, testLng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lngI, latI] = ring[i];
    const [lngJ, latJ] = ring[j];
    if (
      (latI > testLat) !== (latJ > testLat) &&
      testLng < ((lngJ - lngI) * (testLat - latI)) / (latJ - latI) + lngI
    ) {
      inside = !inside;
    }
  }
  return inside;
}

interface GeoFeature {
  name: string;
  type: string;
  coordinates: number[][][][] | number[][][];
  bbox: [number, number, number, number];
}

function computeBBox(rings: number[][][]): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}

function findCountryAtLatLng(lat: number, lng: number, features: GeoFeature[]): string | null {
  for (const f of features) {
    if (!PINNED_SET.has(f.name)) continue; // Only detect pinned countries
    const [minLng, minLat, maxLng, maxLat] = f.bbox;
    if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue;
    if (f.type === 'Polygon') {
      if (pointInRing(lat, lng, (f.coordinates as number[][][])[0])) return f.name;
    } else if (f.type === 'MultiPolygon') {
      for (const polygon of f.coordinates as number[][][][]) {
        if (pointInRing(lat, lng, polygon[0])) return f.name;
      }
    }
  }
  return null;
}

// --- Indexed sphere ---
function buildSphere(radius: number, widthSeg: number, heightSeg: number) {
  const vertexLatLng: [number, number][] = [];
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= heightSeg; row++) {
    const lat = 90 - (row / heightSeg) * 180;
    for (let col = 0; col <= widthSeg; col++) {
      const lng = (col / widthSeg) * 360 - 180;
      vertexLatLng.push([lat, lng]);
      const sp = latLngToSphere(lat, lng, radius);
      positions.push(sp[0], sp[1], sp[2]);
    }
  }
  for (let row = 0; row < heightSeg; row++) {
    for (let col = 0; col < widthSeg; col++) {
      const a = row * (widthSeg + 1) + col;
      const b = a + widthSeg + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, vertexLatLng, radius };
}

// --- Canvas-based country fill ---
const FILL_TEX_W = 4096;
const FILL_TEX_H = 2048;

// Create a diagonal stripe pattern for locked countries
let _stripePattern: CanvasPattern | null = null;
function getStripePattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  if (_stripePattern) return _stripePattern;
  const size = 12;
  const pCanvas = document.createElement('canvas');
  pCanvas.width = size;
  pCanvas.height = size;
  const pCtx = pCanvas.getContext('2d')!;
  pCtx.strokeStyle = '#1a1a1a';
  pCtx.lineWidth = 1;
  pCtx.beginPath();
  pCtx.moveTo(0, size);
  pCtx.lineTo(size, 0);
  pCtx.stroke();
  pCtx.beginPath();
  pCtx.moveTo(-size / 2, size / 2);
  pCtx.lineTo(size / 2, -size / 2);
  pCtx.stroke();
  pCtx.beginPath();
  pCtx.moveTo(size / 2, size + size / 2);
  pCtx.lineTo(size + size / 2, size / 2);
  pCtx.stroke();
  _stripePattern = ctx.createPattern(pCanvas, 'repeat')!;
  return _stripePattern;
}

function drawCountryFill(
  ctx: CanvasRenderingContext2D,
  geometry: { type: string; coordinates: any },
  locked: boolean,
) {
  ctx.clearRect(0, 0, FILL_TEX_W, FILL_TEX_H);

  const polygons: number[][][][] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.coordinates;

  if (locked) {
    ctx.fillStyle = getStripePattern(ctx);
  } else {
    ctx.fillStyle = '#888888';
  }

  for (const polygon of polygons) {
    const outerRing = polygon[0];
    if (!outerRing || outerRing.length < 3) continue;

    for (const lngOffset of [0, -360, 360]) {
      ctx.beginPath();
      for (let i = 0; i < outerRing.length; i++) {
        const lng = outerRing[i][0] + lngOffset;
        const lat = Math.max(-89.5, Math.min(89.5, outerRing[i][1]));
        const x = ((lng + 180) / 360) * FILL_TEX_W;
        const y = ((90 - lat) / 180) * FILL_TEX_H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill('evenodd');
    }
  }
}

// Build a morphable sphere with UVs for the fill texture
function buildFillSphere(radius: number, widthSeg: number, heightSeg: number) {
  const vertexLatLng: [number, number][] = [];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= heightSeg; row++) {
    const v = row / heightSeg;
    const lat = 90 - v * 180;
    for (let col = 0; col <= widthSeg; col++) {
      const u = col / widthSeg;
      const lng = u * 360 - 180;
      vertexLatLng.push([lat, lng]);
      const sp = latLngToSphere(lat, lng, radius);
      positions.push(sp[0], sp[1], sp[2]);
      uvs.push(u, 1 - v);
    }
  }

  for (let row = 0; row < heightSeg; row++) {
    for (let col = 0; col < widthSeg; col++) {
      const a = row * (widthSeg + 1) + col;
      const b = a + widthSeg + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return { geometry, vertexLatLng };
}

// --- Pin geometry: classic location marker icon ---
function buildPinGeometry() {
  const R = 0.028;       // circle radius (the big round head)
  const cy = 0.055;      // circle center Y (closer to tip = shorter point)
  const dist = cy;       // distance from tip (0,0) to circle center

  // Tangent angle from tip to circle edge
  const tangentAngle = Math.asin(R / dist);

  // Tangent point on the circle (right side)
  // Angle on circle measured from bottom (toward tip), going clockwise
  const contactAngle = Math.PI / 2 - tangentAngle;

  const points: THREE.Vector2[] = [];

  // 1. Sharp tip
  points.push(new THREE.Vector2(0, 0));

  // 2. Straight line from tip to tangent point on circle
  const tangentX = R * Math.cos(tangentAngle);
  const tangentY = cy - R * Math.sin(tangentAngle);
  const lineSteps = 6;
  for (let i = 1; i <= lineSteps; i++) {
    const t = i / lineSteps;
    points.push(new THREE.Vector2(tangentX * t, tangentY * t));
  }

  // 3. Arc around the circle from tangent point over the top
  // Start angle: where the tangent line meets the circle
  // End angle: mirror on the other side (but for lathe we go to r=0 at top)
  const startAngle = -(Math.PI / 2 - contactAngle); // bottom-right of circle
  const endAngle = Math.PI / 2;                       // very top (r → 0)
  const arcSteps = 24;
  for (let i = 0; i <= arcSteps; i++) {
    const t = i / arcSteps;
    const angle = startAngle + t * (endAngle - startAngle);
    const r = R * Math.cos(angle);
    const y = cy + R * Math.sin(angle);
    points.push(new THREE.Vector2(Math.max(0, r), y));
  }

  const geo = new THREE.LatheGeometry(points, 16);
  geo.computeVertexNormals();
  return geo;
}

// --- Country border lines ---
interface MorphLineData {
  geometry: THREE.BufferGeometry;
  latLngs: [number, number][];
  radius: number;
}

function buildMorphableCountryLines(coordinates: number[][][], radius: number): MorphLineData[] {
  const results: MorphLineData[] = [];
  for (const ring of coordinates) {
    const positions: number[] = [];
    const latLngs: [number, number][] = [];
    for (const [lng, lat] of ring) {
      const sp = latLngToSphere(lat, lng, radius * 1.002);
      positions.push(sp[0], sp[1], sp[2]);
      latLngs.push([lat, lng]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
    results.push({ geometry: geo, latLngs, radius: radius * 1.002 });
  }
  return results;
}

interface CountryMorphData {
  name: string;
  lines: MorphLineData[];
}

// --- Graticule ---
function MorphableGraticule({ radius, morphT }: { radius: number; morphT: React.RefObject<number> }) {
  const linesData = useMemo(() => {
    const result: MorphLineData[] = [];
    const r = radius * 0.999;
    for (let lat = -80; lat <= 80; lat += 20) {
      const positions: number[] = [];
      const latLngs: [number, number][] = [];
      for (let lng = -180; lng <= 180; lng += 2) {
        const sp = latLngToSphere(lat, lng, r);
        positions.push(sp[0], sp[1], sp[2]);
        latLngs.push([lat, lng]);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
      result.push({ geometry: geo, latLngs, radius: r });
    }
    for (let lng = -180; lng < 180; lng += 30) {
      const positions: number[] = [];
      const latLngs: [number, number][] = [];
      for (let lat = -90; lat <= 90; lat += 2) {
        const sp = latLngToSphere(lat, lng, r);
        positions.push(sp[0], sp[1], sp[2]);
        latLngs.push([lat, lng]);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
      result.push({ geometry: geo, latLngs, radius: r });
    }
    return result;
  }, [radius]);

  useFrame(() => {
    const t = morphT.current;
    if (t === undefined) return;
    for (const line of linesData) {
      const pos = line.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let v = 0; v < line.latLngs.length; v++) {
        const [lat, lng] = line.latLngs[v];
        const m = morphedXYZ(lat, lng, line.radius, t);
        arr[v * 3] = m[0];
        arr[v * 3 + 1] = m[1];
        arr[v * 3 + 2] = m[2] - (t > 0 ? 0.001 : 0);
      }
      pos.needsUpdate = true;
      line.geometry.computeBoundingSphere();
    }
  });

  const lineObjects = useMemo(() => {
    return linesData.map((line, i) => {
      const mat = new THREE.LineBasicMaterial({ color: '#2a2a2a', transparent: true, opacity: 0.7 });
      return <primitive key={i} object={new THREE.Line(line.geometry, mat)} />;
    });
  }, [linesData]);

  return <group>{lineObjects}</group>;
}

// --- Single pin mesh (unlocked countries) ---
function PinMesh({
  country,
  pinGeo,
  morphT,
  onHover,
}: {
  country: PinnedCountry;
  pinGeo: THREE.BufferGeometry;
  morphT: React.RefObject<number>;
  onHover: (name: string | null) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = morphT.current ?? 0;
    const { lat, lng } = country;
    const [sx, sy, sz] = morphedXYZ(lat, lng, PIN_RADIUS, t);
    mesh.position.set(sx, sy, sz);

    // Globe orientation: align pin to surface normal with shackle toward north
    const [cx, cy, cz] = morphedXYZ(lat, lng, GLOBE_RADIUS, 0);
    const sGlobe = latLngToSphere(lat, lng, PIN_RADIUS);
    const normal = new THREE.Vector3(sGlobe[0] - cx, sGlobe[1] - cy, sGlobe[2] - cz).normalize();

    const worldUp = new THREE.Vector3(0, 1, 0);
    const tangentUp = new THREE.Vector3().copy(worldUp).addScaledVector(normal, -worldUp.dot(normal));
    if (tangentUp.lengthSq() < 0.0001) {
      tangentUp.set(0, 0, -1).addScaledVector(normal, normal.z);
    }
    tangentUp.normalize();
    const tangentRight = new THREE.Vector3().crossVectors(tangentUp, normal).normalize();

    const globeMat = new THREE.Matrix4().makeBasis(tangentRight, normal, tangentUp.negate());
    const globeQuat = new THREE.Quaternion().setFromRotationMatrix(globeMat);

    // Flat orientation: pin lies in XY plane, silhouette visible from +Z
    const flatQuat = new THREE.Quaternion();

    mesh.quaternion.copy(globeQuat).slerp(flatQuat, t);
  });

  return (
    <mesh
      ref={meshRef}
      geometry={pinGeo}
      onPointerOver={(e) => { e.stopPropagation(); onHover(country.name); document.body.style.cursor = 'pointer'; }}
      onPointerOut={(e) => { e.stopPropagation(); onHover(null); document.body.style.cursor = 'default'; }}
    >
      <meshBasicMaterial color="#ffffff" />
    </mesh>
  );
}

// --- Lock mesh (locked countries) ---
function LockMesh({
  country,
  morphT,
  onHover,
}: {
  country: PinnedCountry;
  morphT: React.RefObject<number>;
  onHover: (name: string | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Build lock geometry once
  const { bodyGeo, shackleGeo } = useMemo(() => {
    // Lock body: flat rectangle lying on the surface (XZ plane), thin in Y
    const body = new THREE.BoxGeometry(0.05, 0.008, 0.04);
    body.translate(0, 0.01, 0.005);

    // Shackle: half-torus arc in XZ plane
    const shackle = new THREE.TorusGeometry(0.016, 0.005, 8, 16, Math.PI);
    shackle.rotateX(-Math.PI / 2);
    shackle.translate(0, 0.01, -0.015);

    return { bodyGeo: body, shackleGeo: shackle };
  }, []);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const t = morphT.current ?? 0;
    const { lat, lng } = country;
    const lockRadius = GLOBE_RADIUS * 1.04;
    const [sx, sy, sz] = morphedXYZ(lat, lng, lockRadius, t);
    group.position.set(sx, sy, sz);

    // Globe orientation: Y = surface normal, shackle toward north pole
    const [cx, cy, cz] = morphedXYZ(lat, lng, GLOBE_RADIUS, 0); // always use globe positions for normal
    const sGlobe = latLngToSphere(lat, lng, PIN_RADIUS);
    const normal = new THREE.Vector3(sGlobe[0] - cx, sGlobe[1] - cy, sGlobe[2] - cz).normalize();

    const worldUp = new THREE.Vector3(0, 1, 0);
    const tangentUp = new THREE.Vector3().copy(worldUp).addScaledVector(normal, -worldUp.dot(normal));
    if (tangentUp.lengthSq() < 0.0001) {
      tangentUp.set(0, 0, -1).addScaledVector(normal, normal.z);
    }
    tangentUp.normalize();
    const tangentRight = new THREE.Vector3().crossVectors(tangentUp, normal).normalize();

    const globeMat = new THREE.Matrix4().makeBasis(tangentRight, normal, tangentUp.negate());
    const globeQuat = new THREE.Quaternion().setFromRotationMatrix(globeMat);

    // Flat orientation: rotate so lock's Y (face normal) points toward camera (+Z)
    const flatQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

    // Blend between globe and flat orientation
    group.quaternion.copy(globeQuat).slerp(flatQuat, t);
  });

  return (
    <group ref={groupRef}>
      <mesh
        geometry={bodyGeo}
        onPointerOver={(e) => { e.stopPropagation(); onHover(country.name); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); onHover(null); document.body.style.cursor = 'default'; }}
      >
        <meshBasicMaterial color="#555555" />
      </mesh>
      <mesh geometry={shackleGeo}>
        <meshBasicMaterial color="#555555" />
      </mesh>
    </group>
  );
}

// --- Pin/Lock markers container ---
function PinMarkers({
  morphT,
  onHover,
  showLocked,
}: {
  morphT: React.RefObject<number>;
  onHover: (name: string | null) => void;
  showLocked: boolean;
}) {
  const pinGeo = useMemo(() => buildPinGeometry(), []);

  return (
    <group>
      {PINNED_COUNTRIES.map((country) =>
        country.locked ? (
          showLocked && <LockMesh
            key={country.name}
            country={country}
            morphT={morphT}
            onHover={onHover}
          />
        ) : (
          <PinMesh
            key={country.name}
            country={country}
            pinGeo={pinGeo}
            morphT={morphT}
            onHover={onHover}
          />
        )
      )}
    </group>
  );
}

// --- Continent connection line ordering ---
// Defines the order countries should be connected within each continent
const CONTINENT_ORDER: Record<Continent, string[]> = {
  na: ['Canada', 'USA', 'Mexico', 'Costa Rica', 'Cuba'],
  sa: ['Venezuela', 'Colombia', 'Ecuador', 'Peru', 'Bolivia', 'Chile', 'Argentina', 'Uruguay', 'Brazil'],
  eu: ['Norway', 'England', 'Germany', 'Switzerland', 'France', 'Spain', 'Portugal', 'Italy', 'Croatia', 'Greece', 'Turkey'],
  af: ['Morocco', 'Senegal', 'Ghana', 'Nigeria', 'Cameroon', 'Algeria', 'Egypt', 'Uganda', 'Ethiopia', 'Kenya', 'Madagascar', 'Mozambique', 'South Africa'],
  as: ['India', 'Thailand', 'Vietnam', 'Philippines', 'Indonesia', 'Australia', 'New Zealand', 'China', 'South Korea', 'Japan'],
};

function buildContinentGroups(showLocked: boolean): { lat: number; lng: number }[][] {
  const countryMap = new Map(PINNED_COUNTRIES.map(c => [c.name, c]));
  return Object.values(CONTINENT_ORDER).map(order => {
    return order
      .filter(name => {
        const c = countryMap.get(name);
        if (!c) return false;
        if (c.locked && !showLocked) return false;
        return true;
      })
      .map(name => {
        const c = countryMap.get(name)!;
        return { lat: c.lat, lng: c.lng };
      });
  }).filter(group => group.length >= 2);
}

const CURVE_SEGMENTS = 20; // subdivisions per segment

function interpolateLatLng(
  lat1: number, lng1: number, lat2: number, lng2: number, steps: number
): { lat: number; lng: number }[] {
  // Great circle interpolation via slerp on unit vectors
  const toRad = Math.PI / 180;
  const v1 = new THREE.Vector3(
    Math.cos(lat1 * toRad) * Math.cos(lng1 * toRad),
    Math.sin(lat1 * toRad),
    Math.cos(lat1 * toRad) * Math.sin(lng1 * toRad),
  );
  const v2 = new THREE.Vector3(
    Math.cos(lat2 * toRad) * Math.cos(lng2 * toRad),
    Math.sin(lat2 * toRad),
    Math.cos(lat2 * toRad) * Math.sin(lng2 * toRad),
  );
  const result: { lat: number; lng: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const tmp = new THREE.Vector3().copy(v1).lerp(v2, i / steps).normalize();
    const lat = Math.asin(tmp.y) / toRad;
    const lng = Math.atan2(tmp.z, tmp.x) / toRad;
    result.push({ lat, lng });
  }
  return result;
}

function ContinentLines({ morphT, showLocked }: { morphT: React.RefObject<number>; showLocked: boolean }) {
  const groups = useMemo(() => buildContinentGroups(showLocked), [showLocked]);

  const lineObjects = useMemo(() => {
    return groups.map(group => {
        // Build subdivided points along great circles
        const allPoints: { lat: number; lng: number }[] = [];
        for (let i = 0; i < group.length - 1; i++) {
          const pts = interpolateLatLng(
            group[i].lat, group[i].lng,
            group[i + 1].lat, group[i + 1].lng,
            CURVE_SEGMENTS,
          );
          // Skip first point of subsequent segments to avoid duplicates
          if (i === 0) allPoints.push(...pts);
          else allPoints.push(...pts.slice(1));
        }
        const positions = new Float32Array(allPoints.length * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const mat = new THREE.LineDashedMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, dashSize: 0.02, gapSize: 0.02 });
        const lineObj = new THREE.Line(geo, mat);
        return { obj: lineObj, geometry: geo, points: allPoints };
      });
  }, [groups]);

  useFrame(() => {
    const t = morphT.current ?? 0;
    for (const line of lineObjects) {
      const pos = line.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < line.points.length; i++) {
        const { lat, lng } = line.points[i];
        const lineRadius = GLOBE_RADIUS * 1.04 + (PIN_RADIUS - GLOBE_RADIUS * 1.04) * easeInOutCubic(t);
        const m = morphedXYZ(lat, lng, lineRadius, t);
        arr[i * 3] = m[0];
        arr[i * 3 + 1] = m[1];
        arr[i * 3 + 2] = m[2];
      }
      pos.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.obj.computeLineDistances();
    }
  });

  return (
    <group>
      {lineObjects.map((line, i) => (
        <primitive key={i} object={line.obj} />
      ))}
    </group>
  );
}

// --- Main component ---
interface GlobeModelProps {
  onCountryHover: (name: string | null, locked?: boolean, continent?: string) => void;
  onCountryClick?: (name: string, locked: boolean, continent: string) => void;
  onGlobeHover?: (hovering: boolean) => void;
  isFlat: boolean;
  showLocked: boolean;
  showLines: boolean;
  autoRotate?: boolean;
  selectedCountry?: string | null;
}

export const GlobeModel = ({ onCountryHover, onCountryClick, onGlobeHover, isFlat, showLocked, showLines, autoRotate = false, selectedCountry = null }: GlobeModelProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const [countryData, setCountryData] = useState<CountryMorphData[]>([]);
  const [geoFeatures, setGeoFeatures] = useState<GeoFeature[]>([]);
  const morphProgress = useRef(0);
  const morphT = useRef(0);
  const hoveredRef = useRef<string | null>(null);
  const countryMaterialsRef = useRef<Map<string, THREE.LineBasicMaterial[]>>(new Map());
  const rawFeaturesRef = useRef<Map<string, { type: string; coordinates: any }>>(new Map());

  const sphereData = useMemo(() => buildSphere(GLOBE_RADIUS, 128, 64), []);
  const atmosphereData = useMemo(() => buildSphere(GLOBE_RADIUS * 1.06, 32, 32), []);
  const fillSphereData = useMemo(() => buildFillSphere(FILL_RADIUS, 128, 64), []);

  // Canvas texture for fill
  const fillCtx = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = FILL_TEX_W;
    canvas.height = FILL_TEX_H;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    return { canvas, ctx, texture, material };
  }, []);

  // Load GeoJSON
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
      .then(r => r.json())
      .then((data) => {
        const countries: CountryMorphData[] = [];
        const features: GeoFeature[] = [];
        const rawMap = new Map<string, { type: string; coordinates: any }>();

        for (const feature of data.features) {
          const name = feature.properties?.name || 'Unknown';
          let lines: MorphLineData[] = [];

          if (feature.geometry.type === 'Polygon') {
            lines = buildMorphableCountryLines(feature.geometry.coordinates, GLOBE_RADIUS);
            features.push({
              name, type: 'Polygon',
              coordinates: feature.geometry.coordinates,
              bbox: computeBBox(feature.geometry.coordinates),
            });
          } else if (feature.geometry.type === 'MultiPolygon') {
            for (const poly of feature.geometry.coordinates) {
              lines.push(...buildMorphableCountryLines(poly, GLOBE_RADIUS));
            }
            features.push({
              name, type: 'MultiPolygon',
              coordinates: feature.geometry.coordinates,
              bbox: computeBBox(feature.geometry.coordinates.flat()),
            });
          }

          countries.push({ name, lines });
          rawMap.set(name, feature.geometry);
        }

        rawFeaturesRef.current = rawMap;
        setCountryData(countries);
        setGeoFeatures(features);
      })
      .catch(console.error);
  }, []);

  // Keep selectedCountry ref in sync for use inside callbacks
  const selectedCountryRef = useRef(selectedCountry);
  selectedCountryRef.current = selectedCountry;

  // When selectedCountry changes, update border materials and fill
  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    // Reset previous selected country
    const prev = prevSelectedRef.current;
    if (prev && prev !== selectedCountry && prev !== hoveredRef.current) {
      const mats = countryMaterialsRef.current.get(prev);
      if (mats) mats.forEach(m => { m.opacity = 0.35; });
    }
    // Highlight new selected country
    if (selectedCountry) {
      const mats = countryMaterialsRef.current.get(selectedCountry);
      if (mats) mats.forEach(m => { m.opacity = 1; });
      // Draw fill
      const geo = rawFeaturesRef.current.get(selectedCountry);
      const isLocked = LOCKED_SET.has(selectedCountry);
      if (geo) {
        drawCountryFill(fillCtx.ctx, geo, isLocked);
        fillCtx.texture.needsUpdate = true;
      }
    } else if (!hoveredRef.current) {
      // Clear fill when deselected and nothing hovered
      fillCtx.ctx.clearRect(0, 0, FILL_TEX_W, FILL_TEX_H);
      fillCtx.texture.needsUpdate = true;
    }
    prevSelectedRef.current = selectedCountry;
  }, [selectedCountry, fillCtx]);

  // --- Hover (only for pinned countries) ---
  const setHovered = useCallback((name: string | null) => {
    const prev = hoveredRef.current;
    if (prev === name) return;

    // Reset previous border opacity (but not if it's the selected country)
    if (prev && prev !== selectedCountryRef.current) {
      const mats = countryMaterialsRef.current.get(prev);
      if (mats) mats.forEach(m => { m.opacity = 0.35; });
    }

    // Activate new
    if (name) {
      const isLocked = LOCKED_SET.has(name);
      // Skip locked countries when hidden
      if (isLocked && !showLocked) {
        hoveredRef.current = null;
        onCountryHover(null);
        return;
      }
      const mats = countryMaterialsRef.current.get(name);
      if (mats) mats.forEach(m => { m.opacity = 1; });
      const geo = rawFeaturesRef.current.get(name);
      if (geo) {
        drawCountryFill(fillCtx.ctx, geo, isLocked);
        fillCtx.texture.needsUpdate = true;
      }
      hoveredRef.current = name;
      const pinned = PINNED_COUNTRIES.find(c => c.name === name);
      onCountryHover(name, isLocked, pinned?.continent);
    } else {
      // Don't clear fill if selected country is active
      if (!selectedCountryRef.current) {
        fillCtx.ctx.clearRect(0, 0, FILL_TEX_W, FILL_TEX_H);
        fillCtx.texture.needsUpdate = true;
      } else {
        // Redraw selected country fill
        const geo = rawFeaturesRef.current.get(selectedCountryRef.current);
        const isLocked = LOCKED_SET.has(selectedCountryRef.current);
        if (geo) {
          drawCountryFill(fillCtx.ctx, geo, isLocked);
          fillCtx.texture.needsUpdate = true;
        }
      }
      hoveredRef.current = null;
      onCountryHover(null);
    }
  }, [onCountryHover, fillCtx, showLocked]);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (geoFeatures.length === 0) return;
    e.stopPropagation();
    const face = e.face;
    if (!face) { setHovered(null); return; }

    const [latA, lngA] = sphereData.vertexLatLng[face.a];
    const [latB, lngB] = sphereData.vertexLatLng[face.b];
    const [latC, lngC] = sphereData.vertexLatLng[face.c];
    const lat = (latA + latB + latC) / 3;
    const lng = (lngA + lngB + lngC) / 3;

    const country = findCountryAtLatLng(lat, lng, geoFeatures);
    setHovered(country);
    document.body.style.cursor = country ? 'pointer' : 'default';
  }, [geoFeatures, sphereData.vertexLatLng, setHovered]);

  const handlePointerOut = useCallback(() => {
    setHovered(null);
    document.body.style.cursor = 'default';
  }, [setHovered]);

  const handleClick = useCallback(() => {
    if (!onCountryClick) return;
    const name = hoveredRef.current;
    if (!name) return;
    const pinned = PINNED_COUNTRIES.find(c => c.name === name);
    if (pinned) {
      onCountryClick(name, !!pinned.locked, pinned.continent);
    }
  }, [onCountryClick]);

  // --- Animation ---
  useFrame((_, rawDelta) => {
    // Clamp delta to prevent jumps from frame spikes
    const delta = Math.min(rawDelta, 0.05);
    const target = isFlat ? 1 : 0;
    const dir = target > morphProgress.current ? 1 : -1;
    morphProgress.current += dir * delta * 1.4;
    morphProgress.current = dir > 0
      ? Math.min(morphProgress.current, 1)
      : Math.max(morphProgress.current, 0);
    morphT.current = easeInOutCubic(morphProgress.current);
    const t = morphT.current;

    // Smoothly reset rotation when transitioning to flat
    if (groupRef.current && t > 0.05) {
      const curY = groupRef.current.rotation.y;
      const tgtY = Math.round(curY / (Math.PI * 2)) * Math.PI * 2;
      groupRef.current.rotation.y += (tgtY - curY) * delta * 10;
      groupRef.current.rotation.x += (0 - groupRef.current.rotation.x) * delta * 10;
      groupRef.current.rotation.z += (0 - groupRef.current.rotation.z) * delta * 10;
    }

    // Smoothly reset X/Z tilt when leaving landing (so OrbitControls rotates cleanly)
    if (groupRef.current && !autoRotate && t < 0.01) {
      groupRef.current.rotation.x += (0 - groupRef.current.rotation.x) * delta * 5;
      groupRef.current.rotation.z += (0 - groupRef.current.rotation.z) * delta * 5;
    }

    // Slow auto-rotation (only used on landing page, before OrbitControls is active)
    if (groupRef.current && autoRotate && t < 0.01) {
      groupRef.current.rotation.y += delta * 0.06;
    }

    // Morph sphere
    {
      const pos = sphereData.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let v = 0; v < sphereData.vertexLatLng.length; v++) {
        const [lat, lng] = sphereData.vertexLatLng[v];
        const m = morphedXYZ(lat, lng, sphereData.radius, t);
        arr[v * 3] = m[0]; arr[v * 3 + 1] = m[1]; arr[v * 3 + 2] = m[2];
      }
      pos.needsUpdate = true;
      sphereData.geometry.computeVertexNormals();
      sphereData.geometry.computeBoundingSphere();
    }

    // Morph fill sphere
    {
      const pos = fillSphereData.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let v = 0; v < fillSphereData.vertexLatLng.length; v++) {
        const [lat, lng] = fillSphereData.vertexLatLng[v];
        const m = morphedXYZ(lat, lng, FILL_RADIUS, t);
        arr[v * 3] = m[0]; arr[v * 3 + 1] = m[1]; arr[v * 3 + 2] = m[2];
      }
      pos.needsUpdate = true;
    }

    // Morph atmosphere
    {
      const pos = atmosphereData.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let v = 0; v < atmosphereData.vertexLatLng.length; v++) {
        const [lat, lng] = atmosphereData.vertexLatLng[v];
        const m = morphedXYZ(lat, lng, atmosphereData.radius, t);
        arr[v * 3] = m[0]; arr[v * 3 + 1] = m[1]; arr[v * 3 + 2] = m[2];
      }
      pos.needsUpdate = true;
    }

    // Morph country lines
    for (const country of countryData) {
      for (const line of country.lines) {
        const pos = line.geometry.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        for (let v = 0; v < line.latLngs.length; v++) {
          const [lat, lng] = line.latLngs[v];
          const m = morphedXYZ(lat, lng, line.radius, t);
          arr[v * 3] = m[0]; arr[v * 3 + 1] = m[1];
          arr[v * 3 + 2] = m[2] + (t > 0 ? 0.002 : 0);
        }
        pos.needsUpdate = true;
        line.geometry.computeBoundingSphere();
      }
    }
  });

  // Line objects
  const countryLineObjects = useMemo(() => {
    const matMap = new Map<string, THREE.LineBasicMaterial[]>();
    const objs = countryData.flatMap((country, i) =>
      country.lines.map((line, j) => {
        const mat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.15 });
        if (!matMap.has(country.name)) matMap.set(country.name, []);
        matMap.get(country.name)!.push(mat);
        const lineObj = new THREE.LineLoop(line.geometry, mat);
        lineObj.userData = { countryName: country.name };
        return { key: `${i}-${j}`, obj: lineObj };
      })
    );
    countryMaterialsRef.current = matMap;
    return objs;
  }, [countryData]);

  // Fill sphere mesh ref — disable raycast so it doesn't block hover
  const fillMeshRef = useRef<THREE.Mesh>(null);
  useEffect(() => {
    if (fillMeshRef.current) {
      fillMeshRef.current.raycast = () => {};
    }
  }, []);

  // Atmosphere
  const atmosphereMat = useMemo(() =>
    new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.04, side: THREE.BackSide }),
  []);
  useFrame(() => {
    atmosphereMat.opacity = 0.04 * (1 - easeInOutCubic(morphProgress.current));
  });

  return (
    <group ref={groupRef} rotation={[0.4, -1.6, -0.2]}>
      <mesh
        geometry={sphereData.geometry}
        onPointerMove={handlePointerMove}
        onPointerOut={() => { handlePointerOut(); onGlobeHover?.(false); }}
        onPointerEnter={() => onGlobeHover?.(true)}
        onPointerLeave={() => onGlobeHover?.(false)}
        onClick={handleClick}
      >
        <meshStandardMaterial color="#000000" roughness={1} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      <MorphableGraticule radius={GLOBE_RADIUS} morphT={morphT} />
      {countryLineObjects.map(({ key, obj }) => <primitive key={key} object={obj} />)}
      <mesh ref={fillMeshRef} geometry={fillSphereData.geometry} material={fillCtx.material} renderOrder={2} />
      {showLines && <ContinentLines morphT={morphT} showLocked={showLocked} />}
      <PinMarkers morphT={morphT} onHover={setHovered} showLocked={showLocked} />
      <mesh geometry={atmosphereData.geometry} material={atmosphereMat} />
    </group>
  );
};
