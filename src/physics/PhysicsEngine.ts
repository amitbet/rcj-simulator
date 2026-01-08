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
    
    this.createWalls();
    this.createGoals();
    this.createBall();
    
    // CRITICAL: After creating everything, ensure ball has zero velocity
    if (this.ball) {
      Body.setVelocity(this.ball, { x: 0, y: 0 });
      Body.setAngularVelocity(this.ball, 0);
      Body.setPosition(this.ball, { x: 0, y: 0 });
      
      // Force Matter.js to recognize the position/velocity
      Body.update(this.ball, 0, 1, 0);
      
      console.log(`[initialize] Ball initialized - Position: (${this.ball.position.x.toFixed(1)}, ${this.ball.position.y.toFixed(1)}), Velocity: (${this.ball.velocity.x.toFixed(3)}, ${this.ball.velocity.y.toFixed(3)})`);
    }
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

    // --- Ball-only inner walls slightly INSIDE the FIELD boundary (so ball bounces before crossing line) ---
    // Position walls 2cm inside to prevent ball from crossing boundary during bounce
    const ballWallInset = 2; // cm inside the field boundary
    const ballWallOptions = {
      isStatic: true,
      restitution: PHYSICS.BALL_RESTITUTION, // use ball restitution for bounce
      friction: PHYSICS.BALL_FRICTION,
      collisionFilter: {
        category: CATEGORY.WALL,
        mask: CATEGORY.BALL, // only ball collides; robots can cross field line
      },
      render: { visible: false }, // invisible helper walls
    };

    const thin = 2;

    // Position walls slightly inside field boundary to prevent out-of-bounds triggers
    const ballWallTop = Bodies.rectangle(0, -fieldHalfH + ballWallInset, FIELD.WIDTH, thin, { ...ballWallOptions, label: 'ball_wall_top' });
    const ballWallBottom = Bodies.rectangle(0, fieldHalfH - ballWallInset, FIELD.WIDTH, thin, { ...ballWallOptions, label: 'ball_wall_bottom' });
    const ballWallLeft = Bodies.rectangle(-fieldHalfW + ballWallInset, 0, thin, FIELD.HEIGHT - ballWallInset * 2, { ...ballWallOptions, label: 'ball_wall_left' });
    const ballWallRight = Bodies.rectangle(fieldHalfW - ballWallInset, 0, thin, FIELD.HEIGHT - ballWallInset * 2, { ...ballWallOptions, label: 'ball_wall_right' });

    World.add(this.engine.world, [ballWallTop, ballWallBottom, ballWallLeft, ballWallRight]);
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
      frictionAir: 0.01, // slightly higher air friction so ball slows realistically
      mass: BALL.MASS,
      density: BALL.MASS / (Math.PI * BALL.RADIUS * BALL.RADIUS), // Explicit density
      label: 'ball',
      isStatic: false,
      isSensor: false,
      collisionFilter: {
        category: CATEGORY.BALL,
        mask: CATEGORY.WALL | CATEGORY.ROBOT | CATEGORY.GOAL,
      },
      render: { fillStyle: COLORS.BALL_ORANGE },
    });

    // CRITICAL: Ensure ball starts with zero velocity BEFORE adding to world
    Body.setVelocity(this.ball, { x: 0, y: 0 });
    Body.setAngularVelocity(this.ball, 0);
    Body.setPosition(this.ball, { x: 0, y: 0 });
    
    // Make ball non-sleeping
    Body.setStatic(this.ball, false);
    this.ball.isSleeping = false;
    
    console.log(`[createBall] Created ball at (0, 0) with velocity (${this.ball.velocity.x}, ${this.ball.velocity.y})`);
    
    World.add(this.engine.world, this.ball);
    
    // Immediately verify and reset after adding to world
    Body.setVelocity(this.ball, { x: 0, y: 0 });
    Body.setAngularVelocity(this.ball, 0);
    Body.setPosition(this.ball, { x: 0, y: 0 });
    Body.update(this.ball, 0, 1, 0);
    
    console.log(`[createBall] After adding to world - Position: (${this.ball.position.x.toFixed(1)}, ${this.ball.position.y.toFixed(1)}), Velocity: (${this.ball.velocity.x.toFixed(3)}, ${this.ball.velocity.y.toFixed(3)})`);
  }

  // Create a pac-man shaped robot
  createRobot(id: string, team: Team, role: RobotRole, x: number, y: number, angle: number): void {
    // Create pac-man shape using vertices
    const vertices = this.createPacManVertices(ROBOT.RADIUS, ROBOT.NOTCH_ANGLE);
    
    const body = Bodies.fromVertices(x, y, [vertices], {
      restitution: PHYSICS.ROBOT_RESTITUTION,
      friction: ROBOT_FRICTION,
      frictionAir: 0.1,
      mass: ROBOT.MASS,
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

  // Create pac-man vertices
  private createPacManVertices(radius: number, notchAngleDeg: number): Matter.Vector[] {
    const vertices: Matter.Vector[] = [];
    const notchAngle = (notchAngleDeg * Math.PI) / 180;
    const segments = 24;
    
    // Start from center for the notch
    vertices.push({ x: 0, y: 0 });
    
    // Create arc, skipping the notch area (front of robot, facing right initially)
    for (let i = 0; i <= segments; i++) {
      const angle = (notchAngle / 2) + (i / segments) * (2 * Math.PI - notchAngle);
      vertices.push({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      });
    }
    
    return vertices;
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
    Events.on(this.engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const labelA = pair.bodyA.label;
        const labelB = pair.bodyB.label;

        // DEBUG: Log ball collisions to see what's causing velocity spikes
        if (labelA === 'ball' || labelB === 'ball') {
          const ballBody = labelA === 'ball' ? pair.bodyA : pair.bodyB;
          const otherBody = labelA === 'ball' ? pair.bodyB : pair.bodyA;
          const otherLabel = labelA === 'ball' ? labelB : labelA;
          
          console.log(`[collisionStart] Ball collided with ${otherLabel}`);
          console.log(`  Ball position: (${ballBody.position.x.toFixed(1)}, ${ballBody.position.y.toFixed(1)})`);
          console.log(`  Ball velocity: (${ballBody.velocity.x.toFixed(3)}, ${ballBody.velocity.y.toFixed(3)})`);
          console.log(`  Other position: (${otherBody.position.x.toFixed(1)}, ${otherBody.position.y.toFixed(1)})`);
          console.log(`  Other velocity: (${otherBody.velocity.x.toFixed(3)}, ${otherBody.velocity.y.toFixed(3)})`);
          
          // Check for goal
          if (otherLabel === 'goal_blue' && this.onGoalScored) {
            this.onGoalScored('yellow'); // Yellow scores on blue goal
          } else if (otherLabel === 'goal_yellow' && this.onGoalScored) {
            this.onGoalScored('blue'); // Blue scores on yellow goal
          }
        }

        // Notify collision
        if (this.onCollision) {
          this.onCollision(labelA, labelB);
        }
      }
    });
    
    // Also log collisionActive to catch ongoing collisions
    Events.on(this.engine, 'collisionActive', (event) => {
      for (const pair of event.pairs) {
        if (pair.bodyA.label === 'ball' || pair.bodyB.label === 'ball') {
          const ballBody = pair.bodyA.label === 'ball' ? pair.bodyA : pair.bodyB;
          if (Math.abs(ballBody.velocity.x) > 100 || Math.abs(ballBody.velocity.y) > 100) {
            console.error(`[collisionActive] Ball has huge velocity during collision!`);
            console.error(`  Velocity: (${ballBody.velocity.x.toFixed(3)}, ${ballBody.velocity.y.toFixed(3)})`);
            // Reset velocity if it's too high
            Body.setVelocity(ballBody, { x: 0, y: 0 });
          }
        }
      }
    });
  }

  // Apply action to a robot
  applyAction(robotId: string, action: Action): void {
    const robot = this.robots.get(robotId);
    if (!robot) return;

    const body = robot.body;
    const angle = body.angle;

    // Simplified motor model:
    // - All motors positive = forward (toward kicker/notch)
    // - Left motors (1,4) negative + Right motors (2,3) positive = turn right
    // - Left motors (1,4) positive + Right motors (2,3) negative = turn left
    const { motor1, motor2, motor3, motor4 } = action;
    
    // Left side motors (1=front-left, 4=back-left)
    const leftSide = (motor1 + motor4) / 2;
    // Right side motors (2=front-right, 3=back-right)
    const rightSide = (motor2 + motor3) / 2;
    
    // Forward = average of both sides
    const forward = (leftSide + rightSide) / 2;
    
    // Rotation = difference between sides (right - left = turn right/clockwise)
    const rotation = (rightSide - leftSide) / 2;

    // Convert to world coordinates
    // Forward direction is the robot's current heading (where the kicker points)
    const maxSpeed = ROBOT.MAX_SPEED;
    const vx = forward * Math.cos(angle) * maxSpeed;
    const vy = forward * Math.sin(angle) * maxSpeed;
    const angularVel = rotation * (ROBOT.MAX_ANGULAR_SPEED * Math.PI / 180);

    // Apply velocities (scaled for physics timestep)
    const dt = 0.0167; // ~60 FPS
    Body.setVelocity(body, { x: vx * dt, y: vy * dt });
    Body.setAngularVelocity(body, angularVel * dt);

    // Handle kick
    if (action.kick && this.ball) {
      const ballPos = this.ball.position;
      const robotPos = body.position;
      const dist = Vector.magnitude(Vector.sub(ballPos, robotPos));
      
      // Check if ball is in front of robot (in the notch)
      const toBall = Vector.sub(ballPos, robotPos);
      const robotDirection = { x: Math.cos(angle), y: Math.sin(angle) };
      const dotProduct = Vector.dot(toBall, robotDirection);
      
      if (dist < ROBOT.RADIUS + BALL.RADIUS + ROBOT.KICKER_RANGE && dotProduct > 0) {
        // Ball is in kick range and in front
        const kickDir = Vector.normalise(robotDirection);
        Body.applyForce(this.ball, ballPos, {
          x: kickDir.x * ROBOT.KICK_FORCE * 0.001,
          y: kickDir.y * ROBOT.KICK_FORCE * 0.001,
        });
      }
    }
  }

  // Step the physics simulation
  step(deltaMs: number): void {
    // CRITICAL: Check for bad velocity BEFORE update and reset it
    if (this.ball) {
      const hasBadVelocity = Math.abs(this.ball.velocity.x) > 10 || Math.abs(this.ball.velocity.y) > 10;
      const hasBadPosition = Math.abs(this.ball.position.x) > 200 || Math.abs(this.ball.position.y) > 200;
      
      if (hasBadVelocity) {
        console.error(`[step] BAD VELOCITY DETECTED BEFORE UPDATE! Resetting. Velocity: (${this.ball.velocity.x.toFixed(3)}, ${this.ball.velocity.y.toFixed(3)})`);
        Body.setVelocity(this.ball, { x: 0, y: 0 });
        Body.setAngularVelocity(this.ball, 0);
        Body.update(this.ball, 0, 1, 0); // Force update
      }
      
      if (hasBadPosition) {
        console.error(`[step] BAD POSITION DETECTED BEFORE UPDATE! Resetting. Position: (${this.ball.position.x.toFixed(1)}, ${this.ball.position.y.toFixed(1)})`);
        Body.setPosition(this.ball, { x: 0, y: 0 });
        Body.setVelocity(this.ball, { x: 0, y: 0 });
        Body.update(this.ball, 0, 1, 0); // Force update
      }
    }
    
    // Use a smaller timestep to prevent large jumps
    const clampedDeltaMs = Math.min(deltaMs, 20); // Cap at 20ms (50 FPS minimum)
    
    Engine.update(this.engine, clampedDeltaMs);
    
    // CRITICAL: Check for bad velocity/position AFTER update and reset it
    if (this.ball) {
      const hasBadVelocity = Math.abs(this.ball.velocity.x) > 10 || Math.abs(this.ball.velocity.y) > 10;
      const hasBadPosition = Math.abs(this.ball.position.x) > 200 || Math.abs(this.ball.position.y) > 200;
      
      if (hasBadVelocity) {
        console.error(`[step] BAD VELOCITY DETECTED AFTER UPDATE! Resetting. Velocity: (${this.ball.velocity.x.toFixed(3)}, ${this.ball.velocity.y.toFixed(3)})`);
        Body.setVelocity(this.ball, { x: 0, y: 0 });
        Body.setAngularVelocity(this.ball, 0);
        Body.update(this.ball, 0, 1, 0); // Force update
      }
      
      if (hasBadPosition) {
        console.error(`[step] BAD POSITION DETECTED AFTER UPDATE! Resetting. Position: (${this.ball.position.x.toFixed(1)}, ${this.ball.position.y.toFixed(1)})`);
        Body.setPosition(this.ball, { x: 0, y: 0 });
        Body.setVelocity(this.ball, { x: 0, y: 0 });
        Body.update(this.ball, 0, 1, 0); // Force update
      }
    }
    
    // Only check out-of-bounds if checking is enabled
    // This prevents false triggers during OutOfBounds phase or kickoff
    if (!this.outOfBoundsCheckDisabled) {
      this.checkBallOutOfBounds();
    }
  }

  // Check if ball is out of bounds
  // Ball is out when it crosses the FIELD lines (not the outer walls)
  // Exception: ball entering goal area is not out of bounds
  private checkBallOutOfBounds(): void {
    // Early returns - don't check if conditions aren't met
    if (!this.ball) return;
    if (!this.onOutOfBounds) return;
    
    // Don't check if disabled (e.g., during OutOfBounds phase)
    if (this.outOfBoundsCheckDisabled) {
      return;
    }

    const pos = this.ball.position;
    const fieldHalfW = FIELD.WIDTH / 2;  // 91 cm
    const fieldHalfH = FIELD.HEIGHT / 2; // 121.5 cm
    const goalHalfW = GOAL.WIDTH / 2;     // 35 cm
    
    // DEBUG: Log ball position every frame when it's suspiciously far
    if (Math.abs(pos.x) > 200 || Math.abs(pos.y) > 200) {
      console.log(`[checkBallOutOfBounds] SUSPICIOUS POSITION: x=${pos.x.toFixed(1)}, y=${pos.y.toFixed(1)}, fieldHalfW=${fieldHalfW}, fieldHalfH=${fieldHalfH}`);
      console.log(`[checkBallOutOfBounds] Ball body:`, {
        position: { x: pos.x, y: pos.y },
        velocity: { x: this.ball.velocity.x, y: this.ball.velocity.y },
        angle: this.ball.angle,
        id: this.ball.id
      });
    }
    
    // Use a larger margin to ensure ball is truly out (not just near boundary)
    // This prevents false positives when ball is placed at neutral spots near edges
    const margin = 20; // 20cm margin - ball must be well beyond the line
    
    // Track if we've already reported out of bounds recently
    if (this.lastOutOfBoundsTime) {
      const timeSinceLast = Date.now() - this.lastOutOfBoundsTime;
      if (timeSinceLast < 5000) { // 5 second debounce
        return; // Debounce to prevent multiple triggers
      }
    }

    // CRITICAL: Check if ball is actually INSIDE the field first
    // If ball is clearly inside, don't even check boundaries
    const isInsideField = 
      pos.x >= -fieldHalfW + margin && 
      pos.x <= fieldHalfW - margin &&
      pos.y >= -fieldHalfH + margin && 
      pos.y <= fieldHalfH - margin;
    
    if (isInsideField) {
      // Ball is clearly inside field - no need to check further
      return;
    }

    // Ball is near or outside boundaries - check each side carefully
    // Left side (beyond field line) - x < -91cm
    if (pos.x < -fieldHalfW - margin) {
      console.log(`[OUT OF BOUNDS LEFT] x=${pos.x.toFixed(1)}, threshold=${(-fieldHalfW - margin).toFixed(1)}, fieldHalfW=${fieldHalfW}, disabled=${this.outOfBoundsCheckDisabled}`);
      console.log(`[OUT OF BOUNDS LEFT] Ball position object:`, JSON.stringify({ x: pos.x, y: pos.y }));
      this.lastOutOfBoundsTime = Date.now();
      this.onOutOfBounds('left');
      return;
    }
    // Right side (beyond field line) - x > 91cm
    if (pos.x > fieldHalfW + margin) {
      console.log(`[OUT OF BOUNDS RIGHT] x=${pos.x.toFixed(1)}, threshold=${(fieldHalfW + margin).toFixed(1)}, fieldHalfW=${fieldHalfW}, disabled=${this.outOfBoundsCheckDisabled}`);
      console.log(`[OUT OF BOUNDS RIGHT] Ball position object:`, JSON.stringify({ x: pos.x, y: pos.y }));
      console.log(`[OUT OF BOUNDS RIGHT] FIELD.WIDTH=${FIELD.WIDTH}, FIELD.HEIGHT=${FIELD.HEIGHT}`);
      this.lastOutOfBoundsTime = Date.now();
      this.onOutOfBounds('right');
      return;
    }
    // Top (beyond field line, but not in goal area) - y < -121.5cm
    if (pos.y < -fieldHalfH - margin) {
      // Check if ball is in goal area (within goal width: -35cm to +35cm)
      if (pos.x < -goalHalfW || pos.x > goalHalfW) {
        console.log(`[OUT OF BOUNDS TOP] y=${pos.y.toFixed(1)}, threshold=${(-fieldHalfH - margin).toFixed(1)}, x=${pos.x.toFixed(1)}, disabled=${this.outOfBoundsCheckDisabled}`);
        this.lastOutOfBoundsTime = Date.now();
        this.onOutOfBounds('top');
      }
      // If in goal area, let goal detection handle it
      return;
    }
    // Bottom (beyond field line, but not in goal area) - y > 121.5cm
    if (pos.y > fieldHalfH + margin) {
      // Check if ball is in goal area
      if (pos.x < -goalHalfW || pos.x > goalHalfW) {
        console.log(`[OUT OF BOUNDS BOTTOM] y=${pos.y.toFixed(1)}, threshold=${(fieldHalfH + margin).toFixed(1)}, x=${pos.x.toFixed(1)}, disabled=${this.outOfBoundsCheckDisabled}`);
        this.lastOutOfBoundsTime = Date.now();
        this.onOutOfBounds('bottom');
      }
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
    
    // DEBUG: Log if ball position seems wrong
    if (this.ball && (Math.abs(ballState.x) > 200 || Math.abs(ballState.y) > 200)) {
      console.log(`[getState] Ball state suspicious:`, ballState);
      console.log(`[getState] Ball body position:`, { x: this.ball.position.x, y: this.ball.position.y });
      console.log(`[getState] Ball body ID:`, this.ball.id);
      console.log(`[getState] Ball body label:`, this.ball.label);
    }
    
    return {
      ball: ballState,
      robots: robotStates,
    };
  }

  // Set ball position
  setBallPosition(x: number, y: number): void {
    if (this.ball) {
      console.log(`[setBallPosition] Setting ball to x=${x.toFixed(1)}, y=${y.toFixed(1)}`);
      
      // Force update position - Matter.js might cache positions
      Body.setPosition(this.ball, { x, y });
      Body.setVelocity(this.ball, { x: 0, y: 0 });
      Body.setAngularVelocity(this.ball, 0);
      
      // Force Matter.js to update immediately
      Body.update(this.ball, 0, 1, 0);
      
      this.resetOutOfBoundsTimer();
      
      // Verify position was set correctly immediately
      const actualPos = this.ball.position;
      console.log(`[setBallPosition] Ball position immediately after set: (${actualPos.x.toFixed(1)}, ${actualPos.y.toFixed(1)})`);
      
      if (Math.abs(actualPos.x - x) > 0.1 || Math.abs(actualPos.y - y) > 0.1) {
        console.error(`[setBallPosition] Position mismatch! Requested: (${x}, ${y}), Actual: (${actualPos.x.toFixed(1)}, ${actualPos.y.toFixed(1)})`);
      }
      
      // Check again after a short delay to see if something moves it
      setTimeout(() => {
        if (this.ball) {
          const laterPos = this.ball.position;
          if (Math.abs(laterPos.x - x) > 0.1 || Math.abs(laterPos.y - y) > 0.1) {
            console.error(`[setBallPosition] Position changed after 100ms! Was: (${x}, ${y}), Now: (${laterPos.x.toFixed(1)}, ${laterPos.y.toFixed(1)})`);
          }
        }
      }, 100);
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

