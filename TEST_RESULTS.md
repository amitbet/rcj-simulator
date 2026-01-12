# Test Results and Fixes

## Omni Wheel Kinematics Tests

All kinematics tests PASS ✓

- Forward movement: ✓
- Backward movement: ✓
- Strafe right: ✓
- Strafe left: ✓
- Rotate clockwise: ✓
- Rotate counter-clockwise: ✓
- Combined movement: ✓

**Forward kinematics formula (verified):**
```
m1 = (vx + vy) / sqrt(2) + ω
m2 = (-vx + vy) / sqrt(2) + ω
m3 = (-vx - vy) / sqrt(2) + ω
m4 = (vx - vy) / sqrt(2) + ω
```

Where:
- vx = forward/backward (forward = +)
- vy = left/right (right = +)
- ω = rotation (clockwise = +)

## Defender Strategy State Tests

### Issues Found:

1. **Test 1: Too far from goal** - Returns rotation only, not forward movement
   - Issue: Using old differential drive logic (all motors same = rotation)
   - Fix: Need to convert to omni wheel forward kinematics

2. **Test 2-4: At correct distance** - Returns zero motors
   - Issue: When ball is centered (goalToBallAngle = 0), strafeSpeed becomes 0
   - Fix: Added minimum strafe speed, but still need to handle centered case

3. **Test 5: Too close** - Returns rotation only
   - Issue: Same as Test 1 - using old differential drive logic

4. **Test 6: DEFLECTING** - Not transitioning (TEST MODE disabled)
   - Expected: This is intentional (TEST MODE)

5. **Test 7: Ball not visible** - Returns zero motors
   - Issue: Search logic not working correctly

## Required Fixes:

1. **Update all movement commands to use omni wheel forward kinematics**
   - Replace all direct motor assignments with forward kinematics
   - Convert desired movement (vx, vy, ω) to motor speeds

2. **Fix "too far" and "too close" logic**
   - Currently using differential drive pattern (all motors same = rotation)
   - Need to use forward kinematics: vx = forward speed, vy = 0, ω = turn speed

3. **Fix centered ball case**
   - When ball is centered, ensure we still move (at least turn to face opponent)

4. **Fix search logic**
   - When ball not visible, should do small search movement

## Next Steps:

1. Update all motor command assignments in defender.js to use forward kinematics helper
2. Test each state individually
3. Compose states only after individual tests pass
