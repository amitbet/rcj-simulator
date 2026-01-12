// ============================================================
// RoboCup Jr. Simulator - Physics Engine (Matter.js wrapper)
// REBUILT WITH CORRECT COORDINATE TRANSFORMATIONS
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
  ball: { x: number; y: number; vx: number; vy: number }
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
  
  // Flag to disable out-of-bounds checking
  private outOfBoundsCheckDisabled: boolean = false;

  constructor() {
    this.engine = Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
    });
    
    this.engine.enableSleeping = false;
    
    this.setupCollisionHandlers();
  }

  initialize(): void {
    this.outOfBoundsCheckDisabled = false;
    World.clear(this.engine.world, false);
    this.robots.clear();
    this.walls = [];
    this.goals = { blue: null, yellow: null };
    this.ball = null;
    
    this.createWalls();
    this.createGoals();
    this.createBall();
  }

  private setupCollisionHandlers(): void {
    Events.on(this.engine, 'collisionStart', (event) => {
      const pairs = event.pairs;
      for (const pair of pairs) {
        const { bodyA, bodyB } = pair;
        
        // Goal scored
        if (bodyA.label.startsWith('goal_') && bodyB.label === 'ball') {
          const team = bodyA.label.includes('blue') ? 'blue' : 'yellow';
          if (this.onGoalScored) this.onGoalScored(team);
        } else if (bodyB.label.startsWith('goal_') && bodyA.label === 'ball') {
          const team = bodyB.label.includes('blue') ? 'blue' : 'yellow';
          if (this.onGoalScored) this.onGoalScored(team);
        }
        
        // Robot collision
        if (bodyA.label.startsWith('robot_') && bodyB.label.startsWith('robot_')) {
          if (this.onCollision) {
            this.onCollision(bodyA.label.replace('robot_', ''), bodyB.label.replace('robot_', ''));
          }
        }
      }
    });
  }

  private createWalls(): void {
    // Create walls around field perimeter
    const wallThickness = 1;
    const halfWidth = FIELD.TOTAL_WIDTH / 2;
    const halfHeight = FIELD.TOTAL_HEIGHT / 2;
    
    // Top wall
    this.walls.push(Bodies.rectangle(0, -halfHeight, FIELD.TOTAL_WIDTH, wallThickness, {
      isStatic: true,
      label: 'wall_top',
      collisionFilter: { category: CATEGORY.WALL }
    }));
    
    // Bottom wall
    this.walls.push(Bodies.rectangle(0, halfHeight, FIELD.TOTAL_WIDTH, wallThickness, {
      isStatic: true,
      label: 'wall_bottom',
      collisionFilter: { category: CATEGORY.WALL }
    }));
    
    // Left wall
    this.walls.push(Bodies.rectangle(-halfWidth, 0, wallThickness, FIELD.TOTAL_HEIGHT, {
      isStatic: true,
      label: 'wall_left',
      collisionFilter: { category: CATEGORY.WALL }
    }));
    
    // Right wall
    this.walls.push(Bodies.rectangle(halfWidth, 0, wallThickness, FIELD.TOTAL_HEIGHT, {
      isStatic: true,
      label: 'wall_right',
      collisionFilter: { category: CATEGORY.WALL }
    }));
    
    World.add(this.engine.world, this.walls);
  }

  private createGoals(): void {
    const goalWidth = GOAL.WIDTH;
    const goalHeight = GOAL.HEIGHT;
    const goalDepth = GOAL.DEPTH;
    const halfHeight = FIELD.TOTAL_HEIGHT / 2;
    
    // Blue goal (top, negative Y)
    this.goals.blue = Bodies.rectangle(0, -halfHeight - goalDepth / 2, goalWidth, goalDepth, {
      isStatic: true,
      isSensor: true,
      label: 'goal_blue',
      collisionFilter: { category: CATEGORY.GOAL }
    });
    
    // Yellow goal (bottom, positive Y)
    this.goals.yellow = Bodies.rectangle(0, halfHeight + goalDepth / 2, goalWidth, goalDepth, {
      isStatic: true,
      isSensor: true,
      label: 'goal_yellow',
      collisionFilter: { category: CATEGORY.GOAL }
    });
    
    World.add(this.engine.world, [this.goals.blue, this.goals.yellow]);
  }

  private createBall(): void {
    this.ball = Bodies.circle(0, 0, BALL.RADIUS, {
      restitution: 0.7,
      friction: PHYSICS.BALL_FRICTION,
      frictionAir: 0.03,
      mass: BALL.MASS,
      label: 'ball',
      collisionFilter: {
        category: CATEGORY.BALL,
        mask: CATEGORY.WALL | CATEGORY.ROBOT | CATEGORY.GOAL
      }
    });
    
    World.add(this.engine.world, this.ball);
  }

  createRobot(id: string, team: Team, role: RobotRole, x: number, y: number, angle: number): void {
    const body = Bodies.circle(x, y, ROBOT.RADIUS, {
      restitution: 0.1,
      friction: ROBOT_FRICTION,
      frictionAir: 0.01,
      mass: ROBOT.MASS,
      inertia: Infinity,
      label: `robot_${id}`,
      collisionFilter: {
        category: CATEGORY.ROBOT,
        mask: CATEGORY.WALL | CATEGORY.ROBOT | CATEGORY.BALL
      }
    });
    
    Body.setAngle(body, angle);
    
    this.robots.set(id, { id, body, team, role });
    World.add(this.engine.world, body);
  }

  setBallPosition(x: number, y: number): void {
    if (this.ball) {
      Body.setPosition(this.ball, { x, y });
      Body.setVelocity(this.ball, { x: 0, y: 0 });
      Body.setAngularVelocity(this.ball, 0);
    }
  }

  getBall(): Matter.Body | null {
    return this.ball;
  }

  getRobots(): Map<string, RobotBody> {
    return this.robots;
  }

  // ============================================================
  // OMNIDIRECTIONAL WHEEL PHYSICS - REBUILT
  // ============================================================
  
  // Forward kinematics (from Arduino patterns, verified):
  // m1 = vx + vy + omega
  // m2 = -vx + vy + omega
  // m3 = vx - vy - omega
  // m4 = -vx - vy - omega
  //
  // Where:
  // - vx = forward/backward in robot frame (forward = +)
  // - vy = left/right in robot frame (right = +)
  // - omega = rotation (CW = +)
  
  // Inverse kinematics:
  // vx = (m1 - m2) / 2
  // vy + omega = (m1 + m2) / 2
  // Note: vy and omega are coupled, can't be separated from motor values alone
  
  applyAction(robotId: string, action: Action): void {
    const robot = this.robots.get(robotId);
    if (!robot) return;

    const body = robot.body;
    const angle = body.angle; // Robot's current heading in radians
    const pos = body.position;

    const { motor1, motor2, motor3, motor4 } = action;
    
    // Step 1: Inverse kinematics - convert motors to robot-relative velocities
    const vx_robot = (motor1 - motor2) / 2;  // Forward/backward
    const vy_plus_omega = (motor1 + motor2) / 2;  // Strafe + rotation (coupled)
    
    // Step 2: Separate vy (strafe) from omega (rotation) using heuristics
    // Pure rotation pattern: [1, 1, -1, -1] or [-1, -1, 1, 1]
    // Pure strafe pattern: [1, 1, -1, -1] (same as rotation!)
    // Forward pattern: [1, -1, 1, -1]
    
    const vxAbs = Math.abs(vx_robot);
    const vyOmegaAbs = Math.abs(vy_plus_omega);
    const threshold = 0.03;
    
    let vy_robot = 0;
    let omega = 0;
    
    // Check for pure rotation: motor1 ≈ motor2, motor3 ≈ motor4, motor1 ≈ -motor3, vx ≈ 0
    const isPureRotation = (Math.abs(motor1 - motor2) < 0.01 && 
                            Math.abs(motor3 - motor4) < 0.01 &&
                            Math.abs(motor1 + motor3) < 0.01 &&
                            vxAbs < threshold);
    
    if (isPureRotation) {
      // Pure rotation
      omega = vy_plus_omega;
      vy_robot = 0;
    } else if (vxAbs > threshold) {
      // Forward/backward movement present
      if (vyOmegaAbs > threshold) {
        // Both vx and vy+omega present - check if diagonal or forward+turn
        // Diagonal: motor2 and motor3 have opposite signs, motor1/motor4 small
        const motor2Motor3OppositeSign = (motor2 > 0.01 && motor3 < -0.01) || (motor2 < -0.01 && motor3 > 0.01);
        const motor1Motor4Small = Math.abs(motor1) < 0.2 && Math.abs(motor4) < 0.2;
        
        if (motor2Motor3OppositeSign && motor1Motor4Small) {
          // Diagonal movement
          vy_robot = vy_plus_omega;
          omega = 0;
        } else {
          // Forward + turn
          omega = vy_plus_omega;
          vy_robot = 0;
        }
      }
      // Otherwise: pure forward/backward (vy=0, omega=0)
    } else if (vyOmegaAbs > threshold) {
      // Pure strafe (vx ≈ 0, vy+omega significant)
      vy_robot = vy_plus_omega;
      omega = 0;
    }
    
    // Step 3: Calculate movement for this frame
    const dt = 0.016; // 16.67ms per frame (~60 FPS)
    const maxSpeed = ROBOT.MAX_SPEED * dt; // cm per frame
    const maxAngular = (ROBOT.MAX_ANGULAR_SPEED * Math.PI / 180) * dt; // rad per frame
    
    // Step 4: Transform robot-relative velocities to world coordinates
    // CRITICAL: Matter.js Y+ is DOWN, our world Y+ is UP
    // Robot angle: 0 = facing north (up in our world, negative Y in Matter.js)
    // Positive angle = clockwise rotation
    
    // Standard 2D rotation transformation:
    // World X = robot X * cos(angle) - robot Y * sin(angle)
    // World Y = robot X * sin(angle) + robot Y * cos(angle)
    //
    // But we need to account for Matter.js Y+ being DOWN:
    // - Forward (vx>0) in robot frame should move UP (negative Y in Matter.js)
    // - Right (vy>0) in robot frame should move RIGHT (positive X in Matter.js)
    //
    // Robot frame: +X = forward, +Y = right
    // World frame (Matter.js): +X = right, +Y = DOWN
    //
    // Transformation:
    // worldX = vx * sin(angle) + vy * cos(angle)  (right component)
    // worldY = -(vx * cos(angle) - vy * sin(angle))  (up component, negated for Matter.js)
    
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    
    // Transform robot-relative velocities to world velocities
    const worldVx = vx_robot * sinAngle + vy_robot * cosAngle;
    const worldVy = -(vx_robot * cosAngle - vy_robot * sinAngle); // Negated for Matter.js Y+ DOWN
    
    // Calculate movement delta
    const moveX = worldVx * maxSpeed;
    const moveY = worldVy * maxSpeed;
    
    // Step 5: Apply movement and rotation
    const newAngle = angle + omega * maxAngular;
    
    Body.setPosition(body, { x: pos.x + moveX, y: pos.y + moveY });
    Body.setAngle(body, newAngle);
  }

  step(deltaMs: number): void {
    const clampedDeltaMs = Math.min(deltaMs, 50); // Cap at 50ms
    Engine.update(this.engine, clampedDeltaMs);
  }

  // Callback setters
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

  dispose(): void {
    World.clear(this.engine.world, false);
    Engine.clear(this.engine);
  }
}

// Robot friction constant
const ROBOT_FRICTION = 0.01;
