# RoboCup Jr. (Open) Simulator Implementation Plan

## Overview

Build a web-based RoboCup Jr. (Open) simulator using Electron with both 2D and 3D views, supporting JavaScript-like strategy scripting, physics simulation, and the specified WorldState interface for testing bot strategies before hardware deployment.

## Architecture Overview

The simulator will be built as an Electron application with a modular architecture:

```
┌─────────────────────────────────────────────────┐
│              Electron App                        │
├─────────────────────────────────────────────────┤
│  UI Layer (React/TypeScript)                    │
│  - Game Mode Selector                           │
│  - View Toggle (2D/3D)                          │
│  - Strategy Editor                               │
│  - Control Panel                                 │
├─────────────────────────────────────────────────┤
│  Renderer Layer                                 │
│  - 2D Renderer (Canvas/2D)                      │
│  - 3D Renderer (Three.js)                       │
├─────────────────────────────────────────────────┤
│  Simulation Engine                              │
│  - Game Loop                                    │
│  - Physics (Matter.js for 2D)                   │
│  - WorldState Manager                           │
│  - Strategy Executor                            │
│  - Referee System (Rules Engine)                │
└─────────────────────────────────────────────────┘
```

## Technology Stack

- **Framework**: Electron + TypeScript
- **UI**: React (or vanilla TypeScript for simplicity)
- **2D Physics**: Matter.js
- **3D Rendering**: Three.js
- **Strategy Execution**: JavaScript interpreter (sandboxed)
- **Build Tool**: Vite or Webpack

## Game Modes

When the simulation begins, users can select from three game modes:

### 1. Single Bot Mode
- One robot vs. the goal
- User selects either **attacker** or **defender** strategy
- Useful for testing individual robot behavior
- Ball starts at center, robot starts at designated position

### 2. Single Team Mode
- Our team only (attacker + defender)
- Both robots use their respective strategies
- No opponent robots on the field
- Useful for testing team coordination and positioning

### 3. Two Team Mode (Full Simulation)
- Full match simulation with 4 robots total
- Our team: attacker + defender (our strategies)
- Opponent team: 2 robots (opponent strategies from different files)
- Complete game rules enforced
- Score tracking, kickoffs, restarts

## RoboCup Jr. Open 2025 Competition Rules

The simulator will implement the official RoboCup Junior Soccer Open rules:

### Field Specifications (RCJ Soccer Open)
- **Playing Field**: 182cm x 243cm (6ft x 8ft standard Open field)
- **Outer Area**: 30cm width around the playing field (robots can roam here)
- **Total Dimensions**: 242cm x 303cm (including outer area)
- **Walls**: 14cm high minimum, painted matte black - located at OUTER boundary
- **Field Lines**: White lines mark the playing field boundary (visual only)
- **Floor**: Green carpet (playing area) with tan/wood outer area
- **Center Circle**: 60cm diameter (30cm radius)
- **Neutral Spots**: 7 spots on the field for ball placement
- **Corner Cuts**: 14cm diagonal cuts to help ball retrieval

### Field Layout and Out-of-Bounds
- Walls are positioned at the outer boundary (30cm beyond field lines)
- Robots can freely move into the outer area beyond the field lines
- **Ball Out-of-Bounds**: Ball crossing the white field lines triggers out-of-bounds
- **Goals**: Goal openings are at the field boundary, with goal boxes extending beyond
- Goals have side walls and back walls to contain the ball

### Goal Specifications
- **Width**: 700mm (70cm)
- **Height**: 200mm (20cm)
- **Depth**: 180mm (18cm)
- **Colors**: Blue goal on one side, Yellow goal on the other

### Ball Specifications
- **Type**: Orange golf ball (passive, infrared-emitting balls not used in Open)
- **Diameter**: ~42.67mm (standard golf ball)

### Robot Specifications
- **Maximum Size**: Must fit within a cylinder of 22cm diameter x 22cm height
- **Shape**: Round with notch in front for kicker (semi Pac-Man shape)

### Game Duration
- **Match Length**: Two halves of 10 minutes each
- **Half-Time**: Teams switch sides
- **Overtime**: If needed, additional periods as per competition rules

### Kickoff Rules
1. Ball placed at center of field
2. All robots must be in their own half
3. Defending robots must be outside the center circle
4. Attacking robot (closest to ball) may be inside center circle
5. After referee signal, robots begin autonomous play

### Scoring
- A goal is scored when the ball fully crosses the goal line
- After a goal, kickoff is given to the team that was scored against

### Ball Out of Bounds

When the ball exits the playing field:

1. **Visual Indication**: Flash/highlight the boundary where the ball exited
2. **Countdown Timer**: 5-second countdown displayed on screen
3. **Ball Placement**: 
   - Ball placed on the nearest **neutral spot** to where it went out
   - If ball went out on the side: nearest neutral spot on that side
   - If ball went out behind goal line (not a goal): nearest corner neutral spot
