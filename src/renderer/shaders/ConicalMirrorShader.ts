// ============================================================
// Conical Mirror Shader - Simulates 360° view from conical mirror
// ============================================================

import * as THREE from 'three';

// Conical mirror distortion shader
// Simulates the view from a camera looking up at a conical mirror
export const ConicalMirrorShader = {
  uniforms: {
    tDiffuse: { value: null }, // Will be set to cube texture
    mirrorAngle: { value: Math.PI / 4 }, // 45 degrees cone angle
    distortion: { value: 1.5 }, // Distortion strength
    debugMode: { value: 0 }, // 0=normal, 1=show elevation, 2=show azimuth, 3=show direction, 4=raw cube map
    robotRotation: { value: 0.0 }, // Robot's heading angle in radians (for rotating cube map to robot's frame)
  },

  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    #ifdef GL_ES
    precision mediump float;
    #endif
    
    uniform samplerCube tDiffuse; // Cube map texture
    uniform float mirrorAngle;
    uniform float distortion;
    uniform float debugMode;
    uniform float robotRotation; // Robot's heading angle
    varying vec2 vUv;
    
    void main() {
      // Quick test: if cube texture is null/invalid, show test pattern
      // (This shouldn't happen, but helps debug)
      
      // Convert UV to polar coordinates (centered at 0.5, 0.5)
      vec2 center = vec2(0.5, 0.5);
      vec2 coord = vUv - center;
      
      // Distance from center (0 to ~0.707 for corners)
      float r = length(coord);
      
      // Normalize radius to 0-1 range (divide by max radius ~0.707)
      float maxRadius = 0.707;
      float normalizedR = clamp(r / maxRadius, 0.0, 1.0);
      
      // Mirror coverage: circular area (typically covers most of the view)
      // Areas outside the mirror show blue (camera housing/no reflection)
      float mirrorRadius = 0.95; // Mirror covers 95% of the circular view
      bool outsideMirror = normalizedR > mirrorRadius;
      
      // If outside mirror area, show blue
      if (outsideMirror) {
        // Blue color for areas without mirror reflection
        gl_FragColor = vec4(0.1, 0.2, 0.4, 1.0); // Dark blue
        return;
      }
      
      // Map circular mirror coordinates to equirectangular UV space
      // Use the EXACT same calculation as raw cube map mode (mode 5)
      
      // Angle around center (0 to 2*PI)
      // atan(y, x): right (x>0, y=0) = 0, top (x=0, y<0) = -π/2, left (x<0, y=0) = π, bottom (x=0, y>0) = π/2
      float theta = atan(coord.y, coord.x);
      
      // Map circular mirror to equirectangular UV:
      // - Theta (angle around circle) -> longitude (wraps around horizontally)
      // - Normalized radius -> latitude (vertical, focused on horizon)
      // 
      // For conical mirror:
      // - Center (r=0): horizon around robot (latitude = π/2, UV.y = 0.5)
      // - Edges (r=1): slightly above horizon (latitude < π/2, UV.y < 0.5)
      // 
      // Map theta to longitude: top of screen (theta=-π/2) should be forward
      // In mode 5: forward is at longitudeAdjusted=0, which is longitude=π/2, which is UV.x=0.25
      // So: theta=-π/2 (top) -> UV.x=0.25 (forward)
      //     theta=0 (right) -> UV.x=0.5 (right side)
      //     theta=π/2 (bottom) -> UV.x=0.75 (back)
      //     theta=π (left) -> UV.x=0.0 or 1.0 (left side)
      // Formula: UV.x = (theta + π/2) / (2π) + 0.25, wrapped
      float equirectU = (theta + 1.5708) / 6.28318 + 0.25; // Map theta to UV.x, shifted so top is forward
      equirectU = mod(equirectU, 1.0); // Wrap around [0, 1]
      
      // Map normalized radius to latitude (UV.y)
      // For conical mirror: center (apex) reflects what's above, edges reflect horizon
      // Center (r=0): slightly above horizon (latitude ≈ 75°, UV.y ≈ 0.4167) - shows field around robot
      // Edges (r=1): horizon (latitude = π/2 = 90°, UV.y = 0.5) - shows horizon further out
      // Focus on horizon: UV.y from 0.4167 (75°) to 0.5 (90°)
      float distortionFactor = 1.0 + distortion * normalizedR * normalizedR;
      float minLatitudeUV = 0.4167; // ~75° = π/2 - 15° = 1.3088 rad / π = 0.4167
      float maxLatitudeUV = 0.5;    // 90° = π/2 = 1.5708 rad / π = 0.5
      float latitudeRangeUV = maxLatitudeUV - minLatitudeUV;
      
      // Center (r=0) = slightly above horizon (minLatitudeUV), edges (r=1) = horizon (maxLatitudeUV)
      // CORRECT: center has lower latitude (slightly above), edges have higher latitude (horizon)
      float equirectV = minLatitudeUV + (normalizedR * distortionFactor * latitudeRangeUV);
      equirectV = clamp(equirectV, minLatitudeUV, maxLatitudeUV);
      
      // Now use EXACT same calculation as raw cube map mode (mode 5)
      vec2 equirectUV = vec2(equirectU, equirectV);
      float longitude = equirectUV.x * 6.28318; // 0 to 2π
      float latitude = equirectUV.y * 3.14159;  // 0 to π
      float longitudeAdjusted = longitude - 1.5708; // Rotate so 0° is forward
      
      vec3 direction = vec3(
        sin(latitude) * cos(longitudeAdjusted),  // X (right)
        cos(latitude),                           // Y (up when latitude=0)
        sin(latitude) * sin(longitudeAdjusted)   // Z (forward when longitudeAdjusted=0)
      );
      
      // Rotate direction to match robot's heading
      // Robot rotation is around Y axis (yaw)
      float cosRot = cos(robotRotation);
      float sinRot = sin(robotRotation);
      vec3 rotatedDir = vec3(
        direction.x * cosRot - direction.z * sinRot,  // Rotate X/Z around Y
        direction.y,
        direction.x * sinRot + direction.z * cosRot
      );
      
      // Normalize to ensure unit length
      float len = length(rotatedDir);
      if (len > 0.001) {
        rotatedDir = rotatedDir / len;
      } else {
        // Fallback: point forward
        rotatedDir = vec3(0.0, 0.0, 1.0);
      }
      
      direction = rotatedDir;
      
      // Debug modes - check early to skip mirror area restrictions
      if (debugMode > 3.5) {
        // Mode 5: Show raw cube map without distortion (equirectangular projection)
        // Map UV directly to cube map - show full view, not just circular mirror area
        // Three.js cube map: +X=right, +Y=up, +Z=forward
        vec2 equirectUV = vUv;
        
        // Equirectangular projection:
        // UV.x (0 to 1) -> longitude/azimuth (0 to 2π) - wraps around horizontally
        // UV.y (0 to 1) -> latitude/polar angle (0 to π) - 0=top (north pole/up), π=bottom (south pole/down)
        float longitude = equirectUV.x * 6.28318; // 0 to 2π (azimuth - left to right)
        float latitude = equirectUV.y * 3.14159;  // 0 to π (polar angle - top to bottom)
        
        // Convert equirectangular to 3D direction vector
        // Standard formula: 
        // x = sin(latitude) * cos(longitude)
        // y = cos(latitude)  (up when latitude=0)
        // z = sin(latitude) * sin(longitude)
        // But we need to align with Three.js: +X=right, +Y=up, +Z=forward
        // Rotate longitude so that longitude=0 maps to forward (+Z)
        float longitudeAdjusted = longitude - 1.5708; // Rotate -90° so 0° is forward
        
        vec3 equirectDir = vec3(
          sin(latitude) * cos(longitudeAdjusted),  // X (right)
          cos(latitude),                           // Y (up when latitude=0)
          sin(latitude) * sin(longitudeAdjusted)   // Z (forward when longitudeAdjusted=0)
        );
        
        // Rotate direction to match robot's heading
        // Robot rotation is around Y axis (yaw)
        float cosRot = cos(robotRotation);
        float sinRot = sin(robotRotation);
        vec3 rotatedDir = vec3(
          equirectDir.x * cosRot - equirectDir.z * sinRot,  // Rotate X/Z around Y
          equirectDir.y,
          equirectDir.x * sinRot + equirectDir.z * cosRot
        );
        
        // Normalize direction
        rotatedDir = normalize(rotatedDir);
        
        // Sample cube map
        #ifdef GL_ES
        vec4 color = textureCube(tDiffuse, rotatedDir);
        #else
        vec4 color = texture(tDiffuse, rotatedDir);
        #endif
        
        // Clamp to valid range
        color = clamp(color, 0.0, 1.0);
        gl_FragColor = color;
        return;
      }
      
      // Other debug modes (still respect mirror area)
      if (debugMode > 0.5) {
        if (debugMode < 1.5) {
          // Mode 1: Show latitude as color (red = horizon, blue = up)
          float latNorm = (equirectV - minLatitudeUV) / latitudeRangeUV; // Normalize to 0-1
          gl_FragColor = vec4(latNorm, 0.0, 1.0 - latNorm, 1.0);
          return;
        } else if (debugMode < 2.5) {
          // Mode 2: Show azimuth/longitude as color (rainbow around circle)
          float azNorm = equirectU; // Already normalized to 0-1
          gl_FragColor = vec4(
            abs(azNorm * 3.0 - 1.0),
            abs(azNorm * 3.0 - 2.0),
            abs(azNorm * 3.0 - 3.0),
            1.0
          );
          return;
        } else if (debugMode < 3.5) {
          // Mode 3: Show direction vector as RGB (x=R, y=G, z=B)
          vec3 dirNorm = normalize(direction);
          gl_FragColor = vec4(
            dirNorm.x * 0.5 + 0.5,
            dirNorm.y * 0.5 + 0.5,
            dirNorm.z * 0.5 + 0.5,
            1.0
          );
          return;
        }
      }
      
      // Sample from cube map (textureCube for WebGL 1.0, texture for WebGL 2.0)
      // Ensure direction is normalized and valid
      if (length(direction) < 0.001) {
        // Invalid direction - show red for debugging
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        return;
      }
      
      direction = normalize(direction);
      
      // Check if cube texture is valid
      #ifdef GL_ES
      vec4 color = textureCube(tDiffuse, direction);
      #else
      vec4 color = texture(tDiffuse, direction);
      #endif
      
      // Check if cube map sample is valid (not all black)
      // If it's black, it might be a sampling issue, but don't show debug color
      // Just use the black color as-is (might be valid black in scene)
      
      // Clamp color values to valid range (0-1)
      color = clamp(color, 0.0, 1.0);
      
      // Increase brightness (make camera view brighter)
      color.rgb *= 1.5; // Increase brightness by 50%
      
      // Add slight vignette effect at mirror edges (less aggressive)
      float vignette = 1.0 - (normalizedR / mirrorRadius) * 0.2;
      color.rgb *= vignette;
      
      gl_FragColor = color;
    }
  `,
};
