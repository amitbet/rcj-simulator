// ============================================================
// RoboCup Jr. Simulator - Referee System
// ============================================================

import { NEUTRAL_SPOTS, TIMING, FIELD } from '../types/constants';
import { NeutralSpot } from '../types';

export class Referee {
  private lastBallPosition: { x: number; y: number } = { x: 0, y: 0 };
  private ballStationaryTime: number = 0;
  private readonly MOVEMENT_THRESHOLD = 1; // cm
  
  private onLackOfProgress: (() => void) | null = null;

  constructor() {}

  // Update referee state
  update(deltaMs: number, ballState: { x: number; y: number; vx: number; vy: number }): void {
    // Check for lack of progress
    const dx = ballState.x - this.lastBallPosition.x;
    const dy = ballState.y - this.lastBallPosition.y;
    const movement = Math.sqrt(dx * dx + dy * dy);

    if (movement < this.MOVEMENT_THRESHOLD) {
      this.ballStationaryTime += deltaMs;
      
      if (this.ballStationaryTime >= TIMING.LACK_OF_PROGRESS) {
        this.onLackOfProgress?.();
        this.ballStationaryTime = 0;
      }
    } else {
      this.ballStationaryTime = 0;
    }

    this.lastBallPosition = { x: ballState.x, y: ballState.y };
  }

  // Find nearest neutral spot based on which side ball went out
  findNearestNeutralSpot(side: 'top' | 'bottom' | 'left' | 'right'): NeutralSpot {
    const spots = NEUTRAL_SPOTS;
    
    // Filter spots based on side
    let candidateSpots: typeof NEUTRAL_SPOTS;
    
    switch (side) {
      case 'top':
        candidateSpots = spots.filter(s => s.y < 0);
        break;
      case 'bottom':
        candidateSpots = spots.filter(s => s.y > 0);
        break;
      case 'left':
        candidateSpots = spots.filter(s => s.x < 0);
        break;
      case 'right':
        candidateSpots = spots.filter(s => s.x > 0);
        break;
      default:
        candidateSpots = spots;
    }

    // Return first candidate or center if no candidates
    return candidateSpots.length > 0 
      ? candidateSpots[Math.floor(candidateSpots.length / 2)]
      : { id: 'center', x: 0, y: 0 };
  }

  // Find nearest neutral spot to a position
  findNearestNeutralSpotToPosition(x: number, y: number): NeutralSpot {
    let nearest = NEUTRAL_SPOTS[0];
    let minDist = Infinity;

    for (const spot of NEUTRAL_SPOTS) {
      const dx = spot.x - x;
      const dy = spot.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < minDist) {
        minDist = dist;
        nearest = spot;
      }
    }

    return nearest;
  }

  // Check if position is valid (inside field)
  isValidPosition(x: number, y: number): boolean {
    const halfW = FIELD.WIDTH / 2;
    const halfH = FIELD.HEIGHT / 2;
    return x >= -halfW && x <= halfW && y >= -halfH && y <= halfH;
  }

  // Get all neutral spots
  getNeutralSpots(): NeutralSpot[] {
    return NEUTRAL_SPOTS.map(s => ({ ...s }));
  }

  // Reset referee state
  reset(): void {
    this.lastBallPosition = { x: 0, y: 0 };
    this.ballStationaryTime = 0;
  }

  // Set callback for lack of progress
  setOnLackOfProgress(callback: () => void): void {
    this.onLackOfProgress = callback;
  }
}