4. **Robot Repositioning**: 
   - All robots must be at least 20cm away from the ball
   - Robots may be repositioned by the referee if too close

### Neutral Spot Positions
```
    ┌─────────────────────────────┐
    │  ●                       ●  │  (corner spots)
    │                             │
    │       ●           ●         │  (mid-field spots)
    │                             │
    │  ●                       ●  │  (corner spots)
    └─────────────────────────────┘
```

### Fouls and Penalties
- **Lack of Progress**: If no significant ball movement for 10 seconds, ball moved to nearest neutral spot
- **Pushing**: Robots cannot push opponents continuously; may result in robot removal for 1 minute
- **Damage**: Robots causing damage to field/other robots may be removed
- **Stuck Robot**: If a robot is stuck for more than 10 seconds, it may be removed and repositioned

### Referee System (Simulated)

The simulator implements an automated referee that:
1. Detects when ball goes out of bounds
2. Detects goals and updates score
3. Handles kickoff positioning
4. Detects lack of progress
5. Displays countdown timers for restarts
6. Manages robot repositioning during stoppages

## Robot Visual Design

### Shape: Semi Pac-Man Design
Robots are **round with a wedge-shaped notch** in the front where the kicker mechanism is located:

```
    2D Top View:
         ___
       /     \
      |       |
      |       |
       \__◢__/
          ↑
       kicker notch
       (front of robot)
```

### Visual Specifications
- **Body**: Circular, 18-22cm diameter (configurable)
- **Notch**: ~45-60 degree wedge cut from front
- **Colors**: 
  - Our team: Distinguishable color (e.g., Blue/Cyan)
  - Opponent team: Different color (e.g., Red/Orange)
  - Attacker vs Defender: Slight shade variation or marking
- **Orientation Indicator**: Arrow or line showing front direction
- **Kicker Area**: Highlighted in notch region

### 3D Model
- Cylindrical body with wedge notch
- Visible omni wheels (4 wheels at 45-degree angles)
- Top surface with team color/number
- Kicker mechanism visible in notch
- Realistic proportions matching actual robot dimensions

## User Interaction: Drag and Drop Positioning

### Pause and Position Mode
When simulation is paused, users can:

1. **Drag Ball**: Click and drag the ball to any position on the field
2. **Drag Robots**: Click and drag any robot to reposition
3. **Rotate Robots**: Right-click + drag to rotate robot orientation
4. **Snap to Grid**: Optional grid snapping for precise placement
5. **Reset Positions**: Button to reset to kickoff positions

### Visual Feedback
- Draggable objects highlight on hover
- Ghost outline shows where object will be placed
- Invalid positions (outside field, overlapping) shown in red
- Position coordinates displayed while dragging

### Implementation
- 2D View: Direct canvas mouse/touch events
- 3D View: Raycasting for object selection, plane intersection for positioning
- State sync: Physics engine paused, positions updated directly

## File Structure

```
rcj-simulator/
├── src/
│   ├── main/                    # Electron main process
│   │   └── main.ts
│   ├── renderer/                # Electron renderer process
│   │   ├── index.html
│   │   ├── app.tsx              # Main React app
│   │   └── components/
│   │       ├── SimulatorView.tsx
│   │       ├── StrategyEditor.tsx
│   │       ├── ControlPanel.tsx
│   │       ├── GameModeSelector.tsx
│   │       └── ScoreBoard.tsx
│   ├── simulator/
│   │   ├── SimulationEngine.ts  # Main game loop
│   │   ├── WorldState.ts        # WorldState & Observation types
│   │   ├── GameState.ts         # Game state management
│   │   └── Referee.ts           # Rules engine, fouls, restarts
│   ├── physics/
│   │   ├── PhysicsEngine.ts     # Matter.js wrapper
│   │   ├── Robot.ts             # Robot physics body (pac-man shape)
│   │   ├── Ball.ts              # Ball physics body
│   │   └── Goal.ts              # Goal collision body
│   ├── strategy/
│   │   ├── StrategyExecutor.ts  # Executes strategy code
│   │   ├── StrategySandbox.ts   # Sandboxes strategy execution
│   │   └── ActionInterface.ts   # Motor/kick actions
│   ├── renderer/
│   │   ├── Renderer2D.ts        # 2D canvas renderer
│   │   ├── Renderer3D.ts        # Three.js 3D renderer
│   │   ├── RobotModel.ts        # Pac-man robot model (2D/3D)
│   │   ├── DragDropHandler.ts   # Mouse/touch drag-drop logic
│   │   └── Camera.ts            # Camera controls
│   └── world/
│       ├── Field.ts             # Field dimensions & setup
│       ├── NeutralSpots.ts      # Neutral spot positions
│       ├── ObservationSystem.ts # Calculates observations from physics
│       └── SensorSimulator.ts   # Simulates sensors (IMU, bumpers, etc.)
├── strategies/
│   ├── attacker.js              # Example attacker strategy
│   ├── defender.js              # Example defender strategy
│   ├── opponent1.js             # Example opponent strategy 1
│   └── opponent2.js             # Example opponent strategy 2
├── package.json
├── tsconfig.json
└── electron-builder.json
```

