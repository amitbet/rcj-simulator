// ============================================================
// RoboCup Jr. Simulator - Physics Engine (Matter.js wrapper)
// ============================================================

import Matter from 'matter-js';
import { FIELD, GOAL, BALL, ROBOT, PHYSICS, COLORS } from '../types/constants';
import { Team, RobotRole, Action } from '../types';

const { Engine, World, Bodies, Body, Events, Composite, Vector } = Matter;

// Collision categories for filtering
const CATEGORY = {
  WALL: 0x0001,
  ROBOT: 0x0002,
  BALL: 0x0004,
  GOAL: 0x0008,
};

export interface RobotBody {
  id: string;
  body: Matter.Body;
  team: Team;
  role: RobotRole;
}

export interface PhysicsState {
  ball: { x: number; y: number; vx: number; vy: number };
  robots: Map<string, { x: number; y: number; angle: number; vx: number; vy: number }>;
}

export class PhysicsEngine {
  private engine: Matter.Engine;
  private robots: Map<string, RobotBody> = new Map();
  private ball: Matter.Body | null = null;
  private walls: Matter.Body[] = [];
  private goals: { blue: Matter.Body | null; yellow: Matter.Body | null } = { blue: null, yellow: null };
  
  // Collision callbacks
  private onGoalScored: ((team: Team) => void) | null = null;
  private onOutOfBounds: ((side: 'top' | 'bottom' | 'left' | 'right') => void) | null = null;
  private onRobotOutOfBounds: ((robotId: string, goalArea: 'blue' | 'yellow') => void) | null = null;
  private onCollision: ((a: string, b: string) => void) | null = null;
  
  // Track out of bounds timing for debouncing
  private lastOutOfBoundsTime: number | null = null;
  
  // Flag to disable out-of-bounds checking (e.g., during OutOfBounds phase)
  private outOfBoundsCheckDisabled: boolean = false;

  constructor() {
    this.engine = Engine.create({
      gravity: { x: 0, y: 0, scale: 0 }, // Top-down view, no gravity
    });
    
    // CRITICAL: Disable sleeping to prevent position/velocity issues
    this.engine.enableSleeping = false;
    
    this.setupCollisionHandlers();
  }

  // Initialize the physics world
  initialize(): void {
    // Reset out-of-bounds state
    this.outOfBoundsCheckDisabled = false;
    this.lastOutOfBoundsTime = null;
    
    // Clear any existing bodies first
    World.clear(this.engine.world, false);
    this.robots.clear();
    
    this.createWalls();
    this.createGoals();
    this.createBall();
  }

