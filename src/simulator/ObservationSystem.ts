// ============================================================
// RoboCup Jr. Simulator - Observation System
// ============================================================

import { PhysicsState } from '../physics/PhysicsEngine';
import { WorldState, Observation, createDefaultObservation, createDefaultWorldState } from '../types';
import { FIELD, GOAL, ROBOT } from '../types/constants';

export class ObservationSystem {
  // Camera/vision parameters
  // 360-degree camera (or 2 cameras covering full field of view)
  private readonly CAMERA_FOV = 360; // degrees field of view - whole field is visible
  // Max detection distance should cover diagonal of field (sqrt(182^2 + 243^2) ≈ 303cm)
  private readonly MAX_DISTANCE = 350; // cm max detection distance

  // Track previous sensor positions for path-based line crossing detection
  private previousSensorPositions: Map<string, {
    front: { x: number; y: number };
    left: { x: number; y: number };
    right: { x: number; y: number };
    rear: { x: number; y: number };
  }> = new Map();

  constructor() {}

  // Calculate complete world state for a robot
  calculateWorldState(
    robotId: string,
    physicsState: PhysicsState,
    timeMs: number,
    deltaS: number,
    isBlueTeam: boolean
  ): WorldState {
    const robotState = physicsState.robots.get(robotId);
    if (!robotState) {
      return createDefaultWorldState();
    }

    const { x, y, angle, vx, vy } = robotState;
    const headingDeg = (angle * 180 / Math.PI + 360) % 360;

    // Calculate observations
    const ballObs = this.calculateObservation(
      x, y, angle,
      physicsState.ball.x, physicsState.ball.y
    );

    // Goal positions (blue goal at top, yellow at bottom)
    const blueGoalObs = this.calculateObservation(
      x, y, angle,
      0, -FIELD.HEIGHT / 2 - GOAL.DEPTH / 2
    );

    const yellowGoalObs = this.calculateObservation(
      x, y, angle,
      0, FIELD.HEIGHT / 2 + GOAL.DEPTH / 2
    );

    // Estimate speed
    const speed = Math.sqrt(vx * vx + vy * vy);

    // Check bumpers (simplified - check if robot is near walls)
    const bumperFront = this.checkBumper(x, y, angle, 0);
    const bumperLeft = this.checkBumper(x, y, angle, Math.PI / 2);
    const bumperRight = this.checkBumper(x, y, angle, -Math.PI / 2);

    // Check line sensors (detect white lines: field boundaries and goal area lines)
    // Use path-based detection to catch fast crossings
    const lineFront = this.checkLineSensorWithPath(robotId, x, y, angle, 0, 'front');
    const lineLeft = this.checkLineSensorWithPath(robotId, x, y, angle, Math.PI / 2, 'left');
    const lineRight = this.checkLineSensorWithPath(robotId, x, y, angle, -Math.PI / 2, 'right');
    const lineRear = this.checkLineSensorWithPath(robotId, x, y, angle, Math.PI, 'rear');

    // Check if stuck (very low speed despite motors running)
    const stuck = speed < 1 && deltaS > 0.1;

    return {
      t_ms: timeMs,
      dt_s: deltaS,
      heading_deg: headingDeg,
      yaw_rate_dps: 0, // Would need angular velocity tracking
      v_est: speed,
      ball: ballObs,
      goal_blue: blueGoalObs,
      goal_yellow: yellowGoalObs,
      bumper_front: bumperFront,
      bumper_left: bumperLeft,
      bumper_right: bumperRight,
      line_front: lineFront,
      line_left: lineLeft,
      line_right: lineRight,
      line_rear: lineRear,
      stuck,
      stuck_confidence: stuck ? 0.8 : 0,
      we_are_blue: isBlueTeam,
      kickoff_us: false, // Would need game state
    };
  }

