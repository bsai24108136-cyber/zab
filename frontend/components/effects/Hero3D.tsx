"use client";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, OrbitControls } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

/* ─── DNA Double Helix ─────────────────────────────────────── */
function DNAHelix() {
  const group = useRef<THREE.Group>(null);
  const POINTS = 64;
  const RADIUS = 1.1;
  const HEIGHT = 5.5;
  const TURNS  = 3;

  const strandA: [number, number, number][] = useMemo(() => {
    const arr: [number, number, number][] = [];
    for (let i = 0; i < POINTS; i++) {
      const t = i / (POINTS - 1);
      const a = t * Math.PI * 2 * TURNS;
      arr.push([Math.cos(a) * RADIUS, t * HEIGHT - HEIGHT / 2, Math.sin(a) * RADIUS]);
    }
    return arr;
  }, []);
  const strandB: [number, number, number][] = useMemo(
    () => strandA.map(([x, y, z]) => [-x, y, -z]),
    [strandA],
  );

  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.rotation.y += dt * 0.32;
  });

  return (
    <group ref={group}>
      {/* Backbone strands */}
      {strandA.map((p, i) => (
        <mesh key={`a-${i}`} position={p}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial
            color="#22D3EE"
            emissive="#22D3EE"
            emissiveIntensity={1.2}
            metalness={0.4}
            roughness={0.2}
          />
        </mesh>
      ))}
      {strandB.map((p, i) => (
        <mesh key={`b-${i}`} position={p}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial
            color="#F472B6"
            emissive="#F472B6"
            emissiveIntensity={1.2}
            metalness={0.4}
            roughness={0.2}
          />
        </mesh>
      ))}
      {/* Connecting rungs */}
      {strandA.map((p, i) => {
        if (i % 3 !== 0) return null;
        const a = new THREE.Vector3(...p);
        const b = new THREE.Vector3(...strandB[i]);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const dir = b.clone().sub(a);
        const len = dir.length();
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize(),
        );
        return (
          <mesh
            key={`r-${i}`}
            position={[mid.x, mid.y, mid.z]}
            quaternion={[quat.x, quat.y, quat.z, quat.w]}
          >
            <cylinderGeometry args={[0.02, 0.02, len, 8]} />
            <meshStandardMaterial
              color="#A855F7"
              emissive="#A855F7"
              emissiveIntensity={0.9}
              transparent
              opacity={0.85}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/* ─── Floating particle field ─────────────────────────────── */
function Particles({ count = 220 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 3 + Math.random() * 4;
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.05;
    ref.current.rotation.x += dt * 0.02;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#A855F7"
        size={0.04}
        sizeAttenuation
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ─── Glowing orb in the center ───────────────────────────── */
function CoreOrb() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const s = 0.55 + Math.sin(t * 1.4) * 0.06;
    ref.current.scale.setScalar(s);
  });
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[0.7, 1]} />
      <meshStandardMaterial
        color="#22D3EE"
        emissive="#A855F7"
        emissiveIntensity={1.8}
        metalness={0.6}
        roughness={0.15}
        wireframe
      />
    </mesh>
  );
}

export default function Hero3D({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 6.5], fov: 55 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.45} />
          <pointLight position={[5, 5, 5]}  intensity={1.4} color="#22D3EE" />
          <pointLight position={[-5, -3, 3]} intensity={1.3} color="#F472B6" />
          <pointLight position={[0, 4, -3]}  intensity={1.0} color="#A855F7" />

          <Float speed={1.4} rotationIntensity={0.3} floatIntensity={0.6}>
            <DNAHelix />
          </Float>

          <CoreOrb />
          <Particles />

          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate
            autoRotateSpeed={0.6}
            rotateSpeed={0.4}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
