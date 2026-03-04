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
  const { viewport } = useThree();
  
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

  const customUniforms = useMemo(() => ({
    uTime: { value: 0 }
  }), []);

  // Custom Bird Geometry
  const birdGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      0, 0, 0.3,      // 0: Beak
      0, 0, -0.4,     // 1: Tail
      -0.6, 0, 0.1,   // 2: Left Wing
      0.6, 0, 0.1,    // 3: Right Wing
      0, -0.1, 0      // 4: Belly
    ]);
    const indices = [
      0, 2, 1, // Left top
      0, 1, 3, // Right top
      0, 4, 2, // Left bottom
      0, 3, 4, // Right bottom
      1, 2, 4, // Tail bottom left
      1, 4, 3  // Tail bottom right
    ];
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, []);

  // Realistic Starling Colors (Dark with iridescent hues)
  const baseColor = new THREE.Color('#22222a'); // Dark blue/grey
  const loudColor = new THREE.Color('#4a224a'); // Dark purple
  const attractColor = new THREE.Color('#224a33'); // Dark green
  const repelColor = new THREE.Color('#553322'); // Dark amber

  useFrame((state) => {
    if (!meshRef.current) return;

    const time = state.clock.elapsedTime;
    customUniforms.uTime.value = time;
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
      
      const dirX = hand.direction.x;
      const dirY = -hand.direction.y;
      const dirZ = -hand.direction.z;
      
      return {
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3(vx, vy, vz),
        dir: new THREE.Vector3(dirX, dirY, dirZ).normalize(),
        gesture: hand.gesture
      };
    });

    // Flock center (moves slowly)
    const flockCenter = new THREE.Vector3(
      Math.sin(time * 0.2) * BOUNDS * 0.3,
      Math.cos(time * 0.3) * BOUNDS * 0.3,
      Math.sin(time * 0.1) * BOUNDS * 0.3
    );

    // Global flock velocity (to make them move together)
    const flockVelocity = new THREE.Vector3(
      Math.cos(time * 0.2),
      Math.cos(time * 0.3),
      -Math.sin(time * 0.2)
    ).normalize().multiplyScalar(MAX_SPEED * 0.5);

    // Dynamic parameters based on audio
    let speedMultiplier = 1.0 + volume * 2.0; // Up to 3x speed when loud
    const noiseScale = 0.05 + volume * 0.05;
    const noiseStrength = 0.02 + volume * 0.05;

    // Check for global gesture overrides
    let isPeaceMode = false;
    let isDirected = false;
    for (const hand of worldHands) {
      if (hand.gesture === 'point') {
        // Pointing overrides flock velocity
        flockVelocity.copy(hand.dir).multiplyScalar(MAX_SPEED * 1.5);
        speedMultiplier *= 1.5; // Fly faster when directed
        isDirected = true;
      } else if (hand.gesture === 'peace') {
        isPeaceMode = true;
      }
    }

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
      if (isPeaceMode) {
        // Peace mode: split into two orbiting rings
        const ringRadius = BOUNDS * 0.4;
        const ringSpeed = time * 2.0;
        const group = i % 2 === 0 ? 1 : -1;
        
        const targetPos = new THREE.Vector3(
          Math.cos(ringSpeed * group + i * 0.1) * ringRadius,
          p.position.y * 0.9, // Flatten the ring
          Math.sin(ringSpeed * group + i * 0.1) * ringRadius
        );
        
        const centerDir = new THREE.Vector3().subVectors(targetPos, p.position);
        centerDir.normalize().multiplyScalar(MAX_FORCE * 3);
        p.acceleration.add(centerDir);
      } else {
        const centerDir = new THREE.Vector3().subVectors(flockCenter, p.position);
        const distToCenter = centerDir.length();
        if (distToCenter > BOUNDS * 0.5) {
          centerDir.normalize().multiplyScalar(MAX_FORCE * 2);
          p.acceleration.add(centerDir);
        }
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
      dummy.scale.set(0.4, 0.4, speedScale * 1.2);
      
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Determine color
      let targetColor = baseColor;
      if (isAttracted) {
        targetColor = attractColor;
      } else if (isRepelled) {
        targetColor = repelColor;
      } else if (isDirected) {
        targetColor = new THREE.Color('#8b5cf6'); // Purple when directed
      } else if (isPeaceMode) {
        targetColor = new THREE.Color('#ec4899'); // Pink in peace mode
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
      <primitive object={birdGeo} attach="geometry" />
      <meshPhysicalMaterial 
        color="#ffffff"
        roughness={0.4} 
        metalness={0.8} 
        iridescence={1.0}
        iridescenceIOR={1.5}
        iridescenceThicknessRange={[100, 400]}
        envMapIntensity={1}
        onBeforeCompile={(shader) => {
          shader.uniforms.uTime = customUniforms.uTime;
          shader.vertexShader = `
            uniform float uTime;
            ${shader.vertexShader}
          `;
          shader.vertexShader = shader.vertexShader.replace(
            `#include <begin_vertex>`,
            `
            #include <begin_vertex>
            
            // Random phase based on instance position
            float phase = instanceMatrix[3][0] * 0.5 + instanceMatrix[3][1] * 0.3 + instanceMatrix[3][2] * 0.1;
            
            // Flap animation (faster when moving)
            float flapSpeed = 25.0;
            float flap = sin(uTime * flapSpeed + phase) * 0.5;
            
            // Apply flap only to the wings (where abs(position.x) > 0.1)
            float wingFactor = smoothstep(0.1, 0.8, abs(position.x));
            transformed.y += flap * wingFactor;
            `
          );
        }}
      />
    </instancedMesh>
  );
}