  // Calculate observation to a target
  private calculateObservation(
    robotX: number,
    robotY: number,
    robotAngle: number,
    targetX: number,
    targetY: number
  ): Observation {
    const dx = targetX - robotX;
    const dy = targetY - robotY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate angle to target (world coordinates)
    const worldAngle = Math.atan2(dy, dx);
    
    // Convert to robot-relative angle
    let relativeAngle = (worldAngle - robotAngle) * 180 / Math.PI;
    
    // Normalize to -180 to 180
    while (relativeAngle > 180) relativeAngle -= 360;
    while (relativeAngle < -180) relativeAngle += 360;

    // With 360-degree camera, everything is always in field of view
    // Only distance matters for visibility
    const visible = distance <= this.MAX_DISTANCE;

    // Calculate confidence based on distance only (angle doesn't matter with 360 FOV)
    let confidence = 0;
    if (visible) {
      const distanceConfidence = 1 - (distance / this.MAX_DISTANCE);
      confidence = distanceConfidence;
    }

    // Simulate pixel coordinates (assuming 320x240 camera)
    // For 360 FOV, map angle to full width: -180 to +180 maps to 0 to 320
    const imageWidth = 320;
    const imageHeight = 240;
    const cx = visible ? Math.round((relativeAngle + 180) / 360 * imageWidth) : 0;
    const cy = visible ? Math.round(imageHeight / 2) : 0;
    
    // Simulate bounding box size (smaller when farther)
    const baseSize = 50;
    const w = visible ? Math.round(baseSize * (1 - distance / this.MAX_DISTANCE / 2)) : 0;
    const h = visible ? Math.round(baseSize * (1 - distance / this.MAX_DISTANCE / 2)) : 0;

    return {
      visible,
      angle_deg: relativeAngle,
      distance,
      confidence,
      cx,
      cy,
      w,
      h,
    };
  }

  // Check bumper collision (simplified)
  // Bumpers detect walls at the OUTER boundary and other robots
  private checkBumper(
    robotX: number,
    robotY: number,
    robotAngle: number,
    bumperOffset: number // 0 = front, PI/2 = left, -PI/2 = right
  ): boolean {
    const checkAngle = robotAngle + bumperOffset;
    const checkDistance = ROBOT.RADIUS + 2; // Check slightly beyond robot radius
    
    const checkX = robotX + Math.cos(checkAngle) * checkDistance;
    const checkY = robotY + Math.sin(checkAngle) * checkDistance;

    // Use OUTER boundary (field + outer area) for wall detection
    const outerHalfW = FIELD.WIDTH / 2 + FIELD.OUTER_WIDTH;
    const outerHalfH = FIELD.HEIGHT / 2 + FIELD.OUTER_WIDTH;

    // Check if point is outside outer bounds (near walls)
    return checkX < -outerHalfW + 5 || checkX > outerHalfW - 5 || 
           checkY < -outerHalfH + 5 || checkY > outerHalfH - 5;
  }

  // Check line sensor with path-based detection to catch fast crossings
  private checkLineSensorWithPath(
    robotId: string,
    robotX: number,
    robotY: number,
    robotAngle: number,
    sensorOffset: number,
    sensorName: 'front' | 'left' | 'right' | 'rear'
  ): boolean {
    const sensorAngle = robotAngle + sensorOffset;
    const sensorDistance = ROBOT.RADIUS; // Line sensors are exactly at robot edge
    
    const currentSensorX = robotX + Math.cos(sensorAngle) * sensorDistance;
    const currentSensorY = robotY + Math.sin(sensorAngle) * sensorDistance;

    // Get previous sensor position
    const prevPositions = this.previousSensorPositions.get(robotId);
    const prevSensorX = prevPositions?.[sensorName]?.x;
    const prevSensorY = prevPositions?.[sensorName]?.y;

    // Check current position (point-based detection)
    const currentDetected = this.checkLineAtPoint(currentSensorX, currentSensorY);

    // If we have previous position, check if path crossed a line
    if (prevSensorX !== undefined && prevSensorY !== undefined) {
      const pathCrossed = this.checkLinePathCrossing(prevSensorX, prevSensorY, currentSensorX, currentSensorY);
      if (pathCrossed) {
        // Update stored position and return true
        this.updateSensorPosition(robotId, sensorName, currentSensorX, currentSensorY);
        return true;
      }
    }

    // Update stored position
    this.updateSensorPosition(robotId, sensorName, currentSensorX, currentSensorY);

    return currentDetected;
  }