## Implementation Steps

### 1. Project Setup
- Initialize Electron + TypeScript project
- Set up build configuration (Vite/Webpack)
- Configure Electron main/renderer processes
- Add dependencies: Matter.js, Three.js, React (optional)

### 2. Core Types & Interfaces
Create TypeScript definitions matching the C++ structs:
- `Observation` interface
- `WorldState` interface  
- `Action` interface (motor speeds, kick)
- `GameMode` enum (SingleBot, SingleTeam, TwoTeam)
- `GameEvent` types (Goal, OutOfBounds, Kickoff, etc.)
- Field constants and neutral spot positions

### 3. Physics Engine
- Set up Matter.js for 2D physics
- Create field boundaries with out-of-bounds detection
- Implement robot bodies with **pac-man shape** collision
- Implement ball physics (golf ball ~42.67mm diameter)
- Implement goal collision bodies with goal detection
- Handle robot-ball collisions (kicker in notch area)
- Handle robot-robot collisions
- Simulate friction and momentum

### 4. Referee System
- Implement rule enforcement engine
- Goal detection and scoring
- Out-of-bounds detection with boundary identification
- Lack of progress detection (10-second timer)
- Kickoff state management
- Countdown timer system for restarts
- Neutral spot ball placement logic
- Robot repositioning during stoppages

### 5. WorldState System
- `ObservationSystem`: Calculate observations from physics state
  - Ball detection (distance, angle, visibility)
  - Goal detection (blue/yellow)
  - Field-of-view simulation (camera-like)
  - Distance calculation from physics positions
- `SensorSimulator`: Simulate sensors
  - IMU (heading, yaw rate)
  - Bumpers (collision detection)
  - Stuck detection (velocity threshold)
- Update WorldState each simulation tick

### 6. Strategy Execution Engine
- Create strategy function interface:
  ```typescript
  function strategy(worldState: WorldState): Action
  ```
- Sandbox strategy execution (isolated context)
- Provide strategy API (no DOM access, limited globals)
- Load strategy files dynamically
- Support hot-reloading strategies
- Error handling for strategy code

### 7. Simulation Engine
- Game loop (60 FPS target)
- Game mode handling (single bot, single team, two team)
- Update physics
- Update WorldState for each bot
- Execute strategies (get actions)
- Apply actions to physics (motor forces, kick impulse)
- Integrate with referee system

### 8. 2D Renderer
- Canvas-based top-down view
- Render field with line markings and neutral spots
- Render goals (blue/yellow colors)
- Render robots with **pac-man shape** and orientation
- Render ball (orange)
- Show robot team colors and roles
- Display score, time, game state
- Out-of-bounds indication (flash/highlight)
- Countdown timer overlay
- Performance optimization (requestAnimationFrame)

### 9. 3D Renderer
- Three.js scene setup
- 3D field with markings and goals
- 3D robot models (**pac-man shape** with wheels)
- Ball model (orange golf ball)
- Camera controls (orbit, pan, zoom)
- Lighting setup
- Team color materials
- Render loop synchronization with physics

### 10. Drag and Drop System
- Mouse/touch event handling
- Object selection (raycasting in 3D)
- Drag visual feedback (ghost outline)
- Position validation (bounds checking)
- Robot rotation support
- Snap-to-grid option
- State synchronization with physics engine
- Works in both 2D and 3D views

### 11. UI Components
- **Game Mode Selector**: Modal/screen at startup to choose mode
- **View Toggle**: 2D/3D switch button
- **Strategy Editor**: Monaco Editor or CodeMirror
- **Strategy File Selector**: Dropdown for each robot role
- **Control Panel**:
  - Start/Pause/Reset
  - Simulation speed (0.5x, 1x, 2x)
  - Score display
  - Game time display
  - Game state indicator (Playing, Paused, Kickoff, Out of Bounds)
- **Scoreboard**: Large score display with team colors
- **Countdown Overlay**: For restarts and kickoffs
- **Debug Panel** (optional):
  - Show WorldState for selected bot
  - Show physics debug info
  - Show observation ranges

### 12. Example Strategies
Create simple example strategies:
- **Attacker**: Chase ball, approach opponent goal, shoot
- **Defender**: Guard own goal, intercept ball heading toward goal
- **Opponent 1**: Simple ball-chasing strategy
- **Opponent 2**: Defensive/goalie strategy

