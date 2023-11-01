const VertexShader = `const vertexShader = \`
varying vec2 vUv;

void main() {
  vUv = uv;

  vec4 modelPosition = modelMatrix * vec4(position, 1.0);
  vec4 viewPosition = viewMatrix * modelPosition;
  vec4 projectedPosition = projectionMatrix * viewPosition;

  gl_Position = projectedPosition;
}
\`

export default vertexShader
`;

const FragmentShader = `const fragmentShader = \`
               
uniform float uTime;
uniform vec2 uResolution;
uniform sampler2D uNoise;

#define MAX_STEPS 100
#define PI 3.14159265359

mat2 rotate2D(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

float nextStep(float t, float len, float smo) {
  float tt = mod(t += smo, len);
  float stp = floor(t / len) - 1.0;
  return smoothstep(0.0, smo, tt) + stp;
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 ab = b - a;
  vec3 ap = p - a;

  float t = dot(ab, ap) / dot(ab, ab);
  t = clamp(t, 0.0, 1.0);

  vec3 c = a + t * ab;

  float d = length(p - c) - r;

  return d;
}

float sdSphere(vec3 p, float radius) {
  return length(p) - radius;
}

float sdTorus(vec3 p, vec2 r) {
  float x = length(p.xz) - r.x;
  return length(vec2(x, p.y)) - r.y;
}

float sdCross(vec3 p, float s) {
  float da = max(abs(p.x), abs(p.y));
  float db = max(abs(p.y), abs(p.z));
  float dc = max(abs(p.z), abs(p.x));

  return min(da, min(db, dc)) - s;
}

float noise( in vec3 x ) {
  vec3 p = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  vec2 uv = (p.xy + vec2(37.0, 239.0) * p.z) + f.xy;
  vec2 tex = textureLod(uNoise, (uv+0.5) / 256.0, 0.0).yx;

  return mix(tex.x, tex.y, f.z) * 2.0 - 1.0;
}

float fbm(vec3 p) {
  vec3 q = p + uTime * 0.5 * vec3(1.0, -0.2, -1.0);
  float g = noise(q);

  float f = 0.0;
  float scale = 0.25;
  float factor = 2.02;

  for (int i = 0; i < 6; i++) {
    f += scale * noise(q);
    q *= factor;
    factor += 0.21;
    scale *= 0.5;
  }

  return f;
}

float scene(vec3 p) {
  vec3 p1 = p;
  p1.xz *= rotate2D(-PI * 0.1);
  p1.yz *= rotate2D(PI * 0.3);
  
  float s1 = sdTorus(p1, vec2(1.3, 0.9));
  float s2 = sdCross(p1 * 2.0, 0.6);
  float s3 = sdSphere(p, 1.5);
  float s4 = sdCapsule(p, vec3(-2.0, -1.5, 0.0), vec3(2.0, 1.5, 0.0), 1.0);

  float t = mod(nextStep(uTime, 3.0, 1.2), 4.0);

  float distance = mix(s1, s2, clamp(t, 0.0, 1.0));
  distance = mix(distance, s3, clamp(t - 1.0, 0.0, 1.0));
  distance = mix(distance, s4, clamp(t - 2.0, 0.0, 1.0));
  distance = mix(distance, s1, clamp(t - 3.0, 0.0, 1.0));

  float f = fbm(p);

  return -distance + f;
}

const vec3 SUN_POSITION = vec3(1.0, 0.0, 0.0);
const float MARCH_SIZE = 0.08;

vec4 raymarch(vec3 rayOrigin, vec3 rayDirection) {
  float depth = 0.0;
  vec3 p = rayOrigin + depth * rayDirection;
  vec3 sunDirection = normalize(SUN_POSITION);

  vec4 res = vec4(0.0);

  for (int i = 0; i < MAX_STEPS; i++) {
    float density = scene(p);

    // We only draw the density if it's greater than 0
    if (density > 0.0) {
      // Directional derivative
      // For fast diffuse lighting
      float diffuse = clamp((scene(p) - scene(p + 0.3 * sunDirection))/0.3, 0.0, 1.0 );
      vec3 lin = vec3(0.60,0.60,0.75) * 1.1 + 0.8 * vec3(1.0,0.6,0.3) * diffuse;
      vec4 color = vec4(mix(vec3(1.0,1.0,1.0), vec3(0.0, 0.0, 0.0), density), density );
      color.rgb *= lin;
      color.rgb *= color.a;
      res += color*(1.0-res.a);
    }

    depth += MARCH_SIZE;
    p = rayOrigin + depth * rayDirection;
  }

  return res;
}

void main() {
  vec2 uv = gl_FragCoord.xy/uResolution.xy;
  uv -= 0.5;
  uv.x *= uResolution.x / uResolution.y;

  // Ray Origin - camera
  vec3 ro = vec3(0.0, 0.0, 5.0);
  // Ray Direction
  vec3 rd = normalize(vec3(uv, -1.0));
  
  vec3 color = vec3(0.0);

  // Sun and Sky
  vec3 sunDirection = normalize(SUN_POSITION);
  float sun = clamp(dot(sunDirection, rd), 0.0, 1.0 );
  // Base sky color
  color = vec3(0.7,0.7,0.90);
  // Add vertical gradient
  color -= 0.8 * vec3(0.90,0.75,0.90) * rd.y;
  // Add sun color to sky
  color += 0.5 * vec3(1.0,0.5,0.3) * pow(sun, 10.0);

  // Cloud
  vec4 res = raymarch(ro, rd);
  color = color * (1.0 - res.a) + res.rgb;

  gl_FragColor = vec4(color, 1.0);
}
\`

export default fragmentShader;
`;

