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
}

export const RobotCameraView: React.FC<RobotCameraViewProps> = ({ simulationState, simulationEngine, robotId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer3D | null>(null);
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [debugMode, setDebugMode] = useState<number>(0); // Track current debug mode
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const animationRef = useRef<number>(0);

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

  // Color detection function
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
      
      // First pass: mark all matching pixels
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
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

      // If enough pixels found, calculate bounding box
      if (totalPixels > 10) {
        // Apply simple erosion to remove noise (isolated pixels)
        const eroded = new Uint8Array(width * height);
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            if (mask[idx] === 1) {
              // Check if at least 2 of 8 neighbors are also set
              let neighbors = 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (dx === 0 && dy === 0) continue;
                  if (mask[(y + dy) * width + (x + dx)] === 1) neighbors++;
                }
              }
              if (neighbors >= 2) {
                eroded[idx] = 1;
              }
            }
          }
        }
        
        // Find bounding box of eroded mask
        let minX = width, minY = height, maxX = 0, maxY = 0;
        let cleanPixelCount = 0;
        
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (eroded[y * width + x] === 1) {
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
              cleanPixelCount++;
            }
          }
        }

      // If enough pixels remain after erosion, add bounding box
      if (cleanPixelCount > 5) {
        const boxWidth = maxX - minX;
        const boxHeight = maxY - minY;
        
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
          distance: Math.round(estimatedDistance)
        });
      }
      }
    });

    setDetectedObjects(newDetectedObjects);
  }, []);

  // Render loop with color detection
  useEffect(() => {
    if (!simulationState || !rendererRef.current) return;

    const render = () => {
      if (rendererRef.current && simulationState) {
        rendererRef.current.render(simulationState);
        
        // Copy WebGL canvas to 2D canvas for color detection
        const glCanvas = rendererRef.current.getCanvas();
        if (glCanvas && canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            canvasRef.current.width = glCanvas.width;
            canvasRef.current.height = glCanvas.height;
            ctx.drawImage(glCanvas, 0, 0);
            detectColors(); // Perform color detection
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
        {robot.penalized && (
          <span style={{ color: 'var(--error)', fontSize: '0.7rem', fontWeight: 'bold', marginLeft: 'auto' }}>
            PENALTY {Math.ceil(robot.penaltyTimeRemaining_ms / 1000)}s
          </span>
        )}
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
