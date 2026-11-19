/* The Moon and Mars on the Explore page: the archive's three.js globe.
 * The Moon/Mars maps are by Solar System Scope (CC BY 4.0), based on NASA
 * imagery and elevation data. Desktop uses the 8K maps for the close approach;
 * smaller screens keep the 4K maps to bound GPU memory.
 *
 * GlobeView owns the actual scene. The methods added here only steer its
 * existing camera and globe group: a selected landing site is brought to the
 * centre of the circular stage, then the camera dollies toward it without
 * leaving the sphere's useful texture scale. The asteroid belt gets its own
 * lateral approach because its two bodies are rocks, not a globe.
 */
import { GlobeView } from './globe-viewer.js';

const DEG = Math.PI / 180;
const HALF_FOV = 15 * DEG;
const FINAL_SURFACE_DISTANCE = 1.55;
const MAX_PITCH = 1.45;
const ORBIT_PITCH = 0.1;

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function easeInOutCubic(value) {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smootherstep(value) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function shortestAngle(from, to) {
  let delta = (to - from + Math.PI) % (Math.PI * 2);
  if (delta < 0) delta += Math.PI * 2;
  return delta - Math.PI;
}

/* The equirectangular coordinate used by GlobeView's sphere. */
function surfaceVector(lat, lon) {
  const theta = (90 - lat) * DEG;
  const phi = (lon + 180) * DEG;
  return {
    x: -Math.sin(theta) * Math.cos(phi),
    y: Math.cos(theta),
    z: Math.sin(theta) * Math.sin(phi)
  };
}

function orbitAngles(lat, lon) {
  const p = surfaceVector(lat, lon);
  return {
    yaw: Math.atan2(-p.x, p.z),
    pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, Math.atan2(p.y, Math.hypot(p.x, p.z))))
  };
}

GlobeView.prototype.cancelFlight = function () {
  if (this._flightRaf) {
    cancelAnimationFrame(this._flightRaf);
    this._flightRaf = 0;
  }
};

GlobeView.prototype.lockInput = function (locked) {
  this.locked = !!locked;
  if (locked) this.dragging = false;
  if (locked && !this._inputGuard) {
    const guard = (event) => {
      if (!this.locked) return;
      event.stopImmediatePropagation();
      event.preventDefault();
    };
    this._inputGuard = guard;
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave'].forEach((name) => {
      this.canvas.addEventListener(name, guard, true);
    });
  }
};

GlobeView.prototype.tuneQuality = function () {
  const renderer = this.renderer;
  if (!renderer) return;
  const maxAnisotropy = Math.min(16, (renderer.capabilities && renderer.capabilities.getMaxAnisotropy()) || 8);
  const maps = [
    this.moon && this.moon.material && this.moon.material.map,
    this.moon && this.moon.material && this.moon.material.bumpMap,
    this.mars && this.mars.material && this.mars.material.map,
    this.mars && this.mars.material && this.mars.material.bumpMap
  ];
  maps.forEach((texture) => {
    if (texture) {
      texture.anisotropy = maxAnisotropy;
      texture.needsUpdate = true;
    }
  });
  if (this.moon && this.moon.material) this.moon.material.bumpScale = 0.04;
  if (this.mars && this.mars.material && this.mars.material.bumpMap) this.mars.material.bumpScale = 0.012;
  // The flat blue sprite behind the Moon reads as a hard-edged halo once the
  // camera gets close. The surface itself is the glow; keep the sprite out.
  if (this.halo) {
    this.halo.visible = false;
    if (this.halo.material) this.halo.material.opacity = 0;
  }
  this.camera.near = 0.08;
  this.camera.far = 80;
  this.camera.updateProjectionMatrix();
  renderer.toneMappingExposure = 1.06;
};

