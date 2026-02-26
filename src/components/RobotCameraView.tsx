// ============================================================
// Robot Camera View Component - Shows selected robot's camera view
// ============================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Renderer3D } from '../renderer/Renderer3D';
import { SimulationState, WorldState, PerceptionMode } from '../types';
import { SimulationEngine } from '../simulator/SimulationEngine';

interface RobotCameraViewProps {
  simulationState: SimulationState | null;
  simulationEngine?: SimulationEngine | null;
  robotId: string; // Fixed robot ID for this camera view
  perceptionMode: PerceptionMode;
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

type RobotCameraRenderMode = 'conical_360' | 'front_pixy2';

const FRONT_CAMERA_FOV_DEG = 60;

export const RobotCameraView: React.FC<RobotCameraViewProps> = ({
  simulationState,
  simulationEngine,
  robotId,
  perceptionMode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer3D | null>(null);
  const lastCameraRenderModeRef = useRef<RobotCameraRenderMode>('conical_360');
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [debugMode, setDebugMode] = useState<number>(0); // Track current debug mode
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const animationRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0); // Frame counter for throttling detection

  // Get robot info
  const robot = simulationState?.robots.find(r => r.id === robotId);

  const getActiveRenderMode = useCallback((): RobotCameraRenderMode => {
    if (perceptionMode === 'camera_conical_360') {
      lastCameraRenderModeRef.current = 'conical_360';
      return 'conical_360';
    }
    if (perceptionMode === 'camera_front_pixy2') {
      lastCameraRenderModeRef.current = 'front_pixy2';
      return 'front_pixy2';
    }
    return lastCameraRenderModeRef.current;
  }, [perceptionMode]);

  // Initialize renderer
  useEffect(() => {
    if (!containerRef.current || rendererRef.current) return;

    rendererRef.current = new Renderer3D(containerRef.current);
    
    // Default robot camera mode for this panel
    if (robotId) {
      rendererRef.current.setRobotCameraMode(getActiveRenderMode(), robotId);
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
    rendererRef.current.setRobotCameraMode(getActiveRenderMode(), robotId);
  }, [simulationState, robotId, getActiveRenderMode]);

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
        
        // Get object center in pixel coordinates
        const objCenterX_px = minX + boxWidth / 2;
        const objCenterY_px = minY + boxHeight / 2;
        const renderMode = getActiveRenderMode();
        let angle_deg = 0;

        if (renderMode === 'front_pixy2') {
          // Front Pixy2 camera: map x position to +/- 30 degrees
          const normalizedX = (objCenterX_px / width) * 2 - 1; // -1 left, +1 right
          angle_deg = normalizedX * (FRONT_CAMERA_FOV_DEG / 2);
        } else {
          // Conical 360 view: circular mapping around robot
          const centerX = width / 2;
          const centerY = height / 2;
          const dx = objCenterX_px - centerX; // Positive = right
          const dy = objCenterY_px - centerY; // Positive = down

          const theta = Math.atan2(dy, dx);
          angle_deg = (-theta + Math.PI / 2) * 180 / Math.PI;

          while (angle_deg > 180) angle_deg -= 360;
          while (angle_deg < -180) angle_deg += 360;
        }
        
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
          const k = renderMode === 'front_pixy2' ? 1.8 : 1.5;
          estimatedDistance = k / Math.sqrt(normalizedArea + 0.0001);
          estimatedDistance = Math.max(5, Math.min(250, estimatedDistance));
        } else if (colorKey === 'goal_blue') {
          // Blue goal
          const k = renderMode === 'front_pixy2' ? 5.0 : 4.5;
          estimatedDistance = k / Math.sqrt(normalizedArea + 0.0001);
          estimatedDistance = Math.max(10, Math.min(350, estimatedDistance));
        } else {
          // Yellow goal - now same as blue since bbox sizes are equal
          const k = renderMode === 'front_pixy2' ? 5.0 : 4.5;
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
  }, [simulationEngine, robotId, getActiveRenderMode]);

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
