# State Transition Diagrams

## Attacker State Machine

```mermaid
stateDiagram-v2
    [*] --> SEARCHING
    
    SEARCHING --> ATTACKING : ball visible
    ATTACKING --> SEARCHING : ball not visible
    
    SEARCHING --> UNCROSSING_LINE : line detected
    ATTACKING --> UNCROSSING_LINE : line detected
    
    UNCROSSING_LINE --> ATTACKING : backoff 10cm + ball visible
    UNCROSSING_LINE --> SEARCHING : backoff 10cm + ball not visible
    UNCROSSING_LINE --> RESET_POSITION : 3+ uncrossing events
    
    SEARCHING --> STUCK : bumper/stuck detected
    ATTACKING --> STUCK : bumper/stuck detected
    UNCROSSING_LINE --> STUCK : bumper/stuck detected
    RESET_POSITION --> STUCK : bumper/stuck detected
    
    STUCK --> ATTACKING : not stuck + 300ms + ball visible
    STUCK --> SEARCHING : not stuck + 300ms + ball not visible
    STUCK --> RESET_POSITION : 3+ stuck events + ball not visible/close
    
    SEARCHING --> RESET_POSITION : 3+ uncrossing events (global check)
    ATTACKING --> RESET_POSITION : 3+ uncrossing events (global check)
    
    RESET_POSITION --> ATTACKING : moved 60cm toward furthest goal
    
    note right of SEARCHING
        Search for ball by turning
        while moving forward
    end note
    
    note right of ATTACKING
        Approach and kick ball
        toward opponent goal
    end note
    
    note right of UNCROSSING_LINE
        Back away 10cm from boundary
        Records uncrossing event
    end note
    
    note right of STUCK
        Handle bumper collisions
        Records stuck event
        Min 300ms before exit
    end note
    
    note right of RESET_POSITION
        Move 60cm toward furthest goal
        Recovery after 3+ events
    end note
```

## Defender State Machine

```mermaid
stateDiagram-v2
    [*] --> SEARCHING
    
    SEARCHING --> DEFENDING : ball visible
    DEFENDING --> SEARCHING : ball not visible
    
    DEFENDING --> DEFLECTING : ball visible + distance < 40cm
    DEFLECTING --> DEFENDING : ball not visible OR distance > 70cm
    
    SEARCHING --> UNCROSSING_LINE : line detected
    DEFENDING --> UNCROSSING_LINE : line detected
    DEFLECTING --> UNCROSSING_LINE : line detected
    
    UNCROSSING_LINE --> DEFENDING : backoff 10cm + ball visible
    UNCROSSING_LINE --> SEARCHING : backoff 10cm + ball not visible
    UNCROSSING_LINE --> RESET_POSITION : 3+ reset events
    
    SEARCHING --> STUCK : bumper/stuck detected
    DEFENDING --> STUCK : bumper/stuck detected
    DEFLECTING --> STUCK : bumper/stuck detected
    UNCROSSING_LINE --> STUCK : bumper/stuck detected
    RESET_POSITION --> STUCK : bumper/stuck detected
    
    STUCK --> DEFENDING : not stuck + ball visible
    STUCK --> SEARCHING : not stuck + ball not visible
    STUCK --> RESET_POSITION : 3+ stuck events
    
    RESET_POSITION --> DEFENDING : moved 60cm toward own goal OR too close <40cm
    
    note right of SEARCHING
        Search for ball by turning
        while moving backward
    end note
    
    note right of DEFENDING
        Stay within 50cm of own goal
        Track ball, move away if <40cm
    end note
    
    note right of DEFLECTING
        Ball within 40cm
        Push ball toward opponent goal
        Stay near own goal
    end note
    
    note right of UNCROSSING_LINE
        Back away 10cm from boundary
        Records uncrossing event
    end note
    
    note right of STUCK
        Handle bumper collisions
        Records stuck event
    end note
    
    note right of RESET_POSITION
        Move 60cm toward OWN goal
        Recovery after 3+ events
        Exits early if too close <40cm
    end note
```

## State Descriptions

### Attacker States

- **SEARCHING**: Search for ball by turning while moving forward. Transitions to ATTACKING when ball is found.
- **ATTACKING**: Approach and kick the ball toward opponent goal. Transitions to SEARCHING when ball is lost.
- **UNCROSSING_LINE**: Back away 10cm from field boundary after line detection. Records 'uncrossing' event.
- **STUCK**: Handle bumper collisions and stuck situations. Records 'stuck' event. Requires 300ms minimum before exit.
- **RESET_POSITION**: Move 60cm toward furthest goal after 3+ stuck/uncrossing events. Used to recover from repeated failures.

### Defender States

- **SEARCHING**: Search for ball by turning while moving backward. Transitions to DEFENDING when ball is found.
- **DEFENDING**: Stay within 50cm of own goal, track ball. Move away if too close (<40cm). Transitions to DEFLECTING when ball is close (<40cm).
- **DEFLECTING**: Ball is within 40cm. Push ball toward opponent goal while staying near own goal. Exits when ball lost or >70cm away.
- **UNCROSSING_LINE**: Back away 10cm from field boundary after line detection. Records 'uncrossing' event.
- **STUCK**: Handle bumper collisions and stuck situations. Records 'stuck' event.
- **RESET_POSITION**: Move 60cm toward OWN goal after 3+ stuck/uncrossing events. Exits early if already too close (<40cm).

## Event Tracking

Both strategies track events in a 5-second window:
- **uncrossing**: Line crossing detected
- **stuck**: Bumper collision or stuck sensor triggered

After accumulating 3+ events within the window, the robot enters RESET_POSITION to recover.