GlobeView.prototype.focusLocation = function (lat, lon, id, options) {
  const opts = options || {};
  if (this.world === 'Asteroid belt') {
    this.focusAsteroid(id, opts);
    return;
  }
  this.cancelFlight();
  if (this._savedSpin === undefined) this._savedSpin = this.spin;
  this.spin = 0;
  this.sway = 0;
  this.lockInput(true);

  const target = orbitAngles(lat, lon);
  const fromYaw = this.yaw;
  const fromPitch = this.pitch;
  const deltaYaw = shortestAngle(fromYaw, target.yaw);
  const deltaPitch = target.pitch - fromPitch;
  const duration = this.reduced ? 0 : (opts.duration || 900);
  const self = this;

  const apply = (progress) => {
    const eased = easeInOutCubic(progress);
    self.yaw = fromYaw + deltaYaw * eased;
    self.pitch = fromPitch + deltaPitch * eased;
    self.camera.position.x = 0;
    self.camera.position.y = 0;
    self.camera.lookAt(0, 0, 0);
    self.draw();
  };

  if (!duration) {
    apply(1);
    this.lockInput(false);
    if (opts.onDone) opts.onDone();
    return;
  }

  const startedAt = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    apply(progress);
    if (progress < 1) {
      this._flightRaf = requestAnimationFrame(tick);
    } else {
      this._flightRaf = 0;
      this.lockInput(false);
      if (opts.onDone) opts.onDone();
    }
  };
  this._flightRaf = requestAnimationFrame(tick);
};

GlobeView.prototype.focusAsteroid = function (id, options) {
  const opts = options || {};
  this.cancelFlight();
  const body = this.asteroidBody(id);
  if (!body) {
    if (opts.onDone) opts.onDone();
    return;
  }
  if (!body.holder) {
    const self = this;
    setTimeout(() => self.focusAsteroid(id, opts), 100);
    return;
  }

  if (this._savedSpin === undefined) this._savedSpin = this.spin;
  this.spin = 0;
  this.lockInput(true);

  const startZ = this.camera.position.z;
  const endZ = Math.max(1.9, startZ * 0.78);
  const target = body.root.position.clone();
  const duration = this.reduced ? 0 : (opts.duration || 800);
  const self = this;

  const apply = (progress) => {
    const eased = easeInOutCubic(progress);
    self.camera.position.x = 0;
    self.camera.position.y = 0;
    self.camera.position.z = startZ + (endZ - startZ) * eased;
    const look = target.clone().multiplyScalar(eased);
    self.camera.lookAt(look.x, look.y, look.z);
    self.draw();
  };

  if (!duration) {
    apply(1);
    this.lockInput(false);
    if (opts.onDone) opts.onDone();
    return;
  }

  const startedAt = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    apply(progress);
    if (progress < 1) {
      this._flightRaf = requestAnimationFrame(tick);
    } else {
      this._flightRaf = 0;
      this.lockInput(false);
      if (opts.onDone) opts.onDone();
    }
  };
  this._flightRaf = requestAnimationFrame(tick);
};

GlobeView.prototype.asteroidBody = function (id) {
  if (!this.asteroids) return null;
  for (let i = 0; i < this.asteroids.length; i += 1) {
    if (this.asteroids[i].def && this.asteroids[i].def.id === id) return this.asteroids[i];
  }
  return null;
};

