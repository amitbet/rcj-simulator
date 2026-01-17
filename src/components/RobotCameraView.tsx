// ============================================================
// Robot Camera View Component - Shows selected robot's camera view
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { Renderer3D } from '../renderer/Renderer3D';
import { SimulationState, RobotState, WorldState } from '../types';
import { SimulationEngine } from '../simulator/SimulationEngine';

interface RobotCameraViewProps {
  simulationState: SimulationState | null;
  simulationEngine?: SimulationEngine | null;
}

export const RobotCameraView: React.FC<RobotCameraViewProps> = ({ simulationState, simulationEngine }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer3D | null>(null);
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [debugMode, setDebugMode] = useState<number>(0); // Track current debug mode
  const animationRef = useRef<number>(0);

  // Initialize renderer
  useEffect(() => {
    if (!containerRef.current || rendererRef.current) return;

    rendererRef.current = new Renderer3D(containerRef.current);
    
    // Enable 360 view by default for camera view
    const firstRobot = simulationState?.robots.find(r => !r.penalized);
    if (firstRobot) {
      setSelectedRobotId(firstRobot.id);
      rendererRef.current.set360View(true, firstRobot.id);
    }

    // Handle resize
    const handleResize = () => {
      if (rendererRef.current) {
        rendererRef.current.resize();
      }
    };
    window.addEventListener('resize', handleResize);

    // Debug mode keyboard shortcuts (only when camera view is focused)
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only trigger if camera view container is focused or if no input is focused
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'SELECT'
      );
      
      if (isInputFocused) return; // Don't interfere with inputs
      
      if (rendererRef.current) {
        if (e.key === '1') {
          rendererRef.current.setDebugMode(0); // Normal
          setDebugMode(0);
          console.log('Debug mode: Normal view');
        } else if (e.key === '2') {
          rendererRef.current.setDebugMode(1); // Elevation
          setDebugMode(1);
          console.log('Debug mode: Show elevation (red=horizon, blue=up)');
        } else if (e.key === '3') {
          rendererRef.current.setDebugMode(2); // Azimuth
          setDebugMode(2);
          console.log('Debug mode: Show azimuth (rainbow around circle)');
        } else if (e.key === '4') {
          rendererRef.current.setDebugMode(3); // Direction
          setDebugMode(3);
          console.log('Debug mode: Show direction vector (RGB=XYZ)');
        } else if (e.key === '5') {
          rendererRef.current.setDebugMode(4); // Raw cube
          setDebugMode(4);
          console.log('Debug mode: Raw cube map (equirectangular)');
        }
      }
    };
    window.addEventListener('keypress', handleKeyPress);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keypress', handleKeyPress);
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, []);

  // Update selected robot when simulation state changes
  useEffect(() => {
    if (!simulationState || !rendererRef.current) return;

    // If current selection is penalized or doesn't exist, switch to first available robot
    const currentRobot = simulationState.robots.find(r => r.id === selectedRobotId);
    if (!currentRobot || currentRobot.penalized) {
      const firstAvailable = simulationState.robots.find(r => !r.penalized);
      if (firstAvailable) {
        setSelectedRobotId(firstAvailable.id);
        rendererRef.current.set360View(true, firstAvailable.id);
      }
    } else {
      // Update camera to follow selected robot
      rendererRef.current.set360View(true, selectedRobotId || undefined);
    }
  }, [simulationState, selectedRobotId]);

  // Update world state for selected robot
  useEffect(() => {
    if (!simulationEngine || !selectedRobotId) {
      setWorldState(null);
      return;
    }

    const worldStates = simulationEngine.getWorldStates();
    const ws = worldStates.get(selectedRobotId);
    setWorldState(ws || null);
  }, [simulationState, selectedRobotId, simulationEngine]);

  // Render loop
  useEffect(() => {
    if (!simulationState || !rendererRef.current) return;

    const render = () => {
      if (rendererRef.current && simulationState) {
        rendererRef.current.render(simulationState);
      }
      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [simulationState]);

  // Handle robot selection change
  const handleRobotChange = (robotId: string) => {
    setSelectedRobotId(robotId);
    if (rendererRef.current) {
      rendererRef.current.set360View(true, robotId);
    }
  };

  // Transform observation data to equirectangular coordinates (for raw cube map view)
  const transformToEquirectangular = (
    angleDeg: number,
    distance: number,
    w: number,
    h: number,
    maxDistance: number = 350
  ) => {
    // For equirectangular (raw cube map) view:
    // - Angle determines horizontal position (longitude, UV.x)
    // - Distance/elevation determines vertical position (latitude, UV.y)
    // - View is rectangular, not circular
    
    // Convert angle from degrees to radians
    // In robot coordinates, 0° = forward (robot's front)
    // The observation angle is already relative to robot's forward direction
    // In equirectangular: forward is at longitudeAdjusted=0, which is longitude=π/2, which is UV.x=0.25
    const angleRad = (angleDeg * Math.PI) / 180;
    
    // Map angle to longitude (UV.x)
    // Observation angle: 0° = forward, +90° = left, -90° = right, ±180° = back
    // In shader mode 5: longitude = UV.x * 2π, longitudeAdjusted = longitude - π/2
    // The shader then rotates by robotRotation
    // 
    // If forward (0°) appears to the left in the view, the mapping might be off
    // Let me try: forward (0°) -> UV.x = 0.5 (center of view)
    // This would mean: UV.x = (angleRad / (2π)) + 0.5
    // But we need to account for the shader's coordinate system
    // 
    // Actually, let me match the shader exactly but check if the angle needs adjustment
    // The shader uses: longitudeAdjusted = angleRad (after accounting for robot rotation)
    // But the observation angle is already relative to robot, so maybe we need to account for that
    // 
    // Try: map forward (0°) to center (UV.x=0.5) for better visual alignment
    // UV.x = (angleRad / (2π)) + 0.5, wrapped
    let equirectU = (angleRad / (2 * Math.PI)) + 0.5;
    // Wrap to [0, 1]
    equirectU = equirectU % 1.0;
    if (equirectU < 0) equirectU += 1.0;
    
    // Map distance to latitude (UV.y)
    // Objects at horizon (far) should be at UV.y = 0.5 (latitude = π/2)
    // Objects closer should be slightly above horizon (UV.y < 0.5)
    const normalizedDistance = Math.min(distance / maxDistance, 1.0);
    
    // Focus on horizon: UV.y from 0.4167 (75°) to 0.5 (90°)
    const minLatitudeUV = 0.4167;
    const maxLatitudeUV = 0.5;
    const latitudeRangeUV = maxLatitudeUV - minLatitudeUV;
    
    // Closer objects = slightly above horizon, farther objects = horizon
    const equirectV = minLatitudeUV + (normalizedDistance * latitudeRangeUV);
    
    // Convert to percentage coordinates
    const x = equirectU * 100; // UV.x -> percentage
    const y = equirectV * 100; // UV.y -> percentage
    
    // Size scales with distance (LARGER when closer, smaller when farther)
    // Closer objects appear larger in the view
    const baseWidth = 8; // Base width percentage (increased for visibility)
    const baseHeight = 5; // Base height percentage (increased for visibility)
    const sizeScale = 0.5 + (1 - normalizedDistance) * 0.5; // Larger when closer (normalizedDistance=0 -> sizeScale=1, normalizedDistance=1 -> sizeScale=0.5)
    const width = baseWidth * sizeScale;
    const height = baseHeight * sizeScale;
    
    return { x, y, width, height };
  };

  // Transform observation data to conical mirror circular coordinates
  const transformToConicalMirror = (
    angleDeg: number,
    distance: number,
    w: number,
    h: number,
    maxDistance: number = 350
  ) => {
    // For conical mirror view:
    // - Angle determines position around the circle
    // - Distance determines radius (closer objects appear nearer center, farther objects at edge)
    // - Center shows field around robot, edges show horizon further out
    
    // Convert angle from degrees to radians
    // Note: In robot coordinates, 0° = forward (robot's front)
    // The observation angle is already relative to robot's forward direction
    // The shader handles robot rotation, so we use the angle directly
    const angleRad = (angleDeg * Math.PI) / 180;
    
    // Center of circular mirror view
    const centerX = 50; // percentage
    const centerY = 50; // percentage
    
    // Calculate radius based on distance
    // Closer objects appear nearer center, farther objects at edge
    // Normalize distance (0 to maxDistance -> 0 to 1)
    const normalizedDistance = Math.min(distance / maxDistance, 1.0);
    
    // Map distance to radius on circle
    // For conical mirror: center (r=0) shows field around robot, edges (r=1) show horizon
    // Closer objects = smaller radius (nearer center), farther objects = larger radius (nearer edge)
    const maxRadius = 40; // Maximum radius percentage
    const minRadius = 5; // Minimum radius (objects very close)
    
    // Closer objects = smaller radius (nearer center)
    // Farther objects = larger radius (nearer edge)
    const radius = minRadius + (maxRadius - minRadius) * normalizedDistance;
    
    // Calculate position on circle
    // Observation angle: 0° = forward, +90° = left, -90° = right, ±180° = back
    // In shader: theta = atan(coord.y, coord.x) where:
    //   top (y<0, x=0): theta = -π/2 -> forward (after rotation)
    //   right (y=0, x>0): theta = 0 -> right side
    //   bottom (y>0, x=0): theta = π/2 -> back
    //   left (y=0, x<0): theta = π -> left side
    // 
    // The shader maps: theta + π/2 -> longitude, then longitude - π/2 -> longitudeAdjusted
    // So: theta = -π/2 (top) -> longitudeAdjusted = 0 (forward)
    // 
    // For overlay: forward (0°) should be at top
    // Map observation angle to screen angle: 0° (forward) -> -π/2 (top)
    // Formula: displayAngle = angleRad - π/2
    // This correctly maps: 0° -> -π/2 (top), 90° -> 0 (right), -90° -> -π (left), 180° -> π/2 (bottom)
    const displayAngle = angleRad - Math.PI / 2;
    
    const radiusX = Math.cos(displayAngle) * radius;
    const radiusY = Math.sin(displayAngle) * radius;
    
    // Convert to percentage coordinates
    const x = centerX + radiusX;
    const y = centerY + radiusY;
    
    // Size scales with distance (smaller when farther)
    const baseWidth = 8; // Base width percentage
    const baseHeight = 8; // Base height percentage
    const sizeScale = 1 - normalizedDistance * 0.5; // Smaller when farther
    const width = baseWidth * sizeScale;
    const height = baseHeight * sizeScale;
    
    return { x, y, width, height };
  };

  // Get available robots (non-penalized)
  const availableRobots = simulationState?.robots.filter(r => !r.penalized) || [];
  const selectedRobot = simulationState?.robots.find(r => r.id === selectedRobotId);

  if (!simulationState || availableRobots.length === 0) {
    return null;
  }

  return (
    <div className="robot-camera-view">
      <div className="robot-camera-header">
        <label className="robot-camera-label">Robot Camera:</label>
        <select
          className="robot-camera-select"
          value={selectedRobotId || ''}
          onChange={(e) => handleRobotChange(e.target.value)}
        >
          {availableRobots.map((robot) => (
            <option key={robot.id} value={robot.id}>
              {robot.team.toUpperCase()} {robot.role.toUpperCase()}
            </option>
          ))}
        </select>
        <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '4px' }}>
          Debug: 1=Normal, 2=Elevation, 3=Azimuth, 4=Direction, 5=Raw
        </div>
      </div>
      <div className="robot-camera-display" ref={containerRef}>
        {/* Pixy2 Detection Rectangles Overlay */}
        {worldState && (
          <div className="pixy2-detections">
            {/* Use equirectangular transform for raw cube map (mode 5), conical mirror for others */}
            {(() => {
              const transform = debugMode === 4 ? transformToEquirectangular : transformToConicalMirror;
              
              return (
                <>
                  {/* Ball detection (orange) */}
                  {worldState.ball.visible && (() => {
                    const pos = transform(
                      worldState.ball.angle_deg,
                      worldState.ball.distance,
                      worldState.ball.w,
                      worldState.ball.h
                    );
                    return (
                      <div
                        className="pixy2-rectangle pixy2-ball"
                        style={{
                          left: `${pos.x}%`,
                          top: `${pos.y}%`,
                          width: `${pos.width}%`,
                          height: `${pos.height}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        title={`Ball: ${worldState.ball.distance.toFixed(1)}cm @ ${worldState.ball.angle_deg.toFixed(1)}°`}
                      />
                    );
                  })()}
                  
                  {/* Blue goal detection (cyan/blue) */}
                  {worldState.goal_blue.visible && (() => {
                    const pos = transform(
                      worldState.goal_blue.angle_deg,
                      worldState.goal_blue.distance,
                      worldState.goal_blue.w,
                      worldState.goal_blue.h
                    );
                    return (
                      <div
                        className="pixy2-rectangle pixy2-goal-blue"
                        style={{
                          left: `${pos.x}%`,
                          top: `${pos.y}%`,
                          width: `${pos.width}%`,
                          height: `${pos.height}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        title={`Blue Goal: ${worldState.goal_blue.distance.toFixed(1)}cm @ ${worldState.goal_blue.angle_deg.toFixed(1)}°`}
                      />
                    );
                  })()}
                  
                  {/* Yellow goal detection (yellow) */}
                  {worldState.goal_yellow.visible && (() => {
                    const pos = transform(
                      worldState.goal_yellow.angle_deg,
                      worldState.goal_yellow.distance,
                      worldState.goal_yellow.w,
                      worldState.goal_yellow.h
                    );
                    return (
                      <div
                        className="pixy2-rectangle pixy2-goal-yellow"
                        style={{
                          left: `${pos.x}%`,
                          top: `${pos.y}%`,
                          width: `${pos.width}%`,
                          height: `${pos.height}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        title={`Yellow Goal: ${worldState.goal_yellow.distance.toFixed(1)}cm @ ${worldState.goal_yellow.angle_deg.toFixed(1)}°`}
                      />
                    );
                  })()}
                </>
              );
            })()}
          </div>
        )}
        
        {selectedRobot && (
          <div className="robot-camera-info">
            <div className="robot-camera-info-item">
              <span className="robot-camera-info-label">Team:</span>
              <span className={`robot-camera-info-value ${selectedRobot.team}`}>
                {selectedRobot.team.toUpperCase()}
              </span>
            </div>
            <div className="robot-camera-info-item">
              <span className="robot-camera-info-label">Role:</span>
              <span className="robot-camera-info-value">{selectedRobot.role.toUpperCase()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
