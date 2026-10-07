'use client';
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';

const HoloShaderMaterial = shaderMaterial(
  {
    uTime: 0,
    uPointer: new THREE.Vector2(0.5, 0.5),
    uImage: null,
    uFinish: 0, // 0 base, 1 holo, 2 cracked, 3 gold
    uIntensity: 1,
  },
  // vertex
  `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      vUv = uv;
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vViewDir = normalize(-mvPos.xyz);
      gl_Position = projectionMatrix * mvPos;
    }
  `,
  // fragment
  `
    uniform float uTime;
    uniform vec2 uPointer;
    uniform sampler2D uImage;
    uniform float uFinish;
    uniform float uIntensity;
    
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    // Simplex noise
    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    float noise(vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);
      float a = random(i);
      float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0));
      float d = random(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    vec3 holoGradient(float t) {
      vec3 c1 = vec3(1.0, 0.3, 0.0); // orange
      vec3 c2 = vec3(0.0, 0.9, 1.0); // cyan
      vec3 c3 = vec3(1.0, 0.9, 0.0); // yellow
      vec3 c4 = vec3(1.0, 0.0, 0.9); // magenta
      float t2 = fract(t);
      if(t2 < 0.33) return mix(c1, c2, t2/0.33);
      else if(t2 < 0.66) return mix(c2, c3, (t2-0.33)/0.33);
      else return mix(c3, c4, (t2-0.66)/0.34);
    }

    void main() {
      vec2 uv = vUv;
      vec2 pointer = uPointer;
      
      // Base image
      vec4 img = texture2D(uImage, uv);
      
      // Fresnel
      float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 3.0);
      
      // Pointer influence
      float dist = distance(uv, pointer);
      float pointerGlow = 1.0 - smoothstep(0.0, 0.6, dist);
      
      vec3 finalColor = img.rgb;
      
      if(uFinish > 0.5 && uFinish < 1.5) {
        // HOLO
        float angle = atan(uv.y - pointer.y, uv.x - pointer.x);
        float holo = sin(angle * 6.0 + uTime * 0.5 + dist * 10.0) * 0.5 + 0.5;
        vec3 holoCol = holoGradient(holo + uTime * 0.05 + pointer.x);
        float holoMask = fresnel * 0.8 + pointerGlow * 0.6 + 0.1;
        holoMask *= (0.5 + noise(uv * 8.0 + uTime * 0.1) * 0.5);
        finalColor = mix(finalColor, holoCol, holoMask * 0.7 * uIntensity);
        finalColor += holoCol * fresnel * 0.4 * uIntensity;
      } 
      else if(uFinish > 1.5 && uFinish < 2.5) {
        // CRACKED ICE
        vec2 crackedUv = uv * 12.0;
        float n = noise(crackedUv);
        float cracks = smoothstep(0.3, 0.31, fract(n * 10.0));
        vec3 ice = vec3(0.8, 0.9, 1.0);
        float iceMask = (1.0 - cracks) * 0.3 + fresnel * 0.5;
        finalColor = mix(finalColor, ice, iceMask * 0.4);
        // Add crack lines white
        finalColor += vec3(1.0) * (1.0 - cracks) * 0.15 * pointerGlow;
        finalColor += vec3(1.0) * fresnel * 0.3;
      }
      else if(uFinish > 2.5) {
        // GOLD
        vec3 gold1 = vec3(1.0, 0.84, 0.0);
        vec3 gold2 = vec3(0.85, 0.65, 0.13);
        vec3 goldGrad = mix(gold2, gold1, sin(uv.y * 3.0 + uTime * 0.2) * 0.5 + 0.5);
        float goldMask = fresnel * 0.9 + pointerGlow * 0.5;
        goldMask += noise(uv * 20.0) * 0.1;
        finalColor = mix(finalColor, goldGrad, goldMask * 0.5 * uIntensity);
        finalColor += goldGrad * fresnel * 0.6;
      }
      
      // Vignette + micro scratches
      float vignette = 1.0 - smoothstep(0.5, 1.2, length(uv - 0.5) * 1.5);
      finalColor *= 0.85 + vignette * 0.15;
      
      // Subtle scanline
      float scan = sin(uv.y * 800.0) * 0.02 + 0.98;
      finalColor *= scan;
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
);

extend({ HoloShaderMaterial });

// @ts-ignore
declare global {
  namespace JSX {
    interface IntrinsicElements {
      holoShaderMaterial: any;
    }
  }
}

export { HoloShaderMaterial };