const AppCode = `import { useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef, Suspense } from "react";
import * as THREE from "three";
import { v4 as uuidv4 } from "uuid";
import './scene.css';

import vertexShader from './vertexShader';
import fragmentShader from './fragmentShader'; 

const DPR = 1;
// Noise Texture
const NOISE_TEXTURE_URL = "https://res.cloudinary.com/dg5nsedzw/image/upload/v1697157133/noise2.png";

const Raymarching = () => {
  const mesh = useRef();
  const { viewport } = useThree();

  const noisetexture = useTexture(NOISE_TEXTURE_URL);
  noisetexture.wrapS = THREE.RepeatWrapping;
  noisetexture.wrapT = THREE.RepeatWrapping;

  noisetexture.minFilter = THREE.NearestMipmapLinearFilter;
  noisetexture.magFilter = THREE.NearestMipmapLinearFilter;

  const uniforms = {
    uTime: new THREE.Uniform(0.0),
    uResolution: new THREE.Uniform(new THREE.Vector2()),
    uNoise: new THREE.Uniform(null),
  };

  useFrame((state) => {
    const { clock } = state;
    mesh.current.material.uniforms.uTime.value = clock.getElapsedTime();
    mesh.current.material.uniforms.uResolution.value = new THREE.Vector2(
      window.innerWidth * DPR,
      window.innerHeight * DPR
    );
    mesh.current.material.uniforms.uNoise.value = noisetexture;
  });

  return (
    <mesh ref={mesh} scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        key={uuidv4()}
        fragmentShader={fragmentShader}
        vertexShader={vertexShader}
        uniforms={uniforms}
      />
    </mesh>
  );
};

const Scene = () => {
  return (
    <Canvas camera={{ position: [0, 0, 6] }} dpr={DPR}>
      <Suspense fallback={null}>
        <Raymarching />
      </Suspense>
    </Canvas>
  );
};


export default Scene;
`;

const MorphingCloud = {
  '/App.js': {
    code: AppCode,
  },
  '/fragmentShader.js': {
    code: FragmentShader,
    active: true,
  },
  '/vertexShader.js': {
    code: VertexShader,
  },
};

export default MorphingCloud;