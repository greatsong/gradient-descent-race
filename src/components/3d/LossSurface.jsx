import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { lossFunctionByLevel, MAP_SIZES } from '../../../backend/lossFunction.js';
import useRaceStore from '../../store/raceStore';

export default function LossSurface() {
  const meshRef = useRef();
  const mapLevel = useRaceStore((s) => s.mapLevel);

  const geometry = useMemo(() => {
    const size = MAP_SIZES[mapLevel] || 20;
    const segments = size > 30 ? 120 : 80;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    const positions = geo.attributes.position;
    const colorArray = new Float32Array(positions.count * 3);

    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const zPlane = positions.getY(i);
      const y = lossFunctionByLevel(x, -zPlane, mapLevel);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const zPlane = positions.getY(i);
      const y = lossFunctionByLevel(x, -zPlane, mapLevel);
      positions.setZ(i, y);

      const t = (y - minY) / (maxY - minY);
      const color = new THREE.Color();
      if (t < 0.3) {
        color.setHSL(0.6, 0.9, 0.3 + t * 0.5);
      } else if (t < 0.6) {
        color.setHSL(0.45 - (t - 0.3) * 1.0, 0.85, 0.5);
      } else {
        color.setHSL(0.08 - (t - 0.6) * 0.15, 0.9, 0.45 + (t - 0.6) * 0.3);
      }
      colorArray[i * 3] = color.r;
      colorArray[i * 3 + 1] = color.g;
      colorArray[i * 3 + 2] = color.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    geo.computeVertexNormals();
    return geo;
  }, [mapLevel]);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          vertexColors side={THREE.DoubleSide}
          roughness={0.6} metalness={0.2}
          transparent opacity={0.85}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial wireframe color="#4a3a8a" transparent opacity={0.15} />
      </mesh>
    </group>
  );
}
