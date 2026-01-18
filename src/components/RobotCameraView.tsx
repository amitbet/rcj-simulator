// ============================================================
// Robot Camera View Component - Shows selected robot's camera view
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { Renderer3D } from '../renderer/Renderer3D';
import { SimulationState, WorldState } from '../types';
import { SimulationEngine } from '../simulator/SimulationEngine';

interface RobotCameraViewProps {
  simulationState: SimulationState | null;
  simulationEngine?: SimulationEngine | null;
  robotId: string; // Fixed robot ID for this camera view
}

export const RobotCameraView: React.FC<RobotCameraViewProps> = ({ simulationState, simulationEngine, robotId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer3D | null>(null);
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [debugMode, setDebugMode] = useState<number>(0); // Track current debug mode
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
      </div>
    </div>
  );
};
