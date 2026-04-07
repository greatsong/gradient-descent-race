import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

export default function RacingBall({ teamName, color, ballData, isMyTeam, hideLabel = false }) {
  const meshRef = useRef();
  const glowRef = useRef();

  const targetPos = useMemo(() => {
    if (!ballData) return new THREE.Vector3(0, 2, 0);
    return new THREE.Vector3(ballData.x, ballData.y + 0.15, ballData.z);
  }, [ballData?.x, ballData?.y, ballData?.z]);

  const parsedColor = useMemo(() => new THREE.Color(color), [color]);
  const isEscaped = ballData?.status === 'escaped';
  const isConverged = ballData?.status === 'converged';
  const isLocalMin = ballData?.status === 'local_minimum';

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    meshRef.current.position.lerp(targetPos, Math.min(delta * 5, 1));
    if (glowRef.current) {
      glowRef.current.position.copy(meshRef.current.position);
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
      glowRef.current.scale.setScalar(isEscaped ? pulse * 1.5 : pulse);
    }
  });

  if (!ballData) return null;

  const ballSize = isMyTeam ? 0.25 : 0.18;
  const ballColor = isEscaped ? new THREE.Color('#ff4444')
    : isLocalMin ? new THREE.Color('#f97316')
    : isConverged ? new THREE.Color('#10b981')
    : parsedColor;
  const emoji = isEscaped ? '💥' : isLocalMin ? '🏔️' : isConverged ? '🏁' : '🏎️';

  return (
    <group>
      <mesh ref={glowRef} position={[ballData.x, ballData.y + 0.15, ballData.z]}>
        <sphereGeometry args={[ballSize * 2, 12, 12]} />
        <meshBasicMaterial
          color={ballColor} transparent
          opacity={isEscaped ? 0.3 : isLocalMin ? 0.25 : 0.12}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={meshRef} position={[ballData.x, ballData.y + 0.15, ballData.z]}>
        <sphereGeometry args={[ballSize, 16, 16]} />
        <meshStandardMaterial
          color={ballColor}
          emissive={isEscaped ? new THREE.Color('#ff0000') : isLocalMin ? new THREE.Color('#f97316') : parsedColor}
          emissiveIntensity={isEscaped ? 2.0 : isLocalMin ? 1.5 : isConverged ? 0.3 : 0.8}
          roughness={0.2} metalness={0.9}
        />
      </mesh>
      {!hideLabel && (
        <Html position={[ballData.x, ballData.y + 0.6, ballData.z]} center style={{ pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
            <div style={{ color: isEscaped ? '#ff4444' : isLocalMin ? '#f97316' : color, fontSize: '11px', fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
              {emoji} {teamName || 'Unknown'}
            </div>
            <div style={{ color: '#94a3b8', fontSize: '9px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
              Loss: {ballData.loss?.toFixed(3) || '?'}
            </div>
          </div>
        </Html>
      )}
      {ballData.trail && ballData.trail.length > 1 && (
        <TrailLine points={ballData.trail} color={color} />
      )}
    </group>
  );
}

function TrailLine({ points, color }) {
  const geometry = useMemo(() => {
    const positions = [];
    const recentPoints = points.slice(-100);
    for (const p of recentPoints) {
      positions.push(p.x, p.y + 0.05, p.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [points]);

  return (
    <line geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.5} linewidth={2} />
    </line>
  );
}
