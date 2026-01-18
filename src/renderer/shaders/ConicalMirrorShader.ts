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
      
      // ===================================================================
      // CONICAL MIRROR MAPPING
      // ===================================================================
      // For a conical mirror:
      // - The center of the view (r=0) reflects what's around the robot at the horizon
      // - The edges (r=1) reflect what's slightly above the horizon
      // - Angle around the circle (theta) maps to azimuth (direction around robot)
      //
      // Physical setup:
      // - Camera is 15cm off floor, looking up
      // - Mirror apex is 4cm above camera (19cm off floor)
      // - Mirror shows field around robot (horizon level)
      
      // Get angle around circle (azimuth)
      // atan(y, x): right = 0°, top = -90°, left = ±180°, bottom = 90°
      float theta = atan(coord.y, coord.x);
      
      // Map radius to elevation angle based on SIMPLE CONICAL MIRROR GEOMETRY
      // 
      // Physical setup:
      // - Mirror: 5cm diameter (2.5cm radius), 1.5cm depth (height above camera lens)
      // - Cone half-angle: tan⁻¹(2.5/1.5) ≈ 59° (slope of mirror surface)
      // - Camera looking UP at mirror apex
      //
      // Simple non-curved conical mirror:
      // - Linear relationship: radius position maps linearly to elevation angle
      // - Center of image (r=0, mirror apex): reflects HORIZON (distant objects at 0°)
      // - Edges of image (r=1, mirror base): reflects GROUND near robot
      // - Elevation angle = -atan(radius/depth) = -atan(2.5/1.5) ≈ -59° at edges
      //
      // Linear mapping (no power curve): r directly maps to elevation
      // Center (r=0): horizon (0°)
      // Edges (r=1): ground near robot (-59°)
      float minElevation = 0.0;      // 0° (center - horizon, sees distant goals)
      float maxElevation = -1.0304;  // -59° (edges - atan(2.5/1.5), sees ground objects)
      // Simple linear mapping: no power curve, direct relationship
      float elevation = minElevation + normalizedR * (maxElevation - minElevation);
      
      // Convert spherical coordinates (azimuth, elevation) to 3D direction
      // Elevation: 0 = horizon, positive = above horizon
      // Azimuth (theta): angle around the robot
      // 
      // Standard spherical to Cartesian:
      // x = cos(elevation) * sin(azimuth)
      // y = sin(elevation)
      // z = cos(elevation) * cos(azimuth)
      // 
      // For conical mirror view orientation:
      // - Bottom of screen (theta = π/2) should map to forward direction
      // - Top of screen (theta = -π/2) should map to backward direction
      // - Right of screen (theta = 0) should map to robot's right
      // - Left of screen (theta = ±π) should map to robot's left
      //
      // In Three.js cube map: +Z is forward, +X is right, -Z is back, -X is left
      // In standard spherical: azimuth=0 is +Z, azimuth=π/2 is +X, azimuth=π is -Z, azimuth=-π/2 is -X
      //
      // To make bottom = forward:
      // theta = π/2 (bottom) -> azimuth = 0 (+Z forward)
      // theta = 0 (right) -> azimuth = -π/2 (-X... wait that's left!)
      //
      // Let me reconsider. If we use spherical coords:
      // azimuth = 0 means looking along +Z axis (forward)
      // azimuth = π/2 means looking along +X axis (right)
      // azimuth = π means looking along -Z axis (back)
      // azimuth = 3π/2 or -π/2 means looking along -X axis (left)
      //
      // And theta (screen position):
      // theta = 0 is right side of screen
      // theta = π/2 is bottom of screen
      // theta = π is left side of screen
      // theta = -π/2 is top of screen
      //
      // Desired mapping:
      // Bottom (θ=π/2) -> Forward (az=0)
      // Right (θ=0) -> Robot's left (az=-π/2)
      // Top (θ=-π/2) -> Back (az=π)
      // Left (θ=π) -> Robot's right (az=π/2)
      //
      // This gives: azimuth = π/2 - theta
      // But user says all see front=right, so let's rotate by -π/2:
      // azimuth = π/2 - theta - π/2 = -theta
      float azimuth = -theta;
      
      float cosElev = cos(elevation);
      vec3 direction = vec3(
        cosElev * sin(azimuth),  // X (right/left)
        sin(elevation),          // Y (up/down - positive = above horizon)
        cosElev * cos(azimuth)   // Z (forward/back)
      );
      
      // Rotate direction to match robot's heading (around Y axis)
      float cosRot = cos(robotRotation);
      float sinRot = sin(robotRotation);
      vec3 rotatedDir = vec3(
        direction.x * cosRot - direction.z * sinRot,
        direction.y,
        direction.x * sinRot + direction.z * cosRot
      );
      
      direction = normalize(rotatedDir);
      
      // Debug modes - check early to skip normal rendering
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
      
      // Other debug modes (visualize conical mirror coordinates)
      if (debugMode > 0.5) {
        if (debugMode < 1.5) {
          // Mode 1: Show elevation as color (blue = horizon, red = above)
          float elevNorm = elevation / maxElevation; // Normalize to 0-1
          gl_FragColor = vec4(elevNorm, 0.0, 1.0 - elevNorm, 1.0);
          return;
        } else if (debugMode < 2.5) {
          // Mode 2: Show azimuth as color (rainbow around circle)
          float azNorm = (theta + 3.14159) / 6.28318; // Normalize -π to π -> 0 to 1
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
      
      // Sample from cube map
      direction = normalize(direction);
      
      #ifdef GL_ES
      vec4 color = textureCube(tDiffuse, direction);
      #else
      vec4 color = texture(tDiffuse, direction);
      #endif
      
      // Clamp color values to valid range (0-1)
      color = clamp(color, 0.0, 1.0);
      
      // Increase brightness to make objects visible (moderate boost to avoid color washout)
      color.rgb *= 1.7; // Increase brightness by 70% (balanced for visibility and color accuracy)
      
      // Increase contrast to make objects stand out (moderate increase)
      color.rgb = (color.rgb - 0.5) * 1.3 + 0.5; // Increase contrast by 30%
      color.rgb = clamp(color.rgb, 0.0, 1.0);
      
      // Reduce vignette effect at mirror edges (less darkening = more visible)
      float vignette = 1.0 - (normalizedR / mirrorRadius) * 0.1; // Reduced from 0.2 to 0.1
      color.rgb *= vignette;
      
      gl_FragColor = color;
    }
  `,
};
