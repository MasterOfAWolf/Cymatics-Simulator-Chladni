// ============================================================
// CHLADNI 3D PARTICLE VISUALIZATION - THREE.JS
// ============================================================

const PI = Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clamp01 = (value) => clamp(value, 0, 1);
const randSigned = () => Math.random() * 2 - 1;

const chladni = (x, y, a, b, m, n) =>
  a * Math.sin(PI * n * x) * Math.sin(PI * m * y) +
  b * Math.sin(PI * m * x) * Math.sin(PI * n * y);

let scene, camera, renderer, particleSystem, particleGeometry, particleMaterial;
let fadeScene, fadeCamera, fadeQuad;
let particlePositions, particleVelocities, particleEnergies;
let particleTexture;
let sliders, m, n, a, b, v, N;

let cameraControl = {
  autoOrbit: true,
  mouseDown: false,
  previousMousePosition: { x: 0, y: 0 },
  rotation: { x: 0, y: 0 }
};

const settings = {
  surfaceSize: 10,
  particleMinCount: 2000,
  particleMaxCount: 100000,
  minWalk: 0.00005,
  settleThreshold: 0.12,
  attractionThreshold: 0.45,
  attractionStrength: 0.003,
  drag: 0.92,
  settleDrag: 0.84,
  depthJitter: 0.08,
  particleSize: 0.045,
  orbitRadius: 15,
  orbitSpeed: 0.00045,
  fadeStrength: 0.075
};

let activeParticleCount = 0;
const clock = new THREE.Clock();

const initThreeJS = () => {
  const container = document.getElementById('sketch-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Scene
  scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.Fog(0x050505, 18, 60);

  // Camera
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  camera.position.set(8, 6, 8);
  camera.lookAt(0, 0, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowShadowMap;
  container.appendChild(renderer.domElement);

  // Lights
  createLights();

  // Fade pass for trails
  createFadePass();

  // Particle system
  createParticleTexture();
  syncParticleSystem();

  // Event listeners
  window.addEventListener('resize', onWindowResize);
  container.addEventListener('mousedown', onMouseDown);
  container.addEventListener('mousemove', onMouseMove);
  container.addEventListener('mouseup', onMouseUp);
  container.addEventListener('wheel', onMouseWheel);

  // Start animation loop
  animate();
};

const onMouseDown = (event) => {
  cameraControl.mouseDown = true;
  cameraControl.autoOrbit = false;
  cameraControl.previousMousePosition = { x: event.clientX, y: event.clientY };
};

const onMouseMove = (event) => {
  if (!cameraControl.mouseDown) return;

  const deltaX = event.clientX - cameraControl.previousMousePosition.x;
  const deltaY = event.clientY - cameraControl.previousMousePosition.y;

  cameraControl.rotation.y += deltaX * 0.005;
  cameraControl.rotation.x += deltaY * 0.005;

  // Limit vertical rotation
  cameraControl.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraControl.rotation.x));

  cameraControl.previousMousePosition = { x: event.clientX, y: event.clientY };
};

const onMouseUp = () => {
  cameraControl.mouseDown = false;
  cameraControl.autoOrbit = true;
};

const onMouseWheel = (event) => {
  event.preventDefault();
  settings.orbitRadius += event.deltaY * 0.01;
  settings.orbitRadius = Math.max(8, Math.min(30, settings.orbitRadius));
};

const createLights = () => {
  // Ambient light - soft overall illumination
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  // Directional light - main light source (like sun)
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(15, 20, 15);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.left = -25;
  directionalLight.shadow.camera.right = 25;
  directionalLight.shadow.camera.top = 25;
  directionalLight.shadow.camera.bottom = -25;
  directionalLight.shadow.camera.near = 1;
  directionalLight.shadow.camera.far = 100;
  scene.add(directionalLight);

  // Point light - accent light for highlights
  const pointLight = new THREE.PointLight(0x88ccff, 0.6, 50);
  pointLight.position.set(-10, 10, 10);
  pointLight.castShadow = true;
  scene.add(pointLight);
};

const createFadePass = () => {
  fadeScene = new THREE.Scene();
  fadeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  fadeQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: settings.fadeStrength,
      depthWrite: false,
      depthTest: false
    })
  );
  fadeScene.add(fadeQuad);
};

const createParticleTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);

  particleTexture = new THREE.CanvasTexture(canvas);
  particleTexture.needsUpdate = true;
};