  // Create field boundaries
  // Walls are at the OUTER boundary (30cm beyond field lines)
  // This creates an outer area where robots can roam
  private createWalls(): void {
    const wallOptions = {
      isStatic: true,
      restitution: PHYSICS.WALL_RESTITUTION,
      friction: 0.1,
      collisionFilter: {
        category: CATEGORY.WALL,
        mask: CATEGORY.BALL | CATEGORY.ROBOT,
      },
      render: { fillStyle: COLORS.WALL_BLACK },
      label: 'wall',
    };

    // Walls at the OUTER boundary (field + outer area)
    const outerHalfW = FIELD.WIDTH / 2 + FIELD.OUTER_WIDTH;   // 91 + 30 = 121 cm
    const outerHalfH = FIELD.HEIGHT / 2 + FIELD.OUTER_WIDTH;  // 121.5 + 30 = 151.5 cm
    const wallThickness = 10;
    const goalHalfW = GOAL.WIDTH / 2; // 35 cm
    
    // Calculate wall segment width on each side of goal
    // Goal opening is at field boundary, outer walls extend to meet it
    const fieldHalfW = FIELD.WIDTH / 2;
    const fieldHalfH = FIELD.HEIGHT / 2;
    const outerWallSegmentWidth = (FIELD.TOTAL_WIDTH - GOAL.WIDTH) / 2; // (242 - 70) / 2 = 86 cm

    // Top wall (with goal opening) - Blue goal side
    // Walls at outer boundary, goal opening at field boundary
    const topLeftWall = Bodies.rectangle(
      -outerHalfW + outerWallSegmentWidth / 2,
      -outerHalfH - wallThickness / 2,
      outerWallSegmentWidth,
      wallThickness,
      { ...wallOptions, label: 'wall_top' }
    );
    const topRightWall = Bodies.rectangle(
      outerHalfW - outerWallSegmentWidth / 2,
      -outerHalfH - wallThickness / 2,
      outerWallSegmentWidth,
      wallThickness,
      { ...wallOptions, label: 'wall_top' }
    );

    // Bottom wall (with goal opening) - Yellow goal side
    const bottomLeftWall = Bodies.rectangle(
      -outerHalfW + outerWallSegmentWidth / 2,
      outerHalfH + wallThickness / 2,
      outerWallSegmentWidth,
      wallThickness,
      { ...wallOptions, label: 'wall_bottom' }
    );
    const bottomRightWall = Bodies.rectangle(
      outerHalfW - outerWallSegmentWidth / 2,
      outerHalfH + wallThickness / 2,
      outerWallSegmentWidth,
      wallThickness,
      { ...wallOptions, label: 'wall_bottom' }
    );

    // Side walls (full height including outer area)
    const leftWall = Bodies.rectangle(
      -outerHalfW - wallThickness / 2,
      0,
      wallThickness,
      FIELD.TOTAL_HEIGHT,
      { ...wallOptions, label: 'wall_left' }
    );
    const rightWall = Bodies.rectangle(
      outerHalfW + wallThickness / 2,
      0,
      wallThickness,
      FIELD.TOTAL_HEIGHT,
      { ...wallOptions, label: 'wall_right' }
    );

    // Diagonal walls connecting goal area to outer walls (top/blue side)
    const topLeftDiag = Bodies.rectangle(
      -goalHalfW - (FIELD.OUTER_WIDTH / 2),
      -fieldHalfH - (FIELD.OUTER_WIDTH / 2),
      FIELD.OUTER_WIDTH * 1.5,
      wallThickness,
      { ...wallOptions, label: 'wall_top', angle: Math.PI / 4 }
    );
    const topRightDiag = Bodies.rectangle(
      goalHalfW + (FIELD.OUTER_WIDTH / 2),
      -fieldHalfH - (FIELD.OUTER_WIDTH / 2),
      FIELD.OUTER_WIDTH * 1.5,
      wallThickness,
      { ...wallOptions, label: 'wall_top', angle: -Math.PI / 4 }
    );

    // Diagonal walls connecting goal area to outer walls (bottom/yellow side)
    const bottomLeftDiag = Bodies.rectangle(
      -goalHalfW - (FIELD.OUTER_WIDTH / 2),
      fieldHalfH + (FIELD.OUTER_WIDTH / 2),
      FIELD.OUTER_WIDTH * 1.5,
      wallThickness,
      { ...wallOptions, label: 'wall_bottom', angle: -Math.PI / 4 }
    );
    const bottomRightDiag = Bodies.rectangle(
      goalHalfW + (FIELD.OUTER_WIDTH / 2),
      fieldHalfH + (FIELD.OUTER_WIDTH / 2),
      FIELD.OUTER_WIDTH * 1.5,
      wallThickness,
      { ...wallOptions, label: 'wall_bottom', angle: Math.PI / 4 }
    );

    this.walls = [
      topLeftWall, topRightWall, bottomLeftWall, bottomRightWall,
      leftWall, rightWall,
      topLeftDiag, topRightDiag, bottomLeftDiag, bottomRightDiag
    ];
    World.add(this.engine.world, this.walls);
    
    // Ball bounces off the outer walls (already created above)
    // No inner walls at field lines - ball can enter outer area before OOB is triggered
  }

