// ============================================================
// RoboCup Jr. Simulator - 3D Three.js Renderer
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SimulationState, Team, RobotRole } from '../types';
import { FIELD, GOAL, BALL, ROBOT, COLORS, CAMERA } from '../types/constants';

export class Renderer3D {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;

  private ball: THREE.Mesh | null = null;
  private robots: Map<string, THREE.Group> = new Map();
  private field: THREE.Group | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.FOV,
      container.clientWidth / container.clientHeight,
      CAMERA.NEAR,
      CAMERA.FAR
    );
    this.camera.position.set(
      CAMERA.INITIAL_POSITION.x,
      CAMERA.INITIAL_POSITION.y,
      CAMERA.INITIAL_POSITION.z
    );

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 0, 0);

    // Lights
    this.setupLights();

    // Create field
    this.createField();

    // Create ball
    this.createBall();

    // Handle resize
    window.addEventListener('resize', this.handleResize);
  }

  private setupLights(): void {
    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    // Main directional light - adjusted for larger field
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(80, 250, 80);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 10;
    mainLight.shadow.camera.far = 600;
    mainLight.shadow.camera.left = -200;
    mainLight.shadow.camera.right = 200;
    mainLight.shadow.camera.top = 200;
    mainLight.shadow.camera.bottom = -200;
    this.scene.add(mainLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0x6688ff, 0.3);
    fillLight.position.set(-80, 150, -80);
    this.scene.add(fillLight);
  }

  private createField(): void {
    this.field = new THREE.Group();

    // Outer area (brown/tan surface like wood)
    const outerGeom = new THREE.PlaneGeometry(FIELD.TOTAL_WIDTH + 20, FIELD.TOTAL_HEIGHT + 20);
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0x8B7355,  // Tan/wood color
      roughness: 0.9,
    });
    const outerGround = new THREE.Mesh(outerGeom, outerMat);
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = -0.1;  // Slightly below field
    outerGround.receiveShadow = true;
    this.field.add(outerGround);

    // Green playing field
    const groundGeom = new THREE.PlaneGeometry(FIELD.WIDTH, FIELD.HEIGHT);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a5f1a,
      roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.field.add(ground);

    // Field markings
    this.createFieldMarkings();

    // Walls (at outer boundary)
    this.createWalls();

    // Goals
    this.createGoals();

    this.scene.add(this.field);
  }

  private createFieldMarkings(): void {
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    
    const halfW = FIELD.WIDTH / 2;
    const halfH = FIELD.HEIGHT / 2;

    // Outer boundary
    const boundaryPoints = [
      new THREE.Vector3(-halfW, 0.1, -halfH),
      new THREE.Vector3(halfW, 0.1, -halfH),
      new THREE.Vector3(halfW, 0.1, halfH),
      new THREE.Vector3(-halfW, 0.1, halfH),
      new THREE.Vector3(-halfW, 0.1, -halfH),
    ];
    const boundaryGeom = new THREE.BufferGeometry().setFromPoints(boundaryPoints);
    const boundary = new THREE.Line(boundaryGeom, lineMat);
    this.field!.add(boundary);

    // Center line (BLACK - not white, so line sensors don't detect it)
    const centerLinePoints = [
      new THREE.Vector3(-halfW, 0.1, 0),
      new THREE.Vector3(halfW, 0.1, 0),
    ];
    const centerLineGeom = new THREE.BufferGeometry().setFromPoints(centerLinePoints);
    const centerLineMat = new THREE.LineBasicMaterial({ color: 0x000000 });
    const centerLine = new THREE.Line(centerLineGeom, centerLineMat);
    this.field!.add(centerLine);

    // Center circle (BLACK)
    const circleGeom = new THREE.RingGeometry(
      FIELD.CENTER_CIRCLE_RADIUS - 0.5,
      FIELD.CENTER_CIRCLE_RADIUS + 0.5,
      64
    );
    const circleMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    const circle = new THREE.Mesh(circleGeom, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.1;
    this.field!.add(circle);

    // Center dot (BLACK)
    const dotGeom = new THREE.CircleGeometry(2, 16);
    const dot = new THREE.Mesh(dotGeom, circleMat);
    dot.rotation.x = -Math.PI / 2;
    dot.position.y = 0.15;
    this.field!.add(dot);
  }

  private createWalls(): void {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.9,
    });

    // Walls at OUTER boundary
    const outerHalfW = FIELD.WIDTH / 2 + FIELD.OUTER_WIDTH;
    const outerHalfH = FIELD.HEIGHT / 2 + FIELD.OUTER_WIDTH;
    const wallHeight = FIELD.WALL_HEIGHT;
    const wallThickness = 5;
    const goalHalfW = GOAL.WIDTH / 2;

    // Left wall (full height of outer area)
    const leftWallGeom = new THREE.BoxGeometry(wallThickness, wallHeight, FIELD.TOTAL_HEIGHT);
    const leftWall = new THREE.Mesh(leftWallGeom, wallMat);
    leftWall.position.set(-outerHalfW - wallThickness / 2, wallHeight / 2, 0);
    leftWall.castShadow = true;
    this.field!.add(leftWall);

    // Right wall
    const rightWall = leftWall.clone();
    rightWall.position.set(outerHalfW + wallThickness / 2, wallHeight / 2, 0);
    this.field!.add(rightWall);

    // Top walls (with goal gap) at outer boundary
    const topWallWidth = outerHalfW - goalHalfW;
    const topWallGeom = new THREE.BoxGeometry(topWallWidth, wallHeight, wallThickness);
    
    const topLeftWall = new THREE.Mesh(topWallGeom, wallMat);
    topLeftWall.position.set(-outerHalfW + topWallWidth / 2, wallHeight / 2, -outerHalfH - wallThickness / 2);
    topLeftWall.castShadow = true;
    this.field!.add(topLeftWall);

    const topRightWall = new THREE.Mesh(topWallGeom, wallMat);
    topRightWall.position.set(outerHalfW - topWallWidth / 2, wallHeight / 2, -outerHalfH - wallThickness / 2);
    topRightWall.castShadow = true;
    this.field!.add(topRightWall);

    // Bottom walls
    const bottomLeftWall = topLeftWall.clone();
    bottomLeftWall.position.z = outerHalfH + wallThickness / 2;
    this.field!.add(bottomLeftWall);

    const bottomRightWall = topRightWall.clone();
    bottomRightWall.position.z = outerHalfH + wallThickness / 2;
    this.field!.add(bottomRightWall);
  }

  private createGoals(): void {
    const halfH = FIELD.HEIGHT / 2;
    const goalAreaW = FIELD.PENALTY_AREA_WIDTH;
    const goalAreaD = FIELD.PENALTY_AREA_DEPTH;

    // Blue goal
    const blueGoal = this.createGoalMesh(0x0066cc);
    blueGoal.position.set(0, 0, -halfH - GOAL.DEPTH / 2);
    this.field!.add(blueGoal);

    // Blue goal area (penalty area) - IN FRONT of goal (on field side)
    // Rectangle extends from goal line (z=-halfH) toward center
    const blueGoalArea = this.createGoalAreaLine();
    blueGoalArea.position.set(0, 0.1, -halfH + goalAreaD / 2);
    this.field!.add(blueGoalArea);

    // Yellow goal
    const yellowGoal = this.createGoalMesh(0xffcc00);
    yellowGoal.position.set(0, 0, halfH + GOAL.DEPTH / 2);
    yellowGoal.rotation.y = Math.PI;
    this.field!.add(yellowGoal);

    // Yellow goal area (penalty area) - IN FRONT of goal (on field side)
    // Rectangle extends from goal line (z=halfH) toward center
    // Need to flip it 180° so front line is toward center, not at goal
    const yellowGoalArea = this.createGoalAreaLine();
    yellowGoalArea.rotation.y = Math.PI; // Rotate 180° to flip the rectangle
    yellowGoalArea.position.set(0, 0.1, halfH - goalAreaD / 2);
    this.field!.add(yellowGoalArea);
  }

  private createGoalAreaLine(): THREE.Group {
    const group = new THREE.Group();
    const goalAreaW = FIELD.PENALTY_AREA_WIDTH;
    const goalAreaD = FIELD.PENALTY_AREA_DEPTH;
    const lineHeight = 0.2;
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Front line (closest to field)
    const frontLine = new THREE.Mesh(
      new THREE.BoxGeometry(goalAreaW, lineHeight, FIELD.LINE_WIDTH),
      lineMat
    );
    frontLine.position.set(0, 0, goalAreaD / 2);
    group.add(frontLine);

    // Left side line
    const leftLine = new THREE.Mesh(
      new THREE.BoxGeometry(FIELD.LINE_WIDTH, lineHeight, goalAreaD),
      lineMat
    );
    leftLine.position.set(-goalAreaW / 2, 0, 0);
    group.add(leftLine);

    // Right side line
    const rightLine = new THREE.Mesh(
      new THREE.BoxGeometry(FIELD.LINE_WIDTH, lineHeight, goalAreaD),
      lineMat
    );
    rightLine.position.set(goalAreaW / 2, 0, 0);
    group.add(rightLine);

    return group;
  }

  private createGoalMesh(color: number): THREE.Group {
    const goal = new THREE.Group();

    const goalMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0.3,
    });

    // Back
    const backGeom = new THREE.BoxGeometry(GOAL.WIDTH, GOAL.HEIGHT, 2);
    const back = new THREE.Mesh(backGeom, goalMat);
    back.position.set(0, GOAL.HEIGHT / 2, -GOAL.DEPTH / 2 + 1);
    goal.add(back);

    // Sides
    const sideGeom = new THREE.BoxGeometry(2, GOAL.HEIGHT, GOAL.DEPTH);
    
    const leftSide = new THREE.Mesh(sideGeom, goalMat);
    leftSide.position.set(-GOAL.WIDTH / 2 + 1, GOAL.HEIGHT / 2, 0);
    goal.add(leftSide);

    const rightSide = new THREE.Mesh(sideGeom, goalMat);
    rightSide.position.set(GOAL.WIDTH / 2 - 1, GOAL.HEIGHT / 2, 0);
    goal.add(rightSide);

    // Top
    const topGeom = new THREE.BoxGeometry(GOAL.WIDTH, 2, GOAL.DEPTH);
    const top = new THREE.Mesh(topGeom, goalMat);
    top.position.set(0, GOAL.HEIGHT, 0);
    goal.add(top);

    return goal;
  }

  private createBall(): void {
    const ballGeom = new THREE.SphereGeometry(BALL.RADIUS, 32, 32);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      roughness: 0.3,
      metalness: 0.1,
    });
    this.ball = new THREE.Mesh(ballGeom, ballMat);
    this.ball.castShadow = true;
    this.ball.position.y = BALL.RADIUS;
    this.scene.add(this.ball);
  }

  createRobot(id: string, team: Team, role: RobotRole): void {
    const robot = new THREE.Group();
    const radius = ROBOT.RADIUS;
    const bodyHeight = ROBOT.HEIGHT * 0.5;
    const lowerHeight = bodyHeight * 0.4; // lower segment with divet
    const upperHeight = bodyHeight - lowerHeight; // solid top segment
    const clearance = 0.001; // gap from ground to bottom (visible lift)
    robot.userData.clearance = clearance;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: team === 'blue' ? 0x2196F3 : 0xFFC107,
      roughness: 0.4,
      metalness: 0.2,
    });

    // Lower body with carved divet (pac-man wedge) using extrude
    const notchAngle = (ROBOT.NOTCH_ANGLE * Math.PI) / 180;
    const lowerShape = new THREE.Shape();
    lowerShape.moveTo(0, 0);
    const startAngle = notchAngle / 2;
    const endAngle = 2 * Math.PI - notchAngle / 2;
    const segments = 32;
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (endAngle - startAngle) * (i / segments);
      lowerShape.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
    }
    lowerShape.lineTo(0, 0);
    const lowerGeom = new THREE.ExtrudeGeometry(lowerShape, { depth: lowerHeight, bevelEnabled: false });
    const lower = new THREE.Mesh(lowerGeom, bodyMat);
    lower.castShadow = true;
    lower.rotation.x = -Math.PI / 2;
    lower.position.y = lowerHeight / 2; // sits at group origin
    robot.add(lower);

    // Open notch: no plate/liner, hollow for visual divet

    // Upper body - solid cylinder without divet
    const upperGeom = new THREE.CylinderGeometry(radius, radius, upperHeight, 32);
    const upper = new THREE.Mesh(upperGeom, bodyMat);
    upper.castShadow = true;
    upper.position.y = lowerHeight + upperHeight / 2;
    robot.add(upper);

    // Top plate (darker accent)
    const topGeom = new THREE.CylinderGeometry(radius - 1, radius - 1, 1.5, 32);
    const topMat = new THREE.MeshStandardMaterial({
      color: team === 'blue' ? 0x1565C0 : 0xF57C00,
      roughness: 0.3,
    });
    const top = new THREE.Mesh(topGeom, topMat);
    top.position.y = bodyHeight + 0.35;
    robot.add(top);

    // Role indicator (colored sphere on top: red=attacker, green=defender)
    const markerGeom = new THREE.SphereGeometry(1.2, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({
      color: role === 'attacker' ? 0xff4444 : 0x44ff44,
    });
    const marker = new THREE.Mesh(markerGeom, markerMat);
    marker.position.y = bodyHeight + 0.5;
    robot.add(marker);

    // Front arrow indicator - shows which direction the robot is facing
    // Positioned above the robot, at the edge pointing toward kicker
    const arrowGroup = this.createFrontArrow(radius);
    arrowGroup.position.y = bodyHeight + 1; // Above the robot
    robot.add(arrowGroup);

    // Omni wheels - thin, inside body, arranged at 45° angles pointing toward center
    const wheelRadius = 2.5;
    const wheelThickness = 0.8; // Thin omni wheels
    const wheelGeom = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
    
    // Wheels at 45° positions but rotated to face toward center (tangent to circle)
    const wheelAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
    const wheelDist = radius - wheelRadius - 1; // Inside the body
    
    for (const angle of wheelAngles) {
      const wheel = new THREE.Mesh(wheelGeom, wheelMat);
      // Position inside the robot body
        wheel.position.set(
          wheelDist * Math.cos(angle),
          wheelRadius, // Just above ground relative to group
          wheelDist * Math.sin(angle)
        );
      // Rotate wheel to be tangent to the circle (perpendicular to radius)
      wheel.rotation.z = Math.PI / 2; // Lay flat
      wheel.rotation.y = angle + Math.PI / 2; // Tangent direction
      robot.add(wheel);
    }

    this.robots.set(id, robot);
    this.scene.add(robot);
  }

  private createFrontArrow(robotRadius: number): THREE.Group {
    const group = new THREE.Group();
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    // Arrow dimensions
    const shaftLength = robotRadius * 0.4; // Shaft length
    const headSize = robotRadius * 0.15; // Arrow head size
    const headLength = headSize * 1.2; // Arrow head length
    
    // Position the arrow group so it starts at the robot's edge
    // The arrow extends outward from the edge in +X direction (kicker direction)
    group.position.x = robotRadius; // Start at the edge
    
    // Arrow shaft - extends backward from the edge (toward center) in X direction
    // Made thicker: 0.2 instead of 0.15
    const shaftGeom = new THREE.BoxGeometry(shaftLength, 0.2, 0.2);
    const shaft = new THREE.Mesh(shaftGeom, arrowMat);
    shaft.position.x = -shaftLength / 2; // Extend backward (toward robot center) in -X
    group.add(shaft);
    
    // Arrow head (pointing outward from edge in +X direction)
    // More polygons (16 instead of 8) for rounder appearance
    // Pulled 1 cm forward (outward)
    const headGeom = new THREE.ConeGeometry(headSize, headLength, 16);
    const head = new THREE.Mesh(headGeom, arrowMat);
    head.position.x = 1; // Pulled 1 cm forward from the edge
    head.rotation.z = -Math.PI / 2; // Rotate to point in +X direction (kicker direction)
    group.add(head);
    
    return group;
  }

  removeRobot(id: string): void {
    const robot = this.robots.get(id);
    if (robot) {
      this.scene.remove(robot);
      this.robots.delete(id);
    }
  }

  render(state: SimulationState): void {
    // Update ball position
    if (this.ball) {
      this.ball.position.set(state.ball.x, BALL.RADIUS, state.ball.y);
    }

    // Update robot positions (skip penalized robots - they're removed from play)
    // First, remove any robots that are now penalized
    for (const [id, robot] of this.robots.entries()) {
      const robotState = state.robots.find(r => r.id === id);
      if (robotState?.penalized) {
        // Remove penalized robot from scene
        this.scene.remove(robot);
        this.robots.delete(id);
      }
    }
    
    // Update active (non-penalized) robots
    for (const robotState of state.robots) {
      if (robotState.penalized) continue; // Skip penalized robots
      
      let robot = this.robots.get(robotState.id);
      
      if (!robot) {
        this.createRobot(robotState.id, robotState.team, robotState.role);
        robot = this.robots.get(robotState.id);
      }

      if (robot) {
        const clearance = robot.userData.clearance ?? 0;
        robot.position.set(robotState.x, clearance, robotState.y);
        // Render heading matches physics: angle 0 => facing +X
        robot.rotation.y = -robotState.angle;
      }
    }

    // Update controls
    this.controls.update();

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  private handleResize = (): void => {
    this.resize();
  };

  // Public resize method (call when switching to 3D view)
  resize(): void {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    if (width > 0 && height > 0) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    this.controls.dispose();
    
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

