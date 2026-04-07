import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import useRaceStore from '../../store/raceStore';
import LossSurface from './LossSurface';
import RacingBall from './RacingBall';
import SpaceBackground from './SpaceBackground';
import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLOBAL_MINIMA, lossFunctionByLevel } from '../../../backend/lossFunction.js';

const CAM_MODES = ['overview', 'follow3rd', 'follow1st'];
const CAM_META = {
  overview: { icon: '🗺️', label: '조감도' },
  follow3rd: { icon: '🏎️', label: '추적뷰' },
  follow1st: { icon: '👁️', label: '지형뷰' },
};

function FollowCamera({ ballData, mode }) {
  const { camera } = useThree();
  const smoothPos = useRef(null);
  const smoothLook = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!ballData) return;
    const bx = isFinite(ballData.x) ? ballData.x : 0;
    const by = isFinite(ballData.y) ? ballData.y + 0.15 : 0;
    const bz = isFinite(ballData.z) ? ballData.z : 0;
    const ballPos = new THREE.Vector3(bx, by, bz);
    let desiredPos, desiredLook;

    if (mode === 'follow3rd') {
      desiredPos = new THREE.Vector3(bx, by + 5, bz + 7);
      desiredLook = ballPos.clone();
    } else {
      const vx = isFinite(ballData.vx) ? ballData.vx : 0;
      const vz = isFinite(ballData.vz) ? ballData.vz : 0;
      const speed = Math.sqrt(vx * vx + vz * vz);
      if (speed > 0.0005) {
        const nx = vx / speed, nz = vz / speed;
        desiredPos = new THREE.Vector3(bx - nx * 2.5, by + 0.8, bz - nz * 2.5);
        desiredLook = new THREE.Vector3(bx + nx * 6, by - 0.8, bz + nz * 6);
      } else {
        desiredPos = new THREE.Vector3(bx, by + 1.5, bz + 4);
        desiredLook = new THREE.Vector3(bx, by - 0.5, bz - 2);
      }
    }

    if (!smoothPos.current) {
      smoothPos.current = camera.position.clone();
      smoothLook.current.copy(desiredLook);
    }
    const t = Math.min(delta * 4, 1);
    smoothPos.current.lerp(desiredPos, t);
    smoothLook.current.lerp(desiredLook, t);
    camera.position.copy(smoothPos.current);
    camera.lookAt(smoothLook.current);
  });
  return null;
}

function DeltaClamp() {
  useFrame((state, delta) => {
    if (delta > 0.1) state.clock.elapsedTime -= (delta - 0.016);
  });
  return null;
}

function GoalMarker({ mapLevel = 2 }) {
  const minima = GLOBAL_MINIMA[mapLevel] || GLOBAL_MINIMA[2];
  const gy = lossFunctionByLevel(minima.x, minima.z, mapLevel);
  return (
    <group>
      <mesh position={[minima.x, gy + 0.5, minima.z]}>
        <octahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={1.5} roughness={0.1} metalness={1} />
      </mesh>
      <mesh position={[minima.x, gy + 0.05, minima.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.6, 32]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.5} side={2} />
      </mesh>
    </group>
  );
}

export default function GradientRaceScene() {
  const teams = useRaceStore((s) => s.teams);
  const balls = useRaceStore((s) => s.balls);
  const myTeamId = useRaceStore((s) => s.myTeamId);
  const racePhase = useRaceStore((s) => s.racePhase);
  const mapLevel = useRaceStore((s) => s.mapLevel);
  const [visible, setVisible] = useState(true);
  const [camMode, setCamMode] = useState('overview');
  const myBall = myTeamId ? balls[myTeamId] : null;
  const showToggle = racePhase === 'racing' && Object.keys(balls).length > 0;

  useEffect(() => {
    const h = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);

  useEffect(() => {
    if (['finished', 'setup'].includes(racePhase)) setCamMode('overview');
  }, [racePhase]);

  const cycleCamera = () => {
    setCamMode(prev => CAM_MODES[(CAM_MODES.indexOf(prev) + 1) % CAM_MODES.length]);
  };

  const { icon, label } = CAM_META[camMode];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 400 }}>
      <Canvas
        camera={{ position: [0, 18, 18], fov: 55 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        frameloop={visible ? 'always' : 'never'}
      >
        <DeltaClamp />
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 20, 10]} intensity={0.8} color="#ffffff" />
        <pointLight position={[-5, 10, -5]} intensity={0.5} color="#7c5cfc" />
        <pointLight position={[5, 5, 5]} intensity={0.3} color="#22d3ee" />
        <SpaceBackground />
        <Stars radius={80} depth={40} count={1000} factor={2} saturation={0.5} fade speed={0.3} />
        <LossSurface />
        {Object.entries(balls).map(([teamId, ballData]) => {
          const team = teams[teamId];
          return (
            <RacingBall
              key={teamId}
              teamName={team?.name || teamId}
              color={team?.color || '#ffffff'}
              ballData={ballData}
              isMyTeam={teamId === myTeamId}
              hideLabel={camMode === 'follow1st' && teamId === myTeamId}
            />
          );
        })}
        <GoalMarker mapLevel={mapLevel} />
        {camMode === 'overview' ? (
          <OrbitControls enablePan enableZoom enableRotate maxDistance={40} minDistance={5} maxPolarAngle={Math.PI / 2.2} target={[0, 1, 0]} />
        ) : (
          <FollowCamera key={camMode} ballData={myBall} mode={camMode} />
        )}
      </Canvas>

      {showToggle && (
        <button
          onClick={cycleCamera}
          style={{
            position: 'absolute', bottom: 16, right: 16,
            background: camMode !== 'overview' ? '#6366f1' : 'rgba(30,30,50,0.85)',
            color: '#fff', border: '1px solid rgba(99,102,241,0.4)',
            borderRadius: 12, padding: '8px 16px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            backdropFilter: 'blur(8px)', zIndex: 10,
          }}
        >
          <span>{icon}</span>
          <span>{label}</span>
          <span style={{ fontSize: 10, opacity: 0.7 }}>탭해서 전환</span>
        </button>
      )}

      {camMode !== 'overview' && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(99,102,241,0.2)', borderRadius: 20, padding: '6px 16px',
          fontSize: 12, color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)',
          zIndex: 10,
        }}>
          {icon} {camMode === 'follow3rd' ? '내 공을 따라가고 있어요' : '내 공 시점으로 내려가는 중'}
        </div>
      )}
    </div>
  );
}