  // Create goals
  // Goals are at the FIELD boundary (not outer boundary)
  private createGoals(): void {
    const goalDepth = GOAL.DEPTH;
    const fieldHalfH = FIELD.HEIGHT / 2;
    
    // Blue goal (top) - at field boundary
    const blueGoalBack = Bodies.rectangle(
      0,
      -fieldHalfH - goalDepth + 5,  // Back wall of goal
      GOAL.WIDTH,
      5,
      {
        isStatic: true,
        isSensor: true,
        label: 'goal_blue',
        collisionFilter: { category: CATEGORY.GOAL, mask: CATEGORY.BALL },
      }
    );
    
    // Yellow goal (bottom) - at field boundary
    const yellowGoalBack = Bodies.rectangle(
      0,
      fieldHalfH + goalDepth - 5,  // Back wall of goal
      GOAL.WIDTH,
      5,
      {
        isStatic: true,
        isSensor: true,
        label: 'goal_yellow',
        collisionFilter: { category: CATEGORY.GOAL, mask: CATEGORY.BALL },
      }
    );

    // Goal side walls and back walls (physical barriers)
    const goalWallOptions = {
      isStatic: true,
      restitution: PHYSICS.WALL_RESTITUTION,
      collisionFilter: { category: CATEGORY.WALL, mask: CATEGORY.BALL | CATEGORY.ROBOT },
    };

    // Blue goal walls
    const blueGoalLeft = Bodies.rectangle(-GOAL.WIDTH / 2 - 2.5, -fieldHalfH - goalDepth / 2, 5, goalDepth + 5, goalWallOptions);
    const blueGoalRight = Bodies.rectangle(GOAL.WIDTH / 2 + 2.5, -fieldHalfH - goalDepth / 2, 5, goalDepth + 5, goalWallOptions);
    const blueGoalBackWall = Bodies.rectangle(0, -fieldHalfH - goalDepth - 2.5, GOAL.WIDTH + 10, 5, goalWallOptions);

    // Yellow goal walls
    const yellowGoalLeft = Bodies.rectangle(-GOAL.WIDTH / 2 - 2.5, fieldHalfH + goalDepth / 2, 5, goalDepth + 5, goalWallOptions);
    const yellowGoalRight = Bodies.rectangle(GOAL.WIDTH / 2 + 2.5, fieldHalfH + goalDepth / 2, 5, goalDepth + 5, goalWallOptions);
    const yellowGoalBackWall = Bodies.rectangle(0, fieldHalfH + goalDepth + 2.5, GOAL.WIDTH + 10, 5, goalWallOptions);

    this.goals.blue = blueGoalBack;
    this.goals.yellow = yellowGoalBack;

    World.add(this.engine.world, [
      blueGoalBack, yellowGoalBack,
      blueGoalLeft, blueGoalRight, blueGoalBackWall,
      yellowGoalLeft, yellowGoalRight, yellowGoalBackWall,
    ]);
  }

  // Create the ball
  private createBall(): void {
    // Remove old ball if it exists
    if (this.ball) {
      World.remove(this.engine.world, this.ball);
    }
    
    this.ball = Bodies.circle(0, 0, BALL.RADIUS, {
      restitution: PHYSICS.BALL_RESTITUTION,
      friction: PHYSICS.BALL_FRICTION,
      frictionAir: 0.03, // Air friction for realistic slowdown
      mass: BALL.MASS,
      inertia: Infinity, // Prevent rotation affecting collision
      label: 'ball',
      collisionFilter: {
        category: CATEGORY.BALL,
        mask: CATEGORY.WALL | CATEGORY.ROBOT | CATEGORY.GOAL,
      },
      render: { fillStyle: COLORS.BALL_ORANGE },
    });

    World.add(this.engine.world, this.ball);
  }

  // Create robot as a simple circle (pac-man visuals are rendered separately)
  // Using circle instead of complex vertices to avoid Matter.js decomposition issues
  createRobot(id: string, team: Team, role: RobotRole, x: number, y: number, angle: number): void {
    // Use a simple circle for physics - the pac-man shape is just visual
    // Make robot heavier but with low restitution to avoid bouncing ball too hard
    const body = Bodies.circle(x, y, ROBOT.RADIUS, {
      restitution: 0.1, // Low restitution to avoid bouncing ball too hard
      friction: ROBOT_FRICTION,
      frictionAir: 0.1,
      mass: ROBOT.MASS,
      inertia: Infinity, // Prevent rotation affecting collision
      label: `robot_${id}`,
      collisionFilter: {
        category: CATEGORY.ROBOT,
        mask: CATEGORY.WALL | CATEGORY.BALL | CATEGORY.ROBOT,
      },
    });

    Body.setAngle(body, angle);

    this.robots.set(id, { id, body, team, role });
    World.add(this.engine.world, body);
  }

