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

    // Center line
    const centerLinePoints = [
      new THREE.Vector3(-halfW, 0.1, 0),
      new THREE.Vector3(halfW, 0.1, 0),
    ];
    const centerLineGeom = new THREE.BufferGeometry().setFromPoints(centerLinePoints);
    const centerLine = new THREE.Line(centerLineGeom, lineMat);
    this.field!.add(centerLine);

    // Center circle
    const circleGeom = new THREE.RingGeometry(
      FIELD.CENTER_CIRCLE_RADIUS - 0.5,
      FIELD.CENTER_CIRCLE_RADIUS + 0.5,
      64
    );
    const circleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const circle = new THREE.Mesh(circleGeom, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.1;
    this.field!.add(circle);

    // Center dot
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

    // Blue goal
    const blueGoal = this.createGoalMesh(0x0066cc);
    blueGoal.position.set(0, 0, -halfH - GOAL.DEPTH / 2);
    this.field!.add(blueGoal);

    // Yellow goal
    const yellowGoal = this.createGoalMesh(0xffcc00);
    yellowGoal.position.set(0, 0, halfH + GOAL.DEPTH / 2);
    yellowGoal.rotation.y = Math.PI;
    this.field!.add(yellowGoal);
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
    const notchAngle = (ROBOT.NOTCH_ANGLE * Math.PI) / 180;
    const bodyHeight = ROBOT.HEIGHT * 0.6;

    // Main body - create pac-man shaped geometry using ExtrudeGeometry
    const shape = new THREE.Shape();
    const radius = ROBOT.RADIUS;
    
    // Draw pac-man shape (circle with wedge notch at front/+X direction)
    shape.moveTo(0, 0);
    // Arc from bottom edge of notch, around the back, to top edge of notch
    const startAngle = notchAngle / 2;
    const endAngle = 2 * Math.PI - notchAngle / 2;
    const segments = 32;
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (endAngle - startAngle) * (i / segments);
      shape.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
    }
    shape.lineTo(0, 0);

    const extrudeSettings = {
      depth: bodyHeight,
      bevelEnabled: false,
    };
    const bodyGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: team === 'blue' ? 0x2196F3 : 0xFFC107,
      roughness: 0.4,
      metalness: 0.2,
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;
    // Rotate so Y is up and the notch faces +X
    body.rotation.x = -Math.PI / 2;
    body.position.y = bodyHeight;
    robot.add(body);

    // Kicker plate inside the notch (dark triangular area visible from front)
    const kickerShape = new THREE.Shape();
    kickerShape.moveTo(0, 0);
    kickerShape.lineTo(radius * 0.7, 0);
    kickerShape.lineTo(radius * Math.cos(-notchAngle / 2), radius * Math.sin(-notchAngle / 2));
    kickerShape.lineTo(0, 0);
    kickerShape.lineTo(radius * Math.cos(notchAngle / 2), radius * Math.sin(notchAngle / 2));
    kickerShape.lineTo(radius * 0.7, 0);
    
    const kickerGeom = new THREE.ExtrudeGeometry(kickerShape, { depth: bodyHeight * 0.9, bevelEnabled: false });
    const kickerMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
    const kicker = new THREE.Mesh(kickerGeom, kickerMat);
    kicker.rotation.x = -Math.PI / 2;
    kicker.position.y = bodyHeight * 0.95;
    robot.add(kicker);

    // Top plate (darker accent)
    const topGeom = new THREE.CylinderGeometry(ROBOT.RADIUS - 1, ROBOT.RADIUS - 1, 2, 32);
    const topMat = new THREE.MeshStandardMaterial({
      color: team === 'blue' ? 0x1565C0 : 0xF57C00,
      roughness: 0.3,
    });
    const top = new THREE.Mesh(topGeom, topMat);
    top.position.y = bodyHeight + 1;
    robot.add(top);

    // Role indicator (colored sphere on top: red=attacker, green=defender)
    const markerGeom = new THREE.SphereGeometry(1.5, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({
      color: role === 'attacker' ? 0xff4444 : 0x44ff44,
    });
    const marker = new THREE.Mesh(markerGeom, markerMat);
    marker.position.y = bodyHeight + 3;
    robot.add(marker);

    // Wheels (4 omni wheels at 45 degree angles)
    const wheelGeom = new THREE.CylinderGeometry(3, 3, 2, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
    const wheelAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
    
    for (const angle of wheelAngles) {
      const wheel = new THREE.Mesh(wheelGeom, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(
        (ROBOT.RADIUS - 3) * Math.cos(angle),
        3,
        (ROBOT.RADIUS - 3) * Math.sin(angle)
      );
      wheel.rotation.y = angle;
      robot.add(wheel);
    }

    this.robots.set(id, robot);
    this.scene.add(robot);
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

    // Update robot positions
    for (const robotState of state.robots) {
      let robot = this.robots.get(robotState.id);
      
      if (!robot) {
        this.createRobot(robotState.id, robotState.team, robotState.role);
        robot = this.robots.get(robotState.id);
      }

      if (robot) {
        robot.position.set(robotState.x, 0, robotState.y);
        robot.rotation.y = -robotState.angle + Math.PI / 2;
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