const createParticleMaterial = () => {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: particleTexture },
      uPixelRatio: { value: window.devicePixelRatio || 1 },
      uSize: { value: settings.particleSize },
      uGlowColorA: { value: new THREE.Color(0xffefcf) },
      uGlowColorB: { value: new THREE.Color(0xcaa06a) }
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uSize;
      uniform float uPixelRatio;
      attribute float energy;
      varying float vEnergy;
      varying vec3 vViewPosition;
      void main() {
        vEnergy = energy;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = mvPosition.xyz;
        float size = uSize * mix(0.8, 2.0, energy);
        gl_PointSize = size * uPixelRatio * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D uTexture;
      uniform vec3 uGlowColorA;
      uniform vec3 uGlowColorB;
      varying float vEnergy;
      varying vec3 vViewPosition;
      void main() {
        vec4 tex = texture2D(uTexture, gl_PointCoord);
        vec3 glowColor = mix(uGlowColorB, uGlowColorA, smoothstep(0.0, 1.0, vEnergy));
        float depthFade = clamp(1.0 - abs(vViewPosition.z) / 40.0, 0.25, 1.0);
        vec3 finalColor = glowColor * (0.45 + vEnergy * 0.65) * depthFade;
        gl_FragColor = vec4(finalColor, tex.a * (0.40 + vEnergy * 0.35));
      }
    `
  });
};

const createParticleSystem = (count) => {
  const particleCount = clamp(Math.floor(count), settings.particleMinCount, settings.particleMaxCount);
  const size = settings.surfaceSize;
  const halfSize = size * 0.5;

  if (particleSystem) {
    scene.remove(particleSystem);
    particleGeometry.dispose();
    particleMaterial.dispose();
  }

  particlePositions = new Float32Array(particleCount * 3);
  particleVelocities = new Float32Array(particleCount * 3);
  particleEnergies = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    const index = i * 3;
    particlePositions[index] = randSigned() * halfSize;
    particlePositions[index + 1] = randSigned() * 0.15;
    particlePositions[index + 2] = randSigned() * halfSize;

    particleVelocities[index] = randSigned() * 0.02;
    particleVelocities[index + 1] = randSigned() * 0.01;
    particleVelocities[index + 2] = randSigned() * 0.02;

    particleEnergies[i] = Math.random();
  }

  particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeometry.setAttribute('energy', new THREE.BufferAttribute(particleEnergies, 1));

  particleMaterial = createParticleMaterial();
  particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  particleSystem.frustumCulled = false;
  scene.add(particleSystem);

  activeParticleCount = particleCount;
};

const syncParticleSystem = () => {
  if (!N) return;
  const desiredCount = clamp(Math.floor(N), settings.particleMinCount, settings.particleMaxCount);
  if (desiredCount !== activeParticleCount) {
    createParticleSystem(desiredCount);
  }
};

const chladniSigned = (x, y) => chladni(x, y, a, b, m, n);

// Compute signed gradient of the raw chladni field (not abs) so
// particles are attracted smoothly toward f==0 (nodal lines).
const computeGradient = (x, y) => {
  const epsilon = 0.0125;
  const sampleX1 = chladniSigned(clamp01(x + epsilon), y);
  const sampleX0 = chladniSigned(clamp01(x - epsilon), y);
  const sampleY1 = chladniSigned(x, clamp01(y + epsilon));
  const sampleY0 = chladniSigned(x, clamp01(y - epsilon));
  return {
    x: (sampleX1 - sampleX0) * 0.5 / epsilon,
    y: (sampleY1 - sampleY0) * 0.5 / epsilon
  };
};

const wrapParticle = (value, halfSize) => {
  if (value < -halfSize) return value + settings.surfaceSize;
  if (value > halfSize) return value - settings.surfaceSize;
  return value;
};

const updateParticleSystem = (elapsedTime) => {
  const positions = particleGeometry.attributes.position.array;
  const energies = particleGeometry.attributes.energy.array;
  const size = settings.surfaceSize;
  const halfSize = size * 0.5;
  const count = activeParticleCount;

  for (let i = 0; i < count; i++) {
    const index = i * 3;
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];

    const normalizedX = (x + halfSize) / size;
    const normalizedZ = (z + halfSize) / size;
    // Signed field value and absolute magnitude
    const f = chladniSigned(normalizedX, normalizedZ);
    const field = Math.abs(f);
    // Make movement scale with vibration strength `v` (no large hard min walk)
    const movementAmplitude = Math.max(v * field, settings.minWalk);

    let velocityX = particleVelocities[index] * settings.drag;
    let velocityY = particleVelocities[index + 1] * settings.drag;
    let velocityZ = particleVelocities[index + 2] * settings.drag;

    if (field < settings.attractionThreshold) {
      const gradient = computeGradient(normalizedX, normalizedZ);
      const strength = (settings.attractionThreshold - field) / settings.attractionThreshold;
      const gradientMagnitude = Math.sqrt(gradient.x * gradient.x + gradient.y * gradient.y) + 1e-6;
      // Move down the gradient of f*f (i.e. toward f==0). Multiply by signed f
      // so direction respects the field sign and slides particles along nodal lines.
      velocityX -= (gradient.x / gradientMagnitude) * settings.attractionStrength * strength * f;
      velocityZ -= (gradient.y / gradientMagnitude) * settings.attractionStrength * strength * f;
    }

    // Random walk scaled by movementAmplitude so `v` controls particle agitation
    velocityX += randSigned() * movementAmplitude;
    velocityZ += randSigned() * movementAmplitude;

    if (field < settings.settleThreshold) {
      velocityX *= settings.settleDrag;
      velocityZ *= settings.settleDrag;
      velocityY *= settings.settleDrag;
    }

    const jitter = Math.sin(elapsedTime * 1.4 + i * 0.013) * settings.depthJitter;
    velocityY += jitter * 0.003;

    let nextX = x + velocityX;
    let nextY = lerp(y, field * 0.18 + jitter * 0.02, 0.12);
    let nextZ = z + velocityZ;

    nextX = wrapParticle(nextX, halfSize);
    nextZ = wrapParticle(nextZ, halfSize);

    particleVelocities[index] = velocityX;
    particleVelocities[index + 1] = velocityY;
    particleVelocities[index + 2] = velocityZ;

    positions[index] = nextX;
    positions[index + 1] = nextY;
    positions[index + 2] = nextZ;

    energies[i] = clamp01(1.0 - field);
  }

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.energy.needsUpdate = true;
};

const updateParams = () => {
  m = parseFloat(document.getElementById('mSlider').value);
  n = parseFloat(document.getElementById('nSlider').value);
  a = parseFloat(document.getElementById('aSlider').value);
  b = parseFloat(document.getElementById('bSlider').value);
  v = parseFloat(document.getElementById('vSlider').value);
  N = parseFloat(document.getElementById('numSlider').value);
  syncParticleSystem();
};

const updateCamera = () => {
  let posX, posY, posZ;

  if (cameraControl.autoOrbit) {
    // Smooth orbital camera
    const time = Date.now() * settings.orbitSpeed;
    const radius = settings.orbitRadius;
    
    posX = Math.cos(time) * radius;
    posY = 6 + Math.sin(time * 0.5) * 2;
    posZ = Math.sin(time) * radius;
  } else {
    // Manual mouse control - spherical coordinates
    const radius = settings.orbitRadius;
    posX = radius * Math.sin(cameraControl.rotation.x) * Math.sin(cameraControl.rotation.y);
    posY = radius * Math.cos(cameraControl.rotation.x) + 3;
    posZ = radius * Math.sin(cameraControl.rotation.x) * Math.cos(cameraControl.rotation.y);
  }

  camera.position.x = posX;
  camera.position.y = posY;
  camera.position.z = posZ;
  camera.lookAt(0, 0, 0);
};

const onWindowResize = () => {
  const container = document.getElementById('sketch-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  particleMaterial.uniforms.uPixelRatio.value = window.devicePixelRatio || 1;
};

const renderFade = () => {
  renderer.render(fadeScene, fadeCamera);
};

const animate = () => {
  requestAnimationFrame(animate);

  updateParams();
  const elapsedTime = clock.getElapsedTime();
  updateParticleSystem(elapsedTime);
  updateCamera();

  renderFade();
  renderer.render(scene, camera);
};

// ============================================================
// INITIALIZATION
// ============================================================

const DOMinit = () => {
  // Get slider references for easier access
  sliders = {
    m: document.getElementById('mSlider'),
    n: document.getElementById('nSlider'),
    a: document.getElementById('aSlider'),
    b: document.getElementById('bSlider'),
    v: document.getElementById('vSlider'),
    num: document.getElementById('numSlider'),
  };

  // Initialize Three.js scene
  initThreeJS();
};

// Run on DOM load
window.addEventListener('DOMContentLoaded', DOMinit);