  // Remove a robot
  removeRobot(id: string): void {
    const robot = this.robots.get(id);
    if (robot) {
      World.remove(this.engine.world, robot.body);
      this.robots.delete(id);
    }
  }

  // Set up collision event handlers
  private setupCollisionHandlers(): void {
    // Collision start - check for goals
    Events.on(this.engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const labelA = pair.bodyA.label;
        const labelB = pair.bodyB.label;

        // Check for ball collisions with goals
        if (labelA === 'ball' || labelB === 'ball') {
          const otherLabel = labelA === 'ball' ? labelB : labelA;
          
          if (otherLabel === 'goal_blue' && this.onGoalScored) {
            this.onGoalScored('yellow');
          } else if (otherLabel === 'goal_yellow' && this.onGoalScored) {
            this.onGoalScored('blue');
          }
        }

        if (this.onCollision) {
          this.onCollision(labelA, labelB);
        }
      }
    });
  }

  // Apply action to a robot using position-based (kinematic) movement
  // This avoids physics instabilities from setVelocity interfering with collision resolution
  applyAction(robotId: string, action: Action): void {
    const robot = this.robots.get(robotId);
    if (!robot) return;

    const body = robot.body;
    const angle = body.angle;
    const pos = body.position;

    const { motor1, motor2, motor3, motor4 } = action;
    
    // Left side motors (1=front-left, 4=back-left)
    const leftSide = (motor1 + motor4) / 2;
    // Right side motors (2=front-right, 3=back-right)
    const rightSide = (motor2 + motor3) / 2;
    
    // Forward = average of both sides
    const forward = (leftSide + rightSide) / 2;
    
    // Rotation = difference between sides (right - left = turn right/clockwise)
    const rotation = (rightSide - leftSide) / 2;

    // Calculate movement for this frame
    const dt = 0.016; // ~60 FPS timestep
    const maxSpeed = ROBOT.MAX_SPEED * dt; // cm per frame
    const maxAngular = (ROBOT.MAX_ANGULAR_SPEED * Math.PI / 180) * dt; // rad per frame

    // Calculate new position
    const moveX = forward * Math.cos(angle) * maxSpeed;
    const moveY = forward * Math.sin(angle) * maxSpeed;
    const newAngle = angle + rotation * maxAngular;

    // Move robot kinematically (position-based)
    Body.setPosition(body, { x: pos.x + moveX, y: pos.y + moveY });
    Body.setAngle(body, newAngle);
    
    // Set small velocity in direction of movement (helps with collision response)
    Body.setVelocity(body, { x: moveX * 2, y: moveY * 2 });

    // Handle kick
    if (action.kick && this.ball) {
      const ballPos = this.ball.position;
      const robotPos = body.position;
      const toBall = Vector.sub(ballPos, robotPos);
      const dist = Vector.magnitude(toBall);
      
      // Check if ball is in front of robot (in the kicker area)
      const robotDirection = { x: Math.cos(newAngle), y: Math.sin(newAngle) };
      const dotProduct = Vector.dot(toBall, robotDirection);
      
      if (dist < ROBOT.RADIUS + BALL.RADIUS + ROBOT.KICKER_RANGE && dotProduct > 0) {
        // Ball is in kick range and in front - apply kick force
        const kickDir = Vector.normalise(robotDirection);
        const kickStrength = ROBOT.KICK_FORCE * 0.0005; // Reduced kick strength
        Body.setVelocity(this.ball, {
          x: kickDir.x * kickStrength,
          y: kickDir.y * kickStrength,
        });
      }
    }
  }

  // Step the physics simulation
  step(deltaMs: number): void {
    // Use a smaller timestep to prevent large jumps
    const clampedDeltaMs = Math.min(deltaMs, 16); // Cap at 16ms (~60 FPS)
    
    Engine.update(this.engine, clampedDeltaMs);
    
    // Post-update ball velocity clamping
    if (this.ball) {
      const vel = this.ball.velocity;
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
      const maxSpeed = 5; // Max 5 cm per frame (~300 cm/s at 60fps)
      
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        Body.setVelocity(this.ball, { x: vel.x * scale, y: vel.y * scale });
      }
      
      // Clamp ball to within OUTER walls (safety net)
      const maxX = FIELD.WIDTH / 2 + FIELD.OUTER_WIDTH - BALL.RADIUS - 1;
      const maxY = FIELD.HEIGHT / 2 + FIELD.OUTER_WIDTH - BALL.RADIUS - 1;
      const pos = this.ball.position;
      
      if (Math.abs(pos.x) > maxX || Math.abs(pos.y) > maxY) {
        const clampedX = Math.max(-maxX, Math.min(maxX, pos.x));
        const clampedY = Math.max(-maxY, Math.min(maxY, pos.y));
        Body.setPosition(this.ball, { x: clampedX, y: clampedY });
        Body.setVelocity(this.ball, { x: 0, y: 0 });
      }
    }
    
    // Check for out-of-bounds (ball crossing field lines into outer area)
    if (!this.outOfBoundsCheckDisabled) {
      this.checkBallOutOfBounds();
    }
    
    // Check for robots in goal areas (out of bounds for robots)
    this.checkRobotsInGoalAreas();
  }

  // Check if robots are in goal areas (out of bounds for robots)
  // Goal areas are IN FRONT of each goal (on the field side), not behind
  private checkRobotsInGoalAreas(): void {
    if (!this.onRobotOutOfBounds) return;
    
    const halfH = FIELD.HEIGHT / 2;
    const goalAreaW = FIELD.PENALTY_AREA_WIDTH / 2; // half-width
    const goalAreaD = FIELD.PENALTY_AREA_DEPTH;
    const robotRadius = ROBOT.RADIUS;
    
    // Blue goal area (top) - rectangle IN FRONT of goal (toward center)
    // Blue goal is at y = -halfH, area extends from goal line toward center
    const blueGoalAreaStart = -halfH; // Goal line
    const blueGoalAreaEnd = -halfH + goalAreaD; // Extends toward center
    
    // Yellow goal area (bottom) - rectangle IN FRONT of goal (toward center)
    // Yellow goal is at y = halfH, area extends from goal line toward center
    const yellowGoalAreaStart = halfH - goalAreaD; // Extends toward center
    const yellowGoalAreaEnd = halfH; // Goal line
    
    for (const [id, robot] of this.robots) {
      const pos = robot.body.position;
      
      // Check if robot center is in blue goal area (in front of blue goal)
      if (pos.y >= blueGoalAreaStart && pos.y <= blueGoalAreaEnd &&
          Math.abs(pos.x) <= goalAreaW + robotRadius) {
        this.onRobotOutOfBounds(id, 'blue');
        continue;
      }
      
      // Check if robot center is in yellow goal area (in front of yellow goal)
      if (pos.y >= yellowGoalAreaStart && pos.y <= yellowGoalAreaEnd &&
          Math.abs(pos.x) <= goalAreaW + robotRadius) {
        this.onRobotOutOfBounds(id, 'yellow');
        continue;
      }
    }
  }

  // Check if ball is out of bounds (crossed field lines into outer area)
  // White lines are the boundary - ball can enter outer area but this triggers OOB
  private checkBallOutOfBounds(): void {
    if (!this.ball || !this.onOutOfBounds || this.outOfBoundsCheckDisabled) return;

    const pos = this.ball.position;
    const fieldHalfW = FIELD.WIDTH / 2;  // 91 cm
    const fieldHalfH = FIELD.HEIGHT / 2; // 121.5 cm
    const goalHalfW = GOAL.WIDTH / 2;     // 35 cm
    
    // Ball must be beyond the field line (white line) to trigger OOB
    // Small margin to avoid triggering on edge touches
    const margin = BALL.RADIUS + 2; // Ball center must be past line + small buffer
    
    // Debounce - don't trigger OOB too frequently
    if (this.lastOutOfBoundsTime && Date.now() - this.lastOutOfBoundsTime < 2000) {
      return;
    }

    // Check each side
    if (pos.x < -fieldHalfW - margin) {
      this.lastOutOfBoundsTime = Date.now();
      this.onOutOfBounds('left');
      return;
    }
    if (pos.x > fieldHalfW + margin) {
      this.lastOutOfBoundsTime = Date.now();
      this.onOutOfBounds('right');
      return;
    }
    if (pos.y < -fieldHalfH - margin && Math.abs(pos.x) > goalHalfW) {
      this.lastOutOfBoundsTime = Date.now();
      this.onOutOfBounds('top');
      return;
    }
    if (pos.y > fieldHalfH + margin && Math.abs(pos.x) > goalHalfW) {
      this.lastOutOfBoundsTime = Date.now();
      this.onOutOfBounds('bottom');
      return;
    }
  }


  // Get current physics state
  getState(): PhysicsState {
    const robotStates = new Map<string, { x: number; y: number; angle: number; vx: number; vy: number }>();
    
    for (const [id, robot] of this.robots) {
      robotStates.set(id, {
        x: robot.body.position.x,
        y: robot.body.position.y,
        angle: robot.body.angle,
        vx: robot.body.velocity.x,
        vy: robot.body.velocity.y,
      });
    }

    const ballState = this.ball ? {
      x: this.ball.position.x,
      y: this.ball.position.y,
      vx: this.ball.velocity.x,
      vy: this.ball.velocity.y,
    } : { x: 0, y: 0, vx: 0, vy: 0 };
    
    return {
      ball: ballState,
      robots: robotStates,
    };
  }

  // Set ball position
  setBallPosition(x: number, y: number): void {
    if (this.ball) {
      Body.setPosition(this.ball, { x, y });
      Body.setVelocity(this.ball, { x: 0, y: 0 });
      Body.setAngularVelocity(this.ball, 0);
    }
  }

  // Set robot position
  setRobotPosition(id: string, x: number, y: number, angle?: number): void {
    const robot = this.robots.get(id);
    if (robot) {
      Body.setPosition(robot.body, { x, y });
      Body.setVelocity(robot.body, { x: 0, y: 0 });
      Body.setAngularVelocity(robot.body, 0);
      if (angle !== undefined) {
        Body.setAngle(robot.body, angle);
      }
      this.resetOutOfBoundsTimer();
    }
  }

  // Event setters
  setOnGoalScored(callback: (team: Team) => void): void {
    this.onGoalScored = callback;
  }

  setOnOutOfBounds(callback: (side: 'top' | 'bottom' | 'left' | 'right') => void): void {
    this.onOutOfBounds = callback;
  }

  setOnRobotOutOfBounds(callback: (robotId: string, goalArea: 'blue' | 'yellow') => void): void {
    this.onRobotOutOfBounds = callback;
  }

  setOnCollision(callback: (a: string, b: string) => void): void {
    this.onCollision = callback;
  }

  // Reset out of bounds debounce timer (call when resuming play)
  resetOutOfBoundsTimer(): void {
    this.lastOutOfBoundsTime = null;
  }

  // Enable/disable out-of-bounds checking (e.g., during OutOfBounds phase)
  setOutOfBoundsCheckEnabled(enabled: boolean): void {
    this.outOfBoundsCheckDisabled = !enabled;
    if (enabled) {
      this.lastOutOfBoundsTime = null; // Reset timer when re-enabling
    }
  }

  // Move robot outside goal area
  // Goal areas are IN FRONT of goals (on field side), so move robots toward center
  moveRobotOutsideGoalArea(robotId: string, goalArea: 'blue' | 'yellow'): void {
    const robot = this.robots.get(robotId);
    if (!robot) return;
    
    const pos = robot.body.position;
    const halfH = FIELD.HEIGHT / 2;
    const goalAreaW = FIELD.PENALTY_AREA_WIDTH / 2;
    const goalAreaD = FIELD.PENALTY_AREA_DEPTH;
    const robotRadius = ROBOT.RADIUS;
    const margin = robotRadius + 2; // Small margin outside goal area
    
    let newX = pos.x;
    let newY = pos.y;
    
    if (goalArea === 'blue') {
      // Blue goal area is IN FRONT of blue goal (extends from y=-halfH toward center)
      // Move robot past the goal area, toward center (more positive Y)
      newY = -halfH + goalAreaD + margin;
      
      // If robot is also horizontally in goal area, move it sideways first
      if (Math.abs(pos.x) <= goalAreaW + robotRadius) {
        // Move to nearest side outside goal area
        if (pos.x >= 0) {
          newX = goalAreaW + margin;
        } else {
          newX = -goalAreaW - margin;
        }
      }
    } else {
      // Yellow goal area is IN FRONT of yellow goal (extends from y=halfH toward center)
      // Move robot past the goal area, toward center (more negative Y)
      newY = halfH - goalAreaD - margin;
      
      // If robot is also horizontally in goal area, move it sideways first
      if (Math.abs(pos.x) <= goalAreaW + robotRadius) {
        // Move to nearest side outside goal area
        if (pos.x >= 0) {
          newX = goalAreaW + margin;
        } else {
          newX = -goalAreaW - margin;
        }
      }
    }
    
    // Clamp to field bounds
    const fieldHalfW = FIELD.WIDTH / 2 - robotRadius;
    const fieldHalfH = FIELD.HEIGHT / 2 - robotRadius;
    newX = Math.max(-fieldHalfW, Math.min(fieldHalfW, newX));
    newY = Math.max(-fieldHalfH, Math.min(fieldHalfH, newY));
    
    Body.setPosition(robot.body, { x: newX, y: newY });
    Body.setVelocity(robot.body, { x: 0, y: 0 });
  }

  // Move robots away from a position (for out of bounds repositioning)
  pushRobotsAwayFrom(x: number, y: number, minDistance: number): void {
    for (const [id, robot] of this.robots) {
      const robotPos = robot.body.position;
      const dx = robotPos.x - x;
      const dy = robotPos.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < minDistance && dist > 0) {
        // Push robot away to minimum distance
        const scale = minDistance / dist;
        const newX = x + dx * scale;
        const newY = y + dy * scale;
        
        // Clamp to field bounds
        const fieldHalfW = FIELD.WIDTH / 2 - ROBOT.RADIUS;
        const fieldHalfH = FIELD.HEIGHT / 2 - ROBOT.RADIUS;
        const clampedX = Math.max(-fieldHalfW, Math.min(fieldHalfW, newX));
        const clampedY = Math.max(-fieldHalfH, Math.min(fieldHalfH, newY));
        
        Body.setPosition(robot.body, { x: clampedX, y: clampedY });
        Body.setVelocity(robot.body, { x: 0, y: 0 });
      } else if (dist === 0) {
        // Robot is exactly at ball position, move it away
        const newX = x + minDistance;
        Body.setPosition(robot.body, { x: newX, y });
        Body.setVelocity(robot.body, { x: 0, y: 0 });
      }
    }
  }

  // Get robot bodies for rendering
  getRobots(): Map<string, RobotBody> {
    return this.robots;
  }

  // Get ball body for rendering
  getBall(): Matter.Body | null {
    return this.ball;
  }

  // Reset physics world
  reset(): void {
    // Clear robots
    for (const robot of this.robots.values()) {
      World.remove(this.engine.world, robot.body);
    }
    this.robots.clear();

    // Reset ball position
    this.setBallPosition(0, 0);
  }

  // Dispose
  dispose(): void {
    World.clear(this.engine.world, false);
    Engine.clear(this.engine);
  }
}

// Robot friction constant
const ROBOT_FRICTION = 0.05;

