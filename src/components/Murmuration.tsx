import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { HandState } from './useHandTracker';

const PARTICLE_COUNT = 3000;
const BOUNDS = 20;
const MAX_SPEED = 0.2;
const MAX_FORCE = 0.01;

interface MurmurationProps {
  handsRef: React.MutableRefObject<HandState[]>;
  volumeRef: React.MutableRefObject<number>;
}

export function Murmuration({ handsRef, volumeRef }: MurmurationProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { viewport, camera } = useThree();
  
  // Particle state
  const particles = useMemo(() => {
    const arr = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr.push({
        position: new THREE.Vector3(
          (Math.random() - 0.5) * BOUNDS,
          (Math.random() - 0.5) * BOUNDS,
          (Math.random() - 0.5) * BOUNDS
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * MAX_SPEED,
          (Math.random() - 0.5) * MAX_SPEED,
          (Math.random() - 0.5) * MAX_SPEED
        ),
        acceleration: new THREE.Vector3(),
        color: new THREE.Color(),
      });
    }
    return arr;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const noise3D = useMemo(() => createNoise3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  // Base colors
  const baseColor = new THREE.Color('#3b82f6'); // Blue
  const loudColor = new THREE.Color('#ef4444'); // Red
  const attractColor = new THREE.Color('#10b981'); // Green
  const repelColor = new THREE.Color('#f59e0b'); // Amber

  useFrame((state) => {
    if (!meshRef.current) return;

    const time = state.clock.elapsedTime;
    const volume = volumeRef.current;
    
    // Map hands to world coordinates
    const worldHands = handsRef.current.map(hand => {
      // MediaPipe coordinates are 0-1, top-left origin
      // Three.js coordinates are centered
      const x = (hand.x - 0.5) * viewport.width;
      const y = -(hand.y - 0.5) * viewport.height;
      // Z is approximate
      const z = (hand.z * BOUNDS) - 5; 
      
      const vx = hand.velocity.x * viewport.width;
      const vy = -hand.velocity.y * viewport.height;
      const vz = hand.velocity.z * BOUNDS;
      
      return {
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3(vx, vy, vz),
        gesture: hand.gesture
      };
    });

    // Flock center (moves slowly)
    const flockCenter = new THREE.Vector3(
      Math.sin(time * 0.2) * BOUNDS * 0.3,
      Math.cos(time * 0.3) * BOUNDS * 0.3,
      Math.sin(time * 0.1) * BOUNDS * 0.3
    );

    // Dynamic parameters based on audio
    const speedMultiplier = 1.0 + volume * 2.0; // Up to 3x speed when loud
    const noiseScale = 0.05 + volume * 0.05;
    const noiseStrength = 0.02 + volume * 0.05;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];
      p.acceleration.set(0, 0, 0);

      // 1. Noise field (fluid-like movement)
      const nx = noise3D(p.position.x * noiseScale, p.position.y * noiseScale, time * 0.1);
      const ny = noise3D(p.position.y * noiseScale, p.position.z * noiseScale, time * 0.1);
      const nz = noise3D(p.position.z * noiseScale, p.position.x * noiseScale, time * 0.1);
      
      const noiseForce = new THREE.Vector3(nx, ny, nz).multiplyScalar(noiseStrength);
      p.acceleration.add(noiseForce);

      // 2. Center attraction (keep them together)
      const centerDir = new THREE.Vector3().subVectors(flockCenter, p.position);
      const distToCenter = centerDir.length();
      if (distToCenter > BOUNDS * 0.5) {
        centerDir.normalize().multiplyScalar(MAX_FORCE * 2);
        p.acceleration.add(centerDir);
      }

      // 3. Hand interaction
      let handInfluence = 0;
      let isAttracted = false;
      let isRepelled = false;

      for (const hand of worldHands) {
        const handDir = new THREE.Vector3().subVectors(hand.pos, p.position);
        const distToHand = handDir.length();
        
        if (distToHand < 15) {
          handInfluence = Math.max(handInfluence, 1 - distToHand / 15);
          const forceStrength = 1 - distToHand / 15;
          
          if (hand.gesture === 'open') {
            // Repel strongly (Shield)
            isRepelled = true;
            handDir.normalize().multiplyScalar(-MAX_FORCE * 8 * forceStrength);
            p.acceleration.add(handDir);
          } else if (hand.gesture === 'fist') {
            // Vortex / Black hole
            isAttracted = true;
            handDir.normalize().multiplyScalar(MAX_FORCE * 10 * forceStrength);
            p.acceleration.add(handDir);
            
            const swirl = new THREE.Vector3().crossVectors(handDir, new THREE.Vector3(0, 1, 0));
            p.acceleration.add(swirl.multiplyScalar(MAX_FORCE * 4 * forceStrength));
          } else if (hand.gesture === 'pinch') {
            // Precise follow (Attract to exact point, less swirl)
            isAttracted = true;
            handDir.normalize().multiplyScalar(MAX_FORCE * 6 * forceStrength);
            p.acceleration.add(handDir);
          }
          
          // Wind effect from hand velocity
          if (hand.vel.lengthSq() > 10) {
            const wind = hand.vel.clone().normalize().multiplyScalar(MAX_FORCE * 2 * forceStrength);
            p.acceleration.add(wind);
          }
        }
      }

      // Update velocity and position
      p.velocity.add(p.acceleration);
      p.velocity.clampLength(0, MAX_SPEED * speedMultiplier);
      p.position.add(p.velocity);

      // Wrap around bounds
      if (p.position.x > BOUNDS) p.position.x = -BOUNDS;
      if (p.position.x < -BOUNDS) p.position.x = BOUNDS;
      if (p.position.y > BOUNDS) p.position.y = -BOUNDS;
      if (p.position.y < -BOUNDS) p.position.y = BOUNDS;
      if (p.position.z > BOUNDS) p.position.z = -BOUNDS;
      if (p.position.z < -BOUNDS) p.position.z = BOUNDS;

      // Update instance matrix
      dummy.position.copy(p.position);
      
      // Orient particle along velocity
      if (p.velocity.lengthSq() > 0.0001) {
        // LookAt requires a target, we create one along the velocity vector
        const target = new THREE.Vector3().copy(p.position).add(p.velocity);
        dummy.lookAt(target);
      }
      
      // Scale based on speed
      const speedScale = Math.max(0.5, p.velocity.length() / MAX_SPEED);
      dummy.scale.set(0.5, 0.5, speedScale * 2);
      
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Determine color
      let targetColor = baseColor;
      if (isAttracted) {
        targetColor = attractColor;
      } else if (isRepelled) {
        targetColor = repelColor;
      } else if (volume > 0.1) {
        targetColor = baseColor.clone().lerp(loudColor, volume);
      }

      // Smooth color transition
      p.color.lerp(targetColor, 0.1);
      meshRef.current.setColorAt(i, p.color);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]}>
      <coneGeometry args={[0.05, 0.2, 4]} />
      <meshStandardMaterial 
        roughness={0.2} 
        metalness={0.8} 
        envMapIntensity={1}
      />
    </instancedMesh>
  );
}