## Key Implementation Details

### Field Dimensions
- Standard RoboCup Jr. Soccer Open: 182cm x 243cm (6ft x 8ft)
- Goals: 700mm x 200mm x 180mm (on shorter 182cm sides)
- Ball: Golf ball (~42.67mm diameter)
- Robot: Max 220mm diameter x 220mm height
- Center circle: 60cm diameter (30cm radius)
- Neutral spots: 7 positions for ball placement

### Strategy Language
Simple JavaScript-like syntax:
```javascript
function strategy(worldState) {
  // Access worldState.ball, worldState.goal_blue, etc.
  // Return action object
  return {
    motor1: 0.5,
    motor2: 0.5,
    motor3: 0.5,
    motor4: 0.5,
    kick: false
  };
}
```

### Observation Calculation
- Use physics positions to calculate relative angles/distances
- Simulate camera field-of-view (e.g., 60-90 degrees)
- Calculate visibility based on obstacles
- Distance from pixel size simulation (optional)

### Motor Control
- Omni wheels: Calculate motor speeds from desired velocity vector + rotation
- Apply forces to robot body based on motor speeds
- Simulate motor limits and acceleration

### Robot Collision Shape (Pac-Man)
```typescript
// Create pac-man shaped collision body
const robotRadius = 110; // mm (11cm radius = 22cm diameter)
const notchAngle = 50;   // degrees
const notchDepth = 40;   // mm

// Vertices form a circle with a wedge cut out at front
```

## WorldState Interface

The simulator will implement the following interfaces matching the C++ structs:

```typescript
// A generic observation from any sensor/vision module.
interface Observation {
  visible: boolean;      // currently detected
  angle_deg: number;    // -180..180, robot-centric (0 = straight ahead)
  distance: number;     // "units" (can be cm, or normalized 0..1)
  confidence: number;    // 0..1 (or 0..100 scaled), optional but useful

  // Optional raw image info (handy for debugging / distance-from-size mapping)
  cx: number;           // center x in pixels
  cy: number;           // center y in pixels
  w: number;            // bounding box width (px)
  h: number;            // bounding box height (px)
}

// Core world model consumed by strategy.
// Keep it independent of motors/PWM. Strategy should only read this.
interface WorldState {
  // Time
  t_ms: number;         // current time (millis)
  dt_s: number;         // timestep seconds since last update

  // Robot orientation / motion (from IMU + encoders later)
  heading_deg: number;  // yaw in degrees (0..360 or -180..180)
  yaw_rate_dps: number; // deg/sec (optional)
  v_est: number;        // estimated speed (optional; can be 0 for now)

  // Vision / targets
  ball: Observation;
  goal_blue: Observation;      // or "opponentGoal" if you know sides
  goal_yellow: Observation;    // if your league uses two colors / or keep unused

  // Contact / proximity (optional but very useful in Open)
  bumper_front: boolean;
  bumper_left: boolean;
  bumper_right: boolean;

  // "Am I stuck?" signals (can come from encoders or motor current later)
  stuck: boolean;
  stuck_confidence: number;

  // Game-side info (optional; can be set manually at first)
  we_are_blue: boolean; // which goal is ours (if applicable)
  kickoff_us: boolean;
}
```

## Action Interface

```typescript
interface Action {
  motor1: number;  // -1 to 1 (or PWM 0-255)
  motor2: number;
  motor3: number;
  motor4: number;
  kick: boolean;   // kick the ball
}
```

## Game State Interface

```typescript
enum GameMode {
  SingleBot = 'single_bot',
  SingleTeam = 'single_team',
  TwoTeam = 'two_team'
}

enum GamePhase {
  Setup = 'setup',
  Kickoff = 'kickoff',
  Playing = 'playing',
  Paused = 'paused',
  OutOfBounds = 'out_of_bounds',
  Goal = 'goal',
  HalfTime = 'half_time',
  Finished = 'finished'
}

interface GameState {
  mode: GameMode;
  phase: GamePhase;
  score_blue: number;
  score_yellow: number;
  time_elapsed_ms: number;
  half: 1 | 2;
  countdown_ms: number;      // for restarts
  last_touch_team: 'blue' | 'yellow' | null;
  kickoff_team: 'blue' | 'yellow';
}
```

## Testing Strategy
- Unit tests for physics calculations
- Unit tests for observation system
- Unit tests for referee logic (out-of-bounds, goals, etc.)
- Integration tests for strategy execution
- Visual testing for renderers
- End-to-end tests for game modes

## Future Enhancements (Out of Scope)
- Line tracking sensor simulation
- Encoder simulation
- More advanced physics (motor current, etc.)
- Strategy compilation to Arduino code
- Network multiplayer support
- Tournament mode (multiple matches)
- Replay system
