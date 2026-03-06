import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { HandState } from './useHandTracker';

const PARTICLE_COUNT = 3000;
const BOUNDS = 20;
const MAX_SPEED = 0.2;

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

    // Boids parameters
    const centeringFactor = 0.005; // Cohesion
    const matchingFactor = 0.05;   // Alignment
    const avoidFactor = 0.05;      // Separation strength
    const turnFactor = 0.2;        // Soft bounds turn strength
    const maxSpeed = MAX_SPEED * (1.0 + volume * 2.0);

    // Pre-calculate flock center and average velocity for optimization
    const globalCenter = new THREE.Vector3();
    const globalVel = new THREE.Vector3();
    
    let sampleCount = 0;
    for (let i = 0; i < PARTICLE_COUNT; i += 10) {
      globalCenter.add(particles[i].position);
      globalVel.add(particles[i].velocity);
      sampleCount++;
    }
    globalCenter.divideScalar(sampleCount);
    globalVel.divideScalar(sampleCount);

    // Check for global gesture overrides
    let globalPeaceMode = false;
    for (const hand of worldHands) {
      if (hand.gesture === 'peace') {
        globalPeaceMode = true;
      }
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];
      
      // Reset acceleration
      p.acceleration.set(0, 0, 0);

      // --- Hand Interaction (Priority 1) ---
      // Apply hand forces FIRST and potentially skip or reduce boids rules if strongly affected
      let isAttracted = false;
      let isRepelled = false;
      let localIsDirected = false;
      let handForceApplied = false;

      for (const hand of worldHands) {
        const handToParticle = new THREE.Vector3().subVectors(p.position, hand.pos);
        const dist = handToParticle.length();
        const influenceRadius = 15; // Increased radius

        if (dist < influenceRadius) {
          const force = Math.pow(1 - dist / influenceRadius, 2); // Quadratic falloff for stronger center influence

          if (hand.gesture === 'open') {
            // Repel (Scatter) - Stronger
            isRepelled = true;
            handForceApplied = true;
            const repelForce = handToParticle.normalize().multiplyScalar(force * 2.0);
            p.acceleration.add(repelForce);
          } else if (hand.gesture === 'fist') {
            // Attract (Vortex) - Stronger
            isAttracted = true;
            handForceApplied = true;
            const attractDir = handToParticle.clone().normalize().negate();
            
            // Add swirl component
            const up = new THREE.Vector3(0, 1, 0);
            const swirlDir = new THREE.Vector3().crossVectors(attractDir, up).normalize();
            
            p.acceleration.add(attractDir.multiplyScalar(force * 1.5));
            p.acceleration.add(swirlDir.multiplyScalar(force * 3.0));
          } else if (hand.gesture === 'pinch') {
            // Strong Point Attraction - Stronger
            isAttracted = true;
            handForceApplied = true;
            const attractDir = handToParticle.clone().normalize().negate();
            p.acceleration.add(attractDir.multiplyScalar(force * 2.5));
            // Dampen velocity for precise control
            p.velocity.multiplyScalar(0.9);
          } else if (hand.gesture === 'point') {
             // Directional Flow - Stronger
             localIsDirected = true;
             handForceApplied = true;
             const flowDir = hand.dir.clone().normalize();
             // Align with finger direction
             const steer = new THREE.Vector3().subVectors(flowDir, p.velocity).multiplyScalar(force * 1.0);
             p.acceleration.add(steer);
          }
        }
      }

      // --- Boids Rules (Priority 2) ---
      // Only apply full boids rules if not strongly influenced by hands
      // or apply them with reduced weight
      
      const boidWeight = handForceApplied ? 0.2 : 1.0;

      // --- Rule 1: Cohesion (Fly towards center) ---
      const noiseOffset = new THREE.Vector3(
        noise3D(i * 0.1, time * 0.1, 0) * 5,
        noise3D(i * 0.1, 0, time * 0.1) * 5,
        noise3D(0, i * 0.1, time * 0.1) * 5
      );
      const localCenter = globalCenter.clone().add(noiseOffset);
      
      const cohesionForce = new THREE.Vector3()
        .subVectors(localCenter, p.position)
        .multiplyScalar(centeringFactor * boidWeight);
      p.acceleration.add(cohesionForce);

      // --- Rule 2: Alignment (Match velocity) ---
      const alignmentForce = new THREE.Vector3()
        .subVectors(globalVel, p.velocity)
        .multiplyScalar(matchingFactor * boidWeight);
      p.acceleration.add(alignmentForce);

      // --- Rule 3: Separation (Avoid crowding) ---
      const separation = new THREE.Vector3(
        noise3D(p.position.x * 0.2, p.position.y * 0.2, time * 0.5),
        noise3D(p.position.y * 0.2, p.position.z * 0.2, time * 0.5),
        noise3D(p.position.z * 0.2, p.position.x * 0.2, time * 0.5)
      ).multiplyScalar(avoidFactor); // Separation is always important
      p.acceleration.add(separation);

      // --- Soft Bounds (Turn back if too far) ---
      if (p.position.x < -BOUNDS) p.acceleration.x += turnFactor;
      if (p.position.x > BOUNDS) p.acceleration.x -= turnFactor;
      if (p.position.y < -BOUNDS) p.acceleration.y += turnFactor;
      if (p.position.y > BOUNDS) p.acceleration.y -= turnFactor;
      if (p.position.z < -BOUNDS) p.acceleration.z += turnFactor;
      if (p.position.z > BOUNDS) p.acceleration.z -= turnFactor;

      // --- Peace Mode Orbit ---
      if (globalPeaceMode) {
         const ringRadius = BOUNDS * 0.5;
         const ringSpeed = time * 2.0;
         const group = i % 2 === 0 ? 1 : -1;
         
         const targetPos = new THREE.Vector3(
           Math.cos(ringSpeed * group + i * 0.1) * ringRadius,
           p.position.y * 0.5, 
           Math.sin(ringSpeed * group + i * 0.1) * ringRadius
         );
         
         const centerDir = new THREE.Vector3().subVectors(targetPos, p.position);
         centerDir.normalize().multiplyScalar(0.05); // Strong orbit force
         p.acceleration.add(centerDir);
      }

      // Apply Physics
      p.velocity.add(p.acceleration);
      
      // Limit speed
      const currentSpeed = p.velocity.length();
      if (currentSpeed > maxSpeed) {
        p.velocity.normalize().multiplyScalar(maxSpeed);
      } else if (currentSpeed < maxSpeed * 0.5) {
        // Minimum speed to keep them flying
        p.velocity.normalize().multiplyScalar(maxSpeed * 0.5);
      }

      p.position.add(p.velocity);

      // Update Instance
      dummy.position.copy(p.position);
      
      // Smooth rotation
      const targetLook = new THREE.Vector3().copy(p.position).add(p.velocity);
      dummy.lookAt(targetLook);
      
      // Scale based on velocity (stretch when fast)
      const stretch = Math.min(2.0, 1.0 + currentSpeed);
      dummy.scale.set(0.3, 0.3, stretch * 0.8);
      
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Color Logic
      let targetColor = baseColor;
      if (isAttracted) targetColor = attractColor;
      else if (isRepelled) targetColor = repelColor;
      else if (localIsDirected) targetColor = new THREE.Color('#8b5cf6');
      else if (globalPeaceMode) targetColor = new THREE.Color('#ec4899');
      else if (volume > 0.1) targetColor = baseColor.clone().lerp(loudColor, volume);

      p.color.lerp(targetColor, 0.05);
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