  // Update stored sensor position
  private updateSensorPosition(
    robotId: string,
    sensorName: 'front' | 'left' | 'right' | 'rear',
    x: number,
    y: number
  ): void {
    if (!this.previousSensorPositions.has(robotId)) {
      this.previousSensorPositions.set(robotId, {
        front: { x: 0, y: 0 },
        left: { x: 0, y: 0 },
        right: { x: 0, y: 0 },
        rear: { x: 0, y: 0 },
      });
    }
    const positions = this.previousSensorPositions.get(robotId)!;
    positions[sensorName] = { x, y };
  }

  // Check if a line segment crosses any field line
  private checkLinePathCrossing(
    x1: number, y1: number,
    x2: number, y2: number
  ): boolean {
    const halfW = FIELD.WIDTH / 2;
    const halfH = FIELD.HEIGHT / 2;
    const goalAreaW = FIELD.PENALTY_AREA_WIDTH / 2;
    const goalAreaD = FIELD.PENALTY_AREA_DEPTH;
    const lineTolerance = FIELD.LINE_WIDTH / 2;

    // Check field boundary lines
    // Top boundary (y = -halfH) - check left and right segments separately (goal opening in middle)
    // Left segment: from -halfW to -GOAL.WIDTH/2
    if (this.segmentCrossesLine(x1, y1, x2, y2, -halfH, -halfH, -halfW, -GOAL.WIDTH / 2, 'horizontal')) {
      return true;
    }
    // Right segment: from GOAL.WIDTH/2 to halfW
    if (this.segmentCrossesLine(x1, y1, x2, y2, -halfH, -halfH, GOAL.WIDTH / 2, halfW, 'horizontal')) {
      return true;
    }
    // Bottom boundary (y = halfH) - check left and right segments separately
    // Left segment: from -halfW to -GOAL.WIDTH/2
    if (this.segmentCrossesLine(x1, y1, x2, y2, halfH, halfH, -halfW, -GOAL.WIDTH / 2, 'horizontal')) {
      return true;
    }
    // Right segment: from GOAL.WIDTH/2 to halfW
    if (this.segmentCrossesLine(x1, y1, x2, y2, halfH, halfH, GOAL.WIDTH / 2, halfW, 'horizontal')) {
      return true;
    }
    // Left boundary (x = -halfW)
    if (this.segmentCrossesLine(x1, y1, x2, y2, -halfW, -halfW, -halfH, halfH, 'vertical')) {
      return true;
    }
    // Right boundary (x = halfW)
    if (this.segmentCrossesLine(x1, y1, x2, y2, halfW, halfW, -halfH, halfH, 'vertical')) {
      return true;
    }

    // Check goal area lines
    // Blue goal area front line (y = -halfH + goalAreaD)
    if (this.segmentCrossesLine(x1, y1, x2, y2, -halfH + goalAreaD, -halfH + goalAreaD, -goalAreaW, goalAreaW, 'horizontal')) {
      return true;
    }
    // Blue goal area left side (x = -goalAreaW)
    if (this.segmentCrossesLine(x1, y1, x2, y2, -goalAreaW, -goalAreaW, -halfH, -halfH + goalAreaD, 'vertical')) {
      return true;
    }
    // Blue goal area right side (x = goalAreaW)
    if (this.segmentCrossesLine(x1, y1, x2, y2, goalAreaW, goalAreaW, -halfH, -halfH + goalAreaD, 'vertical')) {
      return true;
    }

    // Yellow goal area front line (y = halfH - goalAreaD)
    if (this.segmentCrossesLine(x1, y1, x2, y2, halfH - goalAreaD, halfH - goalAreaD, -goalAreaW, goalAreaW, 'horizontal')) {
      return true;
    }
    // Yellow goal area left side (x = -goalAreaW)
    if (this.segmentCrossesLine(x1, y1, x2, y2, -goalAreaW, -goalAreaW, halfH - goalAreaD, halfH, 'vertical')) {
      return true;
    }
    // Yellow goal area right side (x = goalAreaW)
    if (this.segmentCrossesLine(x1, y1, x2, y2, goalAreaW, goalAreaW, halfH - goalAreaD, halfH, 'vertical')) {
      return true;
    }

    return false;
  }

