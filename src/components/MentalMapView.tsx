// ============================================================
// Mental Map Visualization Component
// ============================================================

import React from 'react';
import { WorldState } from '../types';

interface MentalMapViewProps {
  worldState: WorldState | null;
  robotHeading: number; // Robot's current heading in degrees
}

export const MentalMapView: React.FC<MentalMapViewProps> = ({ worldState, robotHeading }) => {
  if (!worldState) {
    return null;
  }
  
  // Check if mentalMap exists
  if (!worldState.mentalMap) {
    return null;
  }

  const map = worldState.mentalMap;
  const scale = 0.5; // Scale factor to fit in small display (cm to pixels)
  const displayWidth = 120; // pixels
  const displayHeight = 160; // pixels
  
  // Field dimensions scaled
  const fieldWidth = map.fieldBounds.width * scale;
  const fieldHeight = map.fieldBounds.height * scale;
  
  // Center the field in the display
  const offsetX = (displayWidth - fieldWidth) / 2;
  const offsetY = (displayHeight - fieldHeight) / 2;
  
  // Convert robot-relative positions to display coordinates
  const normalizeAngle = (angle: number) => {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  };
  
  // Convert world positions to display coordinates
  // Field coordinate system: X = -79 to +79 (width), Y = -109.5 to +109.5 (height)
  // Blue goal at (0, -113.2), Yellow goal at (0, 113.2)
  const fieldHalfWidth = map.fieldBounds.width / 2; // 79 cm
  const fieldHalfHeight = map.fieldBounds.height / 2; // 109.5 cm
  
  // Get goal positions - prefer fixed world positions if coordinate system is established
  const getGoalDisplayPosFromWorld = (goal: { worldX: number | null; worldY: number | null; confidence?: number }) => {
    // Use fixed world positions if available (coordinate system established)
    if (goal.worldX !== null && goal.worldY !== null) {
      // Convert world coordinates to display coordinates
      // World: X = -79 to +79, Y = -109.5 to +109.5 (field), Y = -113.2 to +113.2 (goals)
      // Display: X = offsetX to offsetX+fieldWidth, Y = offsetY to offsetY+fieldHeight
      const displayX = offsetX + (fieldWidth / 2) + (goal.worldX * scale);
      // Flip Y: world Y increases upward, display Y increases downward
      // World Y = -113.2 (blue, top) maps to display Y = offsetY (top)
      // World Y = +113.2 (yellow, bottom) maps to display Y = offsetY + fieldHeight (bottom)
      const displayY = offsetY + (fieldHeight / 2) - (goal.worldY * scale);
      
      const confidence = goal.confidence !== undefined ? goal.confidence : 1.0;
      return { x: displayX, y: displayY, confidence };
    }
    return null;
  };
  
  // Fallback to robot-relative if world positions not available
  const getGoalDisplayPosFromRelative = (goal: { distance: number | null; angle_deg: number | null; confidence?: number }) => {
    if (goal.distance === null || goal.angle_deg === null) {
      return null;
    }
    
    const displayDistance = Math.min(goal.distance, 500);
    const angleRad = (goal.angle_deg * Math.PI) / 180;
    const relX = displayDistance * Math.sin(angleRad);
    const relY = displayDistance * Math.cos(angleRad);
    
    const displayX = offsetX + (fieldWidth / 2) + (relX * scale);
    const displayY = offsetY + (fieldHeight / 2) - (relY * scale);
    
    const confidence = goal.confidence !== undefined ? goal.confidence : 0.5;
    return { x: displayX, y: displayY, confidence };
  };
  
  // Try world positions first, fallback to relative
  const blueGoalPos = getGoalDisplayPosFromWorld(map.blueGoal) || getGoalDisplayPosFromRelative(map.blueGoal);
  const yellowGoalPos = getGoalDisplayPosFromWorld(map.yellowGoal) || getGoalDisplayPosFromRelative(map.yellowGoal);
  
  // Robot position in world coordinates (if available)
  const robotWorldX = map.lastPosition.x;
  const robotWorldY = map.lastPosition.y;
  
  // Convert robot world position to display coordinates
  // If coordinate system is established, show robot at its world position
  // Otherwise, show robot at center (robot-centric view)
  const robotDisplayX = offsetX + (fieldWidth / 2) + (robotWorldX * scale);
  const robotDisplayY = offsetY + (fieldHeight / 2) - (robotWorldY * scale);
  
  // Field center in world coordinates (always at 0, 0)
  const centerDisplayX = offsetX + fieldWidth / 2;
  const centerDisplayY = offsetY + fieldHeight / 2;
  
  // Robot heading for arrow (normalize to -180..180)
  const normalizedHeading = normalizeAngle(robotHeading);
  const headingRad = (normalizedHeading * Math.PI) / 180;

  return (
    <div style={{
      width: `${displayWidth}px`,
      height: `${displayHeight}px`,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      border: '2px solid rgba(0, 212, 255, 0.6)',
      borderRadius: '4px',
      padding: '4px',
      fontSize: '8px',
      pointerEvents: 'none',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
      margin: '0 auto'
    }}>
      <div style={{ 
        color: 'rgba(255, 255, 255, 0.6)', 
        fontSize: '7px', 
        marginBottom: '2px',
        textAlign: 'center',
        fontWeight: 'bold'
      }}>
        MENTAL MAP
      </div>
      <svg width={displayWidth} height={displayHeight} style={{ display: 'block' }}>
        {/* Field outline */}
        <rect
          x={offsetX}
          y={offsetY}
          width={fieldWidth}
          height={fieldHeight}
          fill="rgba(34, 139, 34, 0.2)"
          stroke="rgba(255, 255, 255, 0.4)"
          strokeWidth="1"
        />
        
        {/* Field center line */}
        <line
          x1={offsetX + fieldWidth / 2}
          y1={offsetY}
          x2={offsetX + fieldWidth / 2}
          y2={offsetY + fieldHeight}
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth="0.5"
        />
        
        {/* Blue goal */}
        {blueGoalPos && (
          <g>
            <circle
              cx={blueGoalPos.x}
              cy={blueGoalPos.y}
              r={3.5}
              fill={`rgba(0, 100, 255, ${0.5 + blueGoalPos.confidence * 0.5})`}
              stroke="rgba(0, 200, 255, 1)"
              strokeWidth={blueGoalPos.confidence > 0.8 ? "1.5" : "1"}
            />
            <text
              x={blueGoalPos.x}
              y={blueGoalPos.y - 7}
              fontSize="6"
              fill="rgba(0, 200, 255, 1)"
              textAnchor="middle"
              fontWeight="bold"
            >
              BG
            </text>
          </g>
        )}
        
        {/* Yellow goal */}
        {yellowGoalPos && (
          <g>
            <circle
              cx={yellowGoalPos.x}
              cy={yellowGoalPos.y}
              r={3.5}
              fill={`rgba(255, 255, 0, ${0.5 + yellowGoalPos.confidence * 0.5})`}
              stroke="rgba(255, 220, 0, 1)"
              strokeWidth={yellowGoalPos.confidence > 0.8 ? "1.5" : "1"}
            />
            <text
              x={yellowGoalPos.x}
              y={yellowGoalPos.y - 7}
              fontSize="6"
              fill="rgba(255, 220, 0, 1)"
              textAnchor="middle"
              fontWeight="bold"
            >
              YG
            </text>
          </g>
        )}
        
        {/* Field center (midpoint marker) - only show if both goals are visible */}
        {(blueGoalPos && yellowGoalPos) && (
          <g>
            <circle
              cx={centerDisplayX}
              cy={centerDisplayY}
              r={1.5}
              fill="rgba(255, 255, 255, 0.8)"
              stroke="rgba(200, 200, 200, 0.9)"
              strokeWidth="0.5"
            />
            <text
              x={centerDisplayX}
              y={centerDisplayY - 4}
              fontSize="5"
              fill="rgba(255, 255, 255, 0.8)"
              textAnchor="middle"
            >
              MID
            </text>
          </g>
        )}
        
        {/* Robot (at world position if coordinate system established, otherwise at center) */}
        <g>
          <circle
            cx={robotDisplayX}
            cy={robotDisplayY}
            r={5}
            fill="rgba(255, 100, 100, 0.7)"
            stroke="rgba(255, 150, 150, 1)"
            strokeWidth="1.5"
          />
          <text
            x={robotDisplayX}
            y={robotDisplayY + 2}
            fontSize="6"
            fill="rgba(255, 200, 200, 1)"
            textAnchor="middle"
            fontWeight="bold"
          >
            BOT
          </text>
        </g>
        
        {/* Robot heading indicator */}
        <line
          x1={robotDisplayX}
          y1={robotDisplayY}
          x2={robotDisplayX + Math.sin(headingRad) * 6}
          y2={robotDisplayY - Math.cos(headingRad) * 6}
          stroke="rgba(255, 200, 200, 0.9)"
          strokeWidth="1.5"
          markerEnd="url(#arrowhead)"
        />
        
        {/* Arrow marker definition */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="4"
            markerHeight="4"
            refX="3"
            refY="2"
            orient="auto"
          >
            <polygon
              points="0 0, 4 2, 0 4"
              fill="rgba(255, 200, 200, 0.9)"
            />
          </marker>
        </defs>
      </svg>
      
      {/* Legend */}
      <div style={{ 
        marginTop: '2px', 
        fontSize: '6px', 
        color: 'rgba(255, 255, 255, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>B: {map.blueGoal.distance !== null ? Math.round(map.blueGoal.distance) + 'cm' : '?'}</span>
          <span>Y: {map.yellowGoal.distance !== null ? Math.round(map.yellowGoal.distance) + 'cm' : '?'}</span>
        </div>
        {(map.blueGoal.worldX !== null && map.blueGoal.worldY !== null) || 
         (map.yellowGoal.worldX !== null && map.yellowGoal.worldY !== null) ? (
          <div style={{ fontSize: '5px', color: 'rgba(0, 255, 0, 0.6)' }}>
            Goals learned
          </div>
        ) : (
          <div style={{ fontSize: '5px', color: 'rgba(255, 100, 100, 0.6)' }}>
            Learning goals...
          </div>
        )}
      </div>
    </div>
  );
};
