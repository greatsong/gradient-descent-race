import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

export default function SpaceBackground() {
  const meshRef = useRef();
  useFrame(() => {
    if (meshRef.current) meshRef.current.rotation.y += 0.0001;
  });
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[100, 32, 32]} />
      <meshBasicMaterial color="#050510" side={1} />
    </mesh>
  );
}