GlobeView.prototype.travelTo = function (lat, lon, id, options) {
  if (this.world === 'Asteroid belt') {
    this.travelToAsteroid(id, options);
    return;
  }

  const opts = options || {};
  this.cancelFlight();
  if (this._savedSpin === undefined) this._savedSpin = this.spin;
  this.spin = 0;
  this.lockInput(true);

  const target = orbitAngles(lat, lon);
  const fromYaw = this.yaw;
  const fromPitch = this.pitch;
  const deltaYaw = shortestAngle(fromYaw, target.yaw);
  const deltaPitch = target.pitch - fromPitch;
  const startZ = this.camera.position.z;
  const frameZ = Math.max(startZ * 0.965, 3.87);
  const endZ = Math.max(FINAL_SURFACE_DISTANCE, frameZ * 0.35);
  const duration = this.reduced ? 0 : (opts.duration || 2600);
  const self = this;

  const apply = (progress) => {
    const turn = easeInOutCubic(clamp01(progress / 0.34));
    self.yaw = fromYaw + deltaYaw * turn;
    self.pitch = fromPitch + deltaPitch * turn;

    const zoom = clamp01((progress - 0.04) / 0.96);
    let z;
    if (zoom < 0.18) {
      z = startZ + (frameZ - startZ) * easeInOutCubic(zoom / 0.18);
    } else {
      z = frameZ + (endZ - frameZ) * smootherstep((zoom - 0.18) / 0.82);
    }
    self.camera.position.x = 0;
    self.camera.position.y = 0;
    self.camera.position.z = z;
    self.camera.lookAt(0, 0, 0);
    self.draw();
    if (opts.onProgress) opts.onProgress(progress, z);
  };

  if (!duration) {
    apply(1);
    this.lockInput(false);
    if (opts.onDone) opts.onDone();
    return;
  }

  const startedAt = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    apply(progress);
    if (progress < 1) {
      this._flightRaf = requestAnimationFrame(tick);
    } else {
      this._flightRaf = 0;
      this.lockInput(false);
      if (opts.onDone) opts.onDone();
    }
  };
  this._flightRaf = requestAnimationFrame(tick);
};

GlobeView.prototype.travelToAsteroid = function (id, options) {
  const opts = options || {};
  this.cancelFlight();
  const body = this.asteroidBody(id);
  if (!body) {
    if (opts.onDone) opts.onDone();
    return;
  }
  if (!body.holder) {
    const self = this;
    setTimeout(() => self.travelToAsteroid(id, opts), 100);
    return;
  }

  if (this._savedSpin === undefined) this._savedSpin = this.spin;
  this.spin = 0;
  this.lockInput(true);

  const startZ = this.camera.position.z;
  const target = body.root.position.clone();
  const endZ = Math.max(1.5, body.radius * 4.8);
  const endX = target.x * 0.82;
  const endY = target.y * 0.82;
  const duration = this.reduced ? 0 : (opts.duration || 2300);
  const self = this;

  const apply = (progress) => {
    const eased = smootherstep(progress);
    self.camera.position.x = endX * eased;
    self.camera.position.y = endY * eased;
    self.camera.position.z = startZ + (endZ - startZ) * eased;
    const look = target.clone().multiplyScalar(eased);
    self.camera.lookAt(look.x, look.y, look.z);
    self.draw();
    if (opts.onProgress) opts.onProgress(progress);
  };

  if (!duration) {
    apply(1);
    this.lockInput(false);
    if (opts.onDone) opts.onDone();
    return;
  }

  const startedAt = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    apply(progress);
    if (progress < 1) {
      this._flightRaf = requestAnimationFrame(tick);
    } else {
      this._flightRaf = 0;
      this.lockInput(false);
      if (opts.onDone) opts.onDone();
    }
  };
  this._flightRaf = requestAnimationFrame(tick);
};

GlobeView.prototype.resetView = function () {
  this.cancelFlight();
  this.lockInput(false);
  this.dragging = false;
  this.sway = 0;
  this.yaw = this.baseYaw;
  this.pitch = ORBIT_PITCH;
  this.camera.position.set(0, 0, this.distanceFor());
  this.camera.lookAt(0, 0, 0);
  this.camera.near = 0.08;
  this.camera.far = 80;
  this.camera.updateProjectionMatrix();
  if (this._savedSpin !== undefined) {
    this.spin = this._savedSpin;
    this._savedSpin = undefined;
  }
  this.draw();
};

// applyWorld runs again whenever the Moon/Mars/belt changes; keep the halo
// suppressed after that repaint as well.
const baseApplyWorld = GlobeView.prototype.applyWorld;
GlobeView.prototype.applyWorld = function () {
  baseApplyWorld.call(this);
  if (this.halo) {
    this.halo.visible = false;
    if (this.halo.material) this.halo.material.opacity = 0;
  }
};

window.SolvixGlobe = GlobeView;
window.dispatchEvent(new Event('solvix:globe-ready'));