  // Check if a line segment crosses a horizontal or vertical line
  private segmentCrossesLine(
    segX1: number, segY1: number,
    segX2: number, segY2: number,
    lineX1: number, lineY1: number,
    lineX2: number, lineY2: number,
    orientation: 'horizontal' | 'vertical'
  ): boolean {
    if (orientation === 'horizontal') {
      const lineY = lineY1; // Horizontal line has constant Y
      const lineXMin = Math.min(lineX1, lineX2);
      const lineXMax = Math.max(lineX1, lineX2);
      
      // Check if segment crosses the horizontal line
      const segYMin = Math.min(segY1, segY2);
      const segYMax = Math.max(segY1, segY2);
      
      if (segYMin <= lineY && segYMax >= lineY) {
        // Segment crosses the line's Y coordinate
        // Find intersection X
        const t = (lineY - segY1) / (segY2 - segY1);
        if (t >= 0 && t <= 1) {
          const intersectX = segX1 + t * (segX2 - segX1);
          // Check if intersection is within line segment bounds
          if (intersectX >= lineXMin && intersectX <= lineXMax) {
            return true;
          }
        }
      }
    } else {
      const lineX = lineX1; // Vertical line has constant X
      const lineYMin = Math.min(lineY1, lineY2);
      const lineYMax = Math.max(lineY1, lineY2);
      
      // Check if segment crosses the vertical line
      const segXMin = Math.min(segX1, segX2);
      const segXMax = Math.max(segX1, segX2);
      
      if (segXMin <= lineX && segXMax >= lineX) {
        // Segment crosses the line's X coordinate
        // Find intersection Y
        const t = (lineX - segX1) / (segX2 - segX1);
        if (t >= 0 && t <= 1) {
          const intersectY = segY1 + t * (segY2 - segY1);
          // Check if intersection is within line segment bounds
          if (intersectY >= lineYMin && intersectY <= lineYMax) {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  // Check if a point is over a line (original point-based detection)
  private checkLineAtPoint(sensorX: number, sensorY: number): boolean {
    const halfW = FIELD.WIDTH / 2;
    const halfH = FIELD.HEIGHT / 2;
    const goalAreaW = FIELD.PENALTY_AREA_WIDTH / 2;
    const goalAreaD = FIELD.PENALTY_AREA_DEPTH;
    const lineTolerance = FIELD.LINE_WIDTH / 2 + 0.5; // Detect when directly over line

    // Check field boundary lines (white lines marking field edges)
    // Top boundary (blue goal side)
    if (Math.abs(sensorY - (-halfH)) < lineTolerance && Math.abs(sensorX) > GOAL.WIDTH / 2) {
      return true;
    }
    // Bottom boundary (yellow goal side)
    if (Math.abs(sensorY - halfH) < lineTolerance && Math.abs(sensorX) > GOAL.WIDTH / 2) {
      return true;
    }
    // Left boundary
    if (Math.abs(sensorX - (-halfW)) < lineTolerance) {
      return true;
    }
    // Right boundary
    if (Math.abs(sensorX - halfW) < lineTolerance) {
      return true;
    }

    // Check goal area lines (penalty area rectangles)
    // Blue goal area (top) - rectangle from y=-halfH to y=-halfH+goalAreaD
    if (sensorY >= -halfH - lineTolerance && sensorY <= -halfH + goalAreaD + lineTolerance &&
        Math.abs(sensorX) <= goalAreaW + lineTolerance) {
      // Check if on the front line (furthest from goal) or side lines
      if (Math.abs(sensorY - (-halfH + goalAreaD)) < lineTolerance || // Front line
          Math.abs(sensorX - (-goalAreaW)) < lineTolerance || // Left side
          Math.abs(sensorX - goalAreaW) < lineTolerance) { // Right side
        return true;
      }
    }

    // Yellow goal area (bottom) - rectangle from y=halfH-goalAreaD to y=halfH
    if (sensorY >= halfH - goalAreaD - lineTolerance && sensorY <= halfH + lineTolerance &&
        Math.abs(sensorX) <= goalAreaW + lineTolerance) {
      // Check if on the front line (furthest from goal) or side lines
      if (Math.abs(sensorY - (halfH - goalAreaD)) < lineTolerance || // Front line
          Math.abs(sensorX - (-goalAreaW)) < lineTolerance || // Left side
          Math.abs(sensorX - goalAreaW) < lineTolerance) { // Right side
        return true;
      }
    }

    return false;
  }
}

