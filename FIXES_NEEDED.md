# Fixes Needed for Omni Wheel Implementation

## ✅ Completed:
1. Verified forward kinematics from Arduino code
2. Updated physics engine inverse kinematics
3. Added `movementToMotors()` helper function

## 🔧 Still Need to Fix:

### 1. Update all motor assignments in defender.js to use `movementToMotors()`

**Current issues:**
- Line 229-232: RESET_POSITION turn in place - uses old differential drive pattern
- Line 238-241: RESET_POSITION turn while moving - uses old pattern
- Line 245-248: RESET_POSITION move forward - uses old pattern (all motors same = rotation!)
- Line 253-256: RESET_POSITION move forward (goal not visible) - uses old pattern
- Line 339-342: UNCROSSING_LINE stop - OK (zero motors)
- Line 346-349: UNCROSSING_LINE strafe - uses old pattern
- Line 474-477: STUCK strafe - uses old pattern
- Line 727-735: DEFENDING too far, goal behind - uses old pattern
- Line 738-743: DEFENDING too far, goal to side - uses old pattern
- Line 746-750: DEFENDING too far, facing goal - uses old pattern (all motors same = rotation!)
- Line 754-758: DEFENDING too far, goal not visible - uses old pattern
- Line 880-889: DEFENDING strafe - already updated ✓

### 2. Test each movement pattern individually:
- Forward movement
- Backward movement
- Strafe left
- Strafe right
- Rotate CW
- Rotate CCW
- Combined movements

### 3. Test each strategy state:
- SEARCHING
- DEFENDING (all branches)
- DEFLECTING
- UNCROSSING_LINE
- STUCK
- RESET_POSITION

## Forward Kinematics Formula (from Arduino):
```
m1 = vx + vy + omega
m2 = -vx + vy + omega
m3 = vx - vy - omega
m4 = -vx - vy - omega
```

Where:
- vx = forward/backward (forward = +)
- vy = left/right (right = +)
- omega = rotation (clockwise = +)

## Examples:
- Forward: vx=1, vy=0, omega=0 → m1=1, m2=-1, m3=1, m4=-1
- Backward: vx=-1, vy=0, omega=0 → m1=-1, m2=1, m3=-1, m4=1
- Strafe right: vx=0, vy=1, omega=0 → m1=1, m2=1, m3=-1, m4=-1
- Strafe left: vx=0, vy=-1, omega=0 → m1=-1, m2=-1, m3=1, m4=1
- Rotate CW: vx=0, vy=0, omega=1 → m1=1, m2=1, m3=-1, m4=-1
- Rotate CCW: vx=0, vy=0, omega=-1 → m1=-1, m2=-1, m3=1, m4=1
