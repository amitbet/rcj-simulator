// ============================================================
// Robot Camera View Component - Shows selected robot's camera view
// ============================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Renderer3D } from '../renderer/Renderer3D';
import { SimulationState, WorldState } from '../types';
import { SimulationEngine } from '../simulator/SimulationEngine';

interface RobotCameraViewProps {
  simulationState: SimulationState | null;
  simulationEngine?: SimulationEngine | null;
  robotId: string; // Fixed robot ID for this camera view
}

interface DetectedObject {
  x: number;
  y: number;
  width: number;
  height: number;
  color: 'ball' | 'goal_blue' | 'goal_yellow';
  label: string;
  distance: number; // Estimated distance in cm
  angle_deg: number; // Angle in degrees relative to robot forward
}

export const RobotCameraView: React.FC<RobotCameraViewProps> = ({ simulationState, simulationEngine, robotId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer3D | null>(null);
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [debugMode, setDebugMode] = useState<number>(0); // Track current debug mode
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const animationRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0); // Frame counter for throttling detection

  // Get robot info
  const robot = simulationState?.robots.find(r => r.id === robotId);

  // Initialize renderer
  useEffect(() => {
    if (!containerRef.current || rendererRef.current) return;

    rendererRef.current = new Renderer3D(containerRef.current);
    
    // Enable 360 view for this robot
    if (robotId) {
      rendererRef.current.set360View(true, robotId);
    }

    // Handle resize
    const handleResize = () => {
      if (rendererRef.current) {
        rendererRef.current.resize();
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial size

    return () => {
      window.removeEventListener('resize', handleResize);
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, []);

  // Update camera to follow this robot
  useEffect(() => {
    if (!simulationState || !rendererRef.current || !robotId) return;
    rendererRef.current.set360View(true, robotId);
  }, [simulationState, robotId]);

  // Update world state for this robot
  useEffect(() => {
    if (!simulationEngine || !robotId) {
      setWorldState(null);
      return;
    }

    const worldStates = simulationEngine.getWorldStates();
    const ws = worldStates.get(robotId);
    setWorldState(ws || null);
  }, [simulationState, robotId, simulationEngine]);

  // Color detection function - optimized for performance
  const detectColors = useCallback(() => {
    if (!canvasRef.current || !rendererRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;

    const newDetectedObjects: DetectedObject[] = [];

    // Color ranges (RGB) for detection
    const colorRanges = {
      ball: { // Red/Orange ball - focus on red component
        rMin: 180, rMax: 255,  // Strong red
        gMin: 0, gMax: 120,    // Low green (not yellow)
        bMin: 0, bMax: 100,    // Low blue (not cyan/white)
        label: 'Ball'
      },
      goal_blue: { // Cyan/blue goal
        rMin: 0, rMax: 150,
        gMin: 150, gMax: 255,
        bMin: 150, bMax: 255,
        label: 'Blue Goal'
      },
      goal_yellow: { // Yellow goal - MUCH wider range to get larger bbox
        rMin: 160, rMax: 255,  // Very permissive (was 200)
        gMin: 160, gMax: 255,  // Very permissive (was 200)
        bMin: 0, bMax: 140,    // Wide range (was 100)
        label: 'Yellow Goal'
      }
    };

    // Find bounding boxes for each color
    Object.entries(colorRanges).forEach(([colorKey, range]) => {
      // Create a binary mask for this color
      const mask = new Uint8Array(width * height);
      let totalPixels = 0;
      
      // First pass: mark all matching pixels (sample every 4th pixel for speed)
      for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
          const idx = (y * width + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];

          // Basic range check
          if (r >= range.rMin && r <= range.rMax &&
              g >= range.gMin && g <= range.gMax &&
              b >= range.bMin && b <= range.bMax) {
            
            // Additional check for ball to distinguish from yellow/white
            // Red ball has high R, low G, low B
            if (colorKey === 'ball') {
              // For red: red should be much higher than green and blue
              if (r > g + 60 && r > b + 80) {  // Red dominant
                mask[y * width + x] = 1;
                totalPixels++;
              }
            } else {
              mask[y * width + x] = 1;
              totalPixels++;
            }
          }
        }
      }

      // If enough pixels found, calculate bounding box (skip erosion for performance)
      if (totalPixels > 5) {
        // Find bounding box directly from mask (no erosion)
        let minX = width, minY = height, maxX = 0, maxY = 0;
        
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (mask[y * width + x] === 1) {
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
        }

      // Calculate distance
      const boxWidth = maxX - minX;
        const boxHeight = maxY - minY;
        
        // Calculate angle from bounding box position in circular view
        // CRITICAL: Must accurately map screen position to robot-relative angle
        // Expected mapping: bottom center = 0° (forward), right center = 90° (right), 
        //                    top center = 180°/-180° (back), left center = -90° (left)
        
        // Get object center in pixel coordinates
        const objCenterX_px = minX + boxWidth / 2;
        const objCenterY_px = minY + boxHeight / 2;
        
        // Convert to normalized coordinates centered at image center
        // Canvas: X=0 is left, Y=0 is top
        const centerX = width / 2;
        const centerY = height / 2;
        const dx = objCenterX_px - centerX; // Positive = right
        const dy = objCenterY_px - centerY; // Positive = down (canvas Y increases downward)
        
        // Calculate angle using atan2
        // Canvas coordinates: X increases right, Y increases down
        // Calculate theta from canvas position
        const theta = Math.atan2(dy, dx); // atan2(y, x): right=0°, bottom=90°, left=±180°, top=-90°
        
        // Convert to robot-relative angle where:
        //   Bottom (forward) = 0°, Right = 90°, Top (back) = 180°/-180°, Left = -90°
        // We need to rotate by -90° and negate: angle = -(theta - π/2) = -theta + π/2
        // This gives:
        //   Bottom (θ=90°): angle = -90° + 90° = 0° ✓
        //   Right (θ=0°): angle = 0° + 90° = 90° ✓
        //   Left (θ=180°): angle = -180° + 90° = -90° ✓
        //   Top (θ=-90°): angle = 90° + 90° = 180° ✓
        let angle_deg = (-theta + Math.PI / 2) * 180 / Math.PI;
        
        // Normalize to -180 to 180 range
        while (angle_deg > 180) angle_deg -= 360;
        while (angle_deg < -180) angle_deg += 360;
        
        // Estimate distance based on bounding box size
        // CRITICAL: Larger area percentage = CLOSER = SMALLER distance number
        const boxArea = boxWidth * boxHeight;
        const normalizedArea = boxArea / (width * height); // 0 to 1
        
        // Distance estimation: inverse relationship with area
        // When box is HUGE (touching robot), distance should be ~5cm
        // When box is tiny (far away), distance should be ~300cm
        let estimatedDistance = 0;
        
        if (colorKey === 'ball') {
          // Ball diameter is ~4cm, typical detection range 5-220cm
          // Calibrated so quarter-field distance (~55cm) shows correctly
          const k = 1.5; // Calibration constant (increased from 0.6)
          estimatedDistance = k / Math.sqrt(normalizedArea + 0.0001);
          estimatedDistance = Math.max(5, Math.min(250, estimatedDistance));
        } else if (colorKey === 'goal_blue') {
          // Blue goal
          const k = 4.5;
          estimatedDistance = k / Math.sqrt(normalizedArea + 0.0001);
          estimatedDistance = Math.max(10, Math.min(350, estimatedDistance));
        } else {
          // Yellow goal - now same as blue since bbox sizes are equal
          const k = 4.5; // Same as blue!
          estimatedDistance = k / Math.sqrt(normalizedArea + 0.0001);
          estimatedDistance = Math.max(10, Math.min(350, estimatedDistance));
        }
        
        newDetectedObjects.push({
          color: colorKey as 'ball' | 'goal_blue' | 'goal_yellow',
          x: (minX / width) * 100,
          y: (minY / height) * 100,
          width: (boxWidth / width) * 100,
          height: (boxHeight / height) * 100,
          label: range.label,
          distance: Math.round(estimatedDistance),
          angle_deg: Math.round(angle_deg)
        });
      }
    });

    setDetectedObjects(newDetectedObjects);

    // Update simulation engine with camera-based observations
    if (simulationEngine) {
      const cameraObservations: {
        ball?: { distance: number; angle_deg: number };
        goal_blue?: { distance: number; angle_deg: number };
        goal_yellow?: { distance: number; angle_deg: number };
      } = {};
      
      // Build observations from detected objects
      newDetectedObjects.forEach(obj => {
        if (obj.color === 'ball') {
          cameraObservations.ball = { distance: obj.distance, angle_deg: obj.angle_deg };
        } else if (obj.color === 'goal_blue') {
          cameraObservations.goal_blue = { distance: obj.distance, angle_deg: obj.angle_deg };
        } else if (obj.color === 'goal_yellow') {
          cameraObservations.goal_yellow = { distance: obj.distance, angle_deg: obj.angle_deg };
        }
      });
      
      // IMPORTANT: If an object is not detected, explicitly mark it as not visible
      // by passing null, which tells SimulationEngine to clear old observations
      simulationEngine.updateWorldStateFromCamera(robotId, cameraObservations, {
        ballDetected: newDetectedObjects.some(o => o.color === 'ball'),
        blueGoalDetected: newDetectedObjects.some(o => o.color === 'goal_blue'),
        yellowGoalDetected: newDetectedObjects.some(o => o.color === 'goal_yellow'),
      });
    }
  }, [simulationEngine, robotId]);

  // Render loop with throttled color detection
  useEffect(() => {
    if (!simulationState || !rendererRef.current) return;

    const render = () => {
      if (rendererRef.current && simulationState) {
        rendererRef.current.render(simulationState);
        
        // Only run detection every 3rd frame for performance
        frameCountRef.current++;
        if (frameCountRef.current % 3 === 0) {
          // Copy WebGL canvas to 2D canvas for color detection
          const glCanvas = rendererRef.current.getCanvas();
          if (glCanvas && canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
              canvasRef.current.width = glCanvas.width;
              canvasRef.current.height = glCanvas.height;
              ctx.drawImage(glCanvas, 0, 0);
              detectColors(); // Perform detection every 3rd frame
            }
          }
        }
      }
      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [simulationState, detectColors]);

  if (!simulationState || !robot) {
    return null;
  }

  return (
    <div className="robot-camera-view">
      <div className="robot-camera-header">
        <label className="robot-camera-label">
          {robot.team.toUpperCase()} {robot.role.toUpperCase()}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
          {worldState?.state && (
            <span style={{ 
              color: 'var(--accent)', 
              fontSize: '0.7rem', 
              fontWeight: 'bold',
              textTransform: 'uppercase',
              padding: '0.2rem 0.5rem',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '4px'
            }}>
              {worldState.state}
            </span>
          )}
          {robot.penalized && (
            <span style={{ color: 'var(--error)', fontSize: '0.7rem', fontWeight: 'bold' }}>
              PENALTY {Math.ceil(robot.penaltyTimeRemaining_ms / 1000)}s
            </span>
          )}
        </div>
      </div>
      <div className="robot-camera-display" ref={containerRef}>
        {/* Hidden 2D canvas for pixel reading */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Detection rectangles overlay */}
        <div className="pixy2-detections">
          {detectedObjects.map((obj, index) => (
            <div
              key={`${obj.color}-${index}`}
              className={`pixy2-rectangle pixy2-${obj.color.replace('_', '-')}`}
              style={{
                left: `${obj.x}%`,
                top: `${obj.y}%`,
                width: `${obj.width}%`,
                height: `${obj.height}%`,
              }}
              title={`${obj.label}: ${obj.distance}cm`}
            />
          ))}
        </div>

        {/* Distance information overlay */}
        <div className="camera-distance-info">
          {/* Ball */}
          {(() => {
            const ball = detectedObjects.find(obj => obj.color === 'ball');
            return (
              <div className="distance-item">
                <span className="distance-label ball">Ball:</span>
                <span className="distance-value">
                  {ball ? `${ball.distance} cm` : 'N/A'}
                </span>
              </div>
            );
          })()}
          
          {/* Blue Goal */}
          {(() => {
            const blueGoal = detectedObjects.find(obj => obj.color === 'goal_blue');
            return (
              <div className="distance-item">
                <span className="distance-label goal_blue">Blue:</span>
                <span className="distance-value">
                  {blueGoal ? `${blueGoal.distance} cm` : 'N/A'}
                </span>
              </div>
            );
          })()}
          
          {/* Yellow Goal */}
          {(() => {
            const yellowGoal = detectedObjects.find(obj => obj.color === 'goal_yellow');
            return (
              <div className="distance-item">
                <span className="distance-label goal_yellow">Yellow:</span>
                <span className="distance-value">
                  {yellowGoal ? `${yellowGoal.distance} cm` : 'N/A'}
                </span>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
