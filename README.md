# RoboCup Jr. (Open) Simulator

A web-based simulator for RoboCup Junior Soccer Open competition. Test and develop robot strategies before deploying to real hardware.

## Features

- **Multiple Game Modes**: Single bot, single team, or full 2v2 match simulation
- **2D & 3D Views**: Toggle between top-down 2D and immersive 3D visualization
- **Live Strategy Editor**: Edit JavaScript-based robot strategies in real-time
- **RoboCup Jr. Rules**: Full competition rules including kickoffs, out-of-bounds, and scoring
- **Drag & Drop**: Pause and reposition robots and ball for testing scenarios
- **Pac-Man Robots**: Realistic robot representation with kicker notch

## Quick Start

```bash
# Install dependencies and run
make start

# Or step by step:
make install
make dev
```

Then open http://localhost:5173 in your browser.

## Available Commands

```bash
make install  # Install npm dependencies
make dev      # Run development server (web browser)
make electron # Run as Electron desktop app
make build    # Build for production
make clean    # Remove build artifacts
make start    # Install and run (recommended)
```

## Game Modes

1. **Single Bot Mode**: One robot vs. the goal - perfect for testing individual strategies
2. **Single Team Mode**: Your attacker and defender together, no opponents
3. **Full Match**: Complete 2v2 simulation with opponent team

## Writing Strategies

Strategies are JavaScript functions that receive a `WorldState` and return an `Action`:

```javascript
function strategy(worldState) {
  const { ball, goal_blue, goal_yellow, we_are_blue } = worldState;
  
  // Your logic here...
  
  return {
    motor1: 0.5,  // Front-left motor (-1 to 1)
    motor2: 0.5,  // Front-right motor
    motor3: 0.5,  // Back-right motor
    motor4: 0.5,  // Back-left motor
    kick: false   // Trigger kick
  };
}
```

### WorldState Reference

```typescript
interface WorldState {
  t_ms: number;           // Current time (ms)
  dt_s: number;           // Delta time (seconds)
  heading_deg: number;    // Robot heading (degrees)
  
  ball: Observation;      // Ball observation
  goal_blue: Observation; // Blue goal observation
  goal_yellow: Observation;
  
  bumper_front: boolean;  // Bumper states
  bumper_left: boolean;
  bumper_right: boolean;
  
  stuck: boolean;         // Stuck detection
  we_are_blue: boolean;   // Team color
  kickoff_us: boolean;    // Is it our kickoff
}

interface Observation {
  visible: boolean;       // Is target visible
  angle_deg: number;      // Angle to target (-180 to 180)
  distance: number;       // Distance in cm
  confidence: number;     // Detection confidence (0-1)
}
```

### Helper Functions

Available in strategy code:
- `clamp(val, min, max)` - Clamp value to range
- `normalizeAngle(angle)` - Normalize angle to -180..180
- `Math_sin`, `Math_cos`, `Math_atan2`, `Math_sqrt`, `Math_abs`, etc.

## Field Specifications (RCJ Soccer Open)

- **Field Size**: 182cm × 243cm (6ft × 8ft, goals on 182cm sides)
- **Goals**: 70cm × 20cm × 18cm
- **Ball**: Standard orange golf ball (42.67mm diameter)
- **Robots**: Max 22cm diameter × 22cm height cylinder

## Controls

- **Play/Pause**: Start or pause simulation
- **Reset**: Reset to kickoff positions
- **Speed**: Adjust simulation speed (0.25x - 4x)
- **Perception Mode**: Cycle `Physics` -> `Camera 360 (conical mirror)` -> `Camera Front (Pixy2)` (saved in browser storage)
- **View Toggle**: Switch between 2D and 3D views
- **Drag & Drop**: When paused, drag robots and ball to reposition

## Tech Stack

- **Frontend**: React + TypeScript
- **Physics**: Matter.js
- **3D Rendering**: Three.js
- **Code Editor**: Monaco Editor
- **Build Tool**: Vite
- **Desktop**: Electron (optional)

## License

MIT
