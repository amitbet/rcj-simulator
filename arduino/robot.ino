#include <Arduino.h>

// ---------------------- Pin Definitions ----------------------
// 3=bin2
// 4=ain2
// 5=ain1
// 6=pwmB
// 7=pwma
// 8=Bin1
// 9=en2
// 10=en1

// Front Left (M1) 
const int PWM_M1 = 7;
const int IN1_M1 = 5;
const int IN2_M1 = 4;
const int EN_M1 = 10;

// Back Left (M3)
const int PWM_M3 = 6;
const int IN1_M3 = 3;
const int IN2_M3 = 8;
const int EN_M3 = 9;

// ----- controller 2 -----:

// 20=bin2
// 19=ain2
// 18=ain1
// 17= en2
// 16= en1
// 15= bin1
// 14= pwmB
// 13= pwma

// Front Right (M4)  [A]
const int PWM_M4 = 13;
const int IN1_M4 =18;
const int IN2_M4 = 19;
const int EN_M4 = 16;

// Back Right (M2)   [B]
const int PWM_M2 = 14;
const int IN1_M2 = 20;
const int IN2_M2 = 15;
const int EN_M2 = 17;


// ===== Speeds =====
const int DRIVE_SPEED = 180;   // for straight/strafe
const int TURN_SPEED  = 160;   // for rotation

// ===== Rotation timing =====
// This is the IMPORTANT tuning value!
// Adjust until ONE step ≈ 30 degrees
int TURN_STEP_MS = 250;  // <-- YOU WILL TUNE THIS

// ===== Low-level motor control =====
void motorForward(int PWM, int INA, int INB, int EN, int speed) {
  digitalWrite(EN, HIGH);
  digitalWrite(INA, HIGH);
  digitalWrite(INB, LOW);
  analogWrite(PWM, speed);
}

void motorBackward(int PWM, int INA, int INB, int EN, int speed) {
  digitalWrite(EN, HIGH);
  digitalWrite(INA, LOW);
  digitalWrite(INB, HIGH);
  analogWrite(PWM, speed);
}

void motorStop(int PWM, int INA, int INB) {
  digitalWrite(INA, LOW);
  digitalWrite(INB, LOW);
  analogWrite(PWM, 0);
}

void stopAll() {
  motorStop(FL_PWM, FL_INA, FL_INB);
  motorStop(FR_PWM, FR_INA, FR_INB);
  motorStop(BL_PWM, BL_INA, BL_INB);
  motorStop(BR_PWM, BR_INA, BR_INB);
}

// ===== Diamond omni kinematics =====

// Forward:  FL +, FR -, BL -, BR +
void moveFwd(int s) {
  motorForward (FL_PWM, FL_INA, FL_INB, FL_EN, s);
  motorBackward(FR_PWM, FR_INA, FR_INB, FR_EN, s);
  motorBackward(BL_PWM, BL_INA, BL_INB, BL_EN, s);
  motorForward (BR_PWM, BR_INA, BR_INB, BR_EN, s);
}

// Back: opposite
void moveBack(int s) {
  motorBackward(FL_PWM, FL_INA, FL_INB, FL_EN, s);
  motorForward (FR_PWM, FR_INA, FR_INB, FR_EN, s);
  motorForward (BL_PWM, BL_INA, BL_INB, BL_EN, s);
  motorBackward(BR_PWM, BR_INA, BR_INB, BR_EN, s);
}

// Right: all +
void moveRight(int s) {
  motorForward(FL_PWM, FL_INA, FL_INB, FL_EN, s);
  motorForward(FR_PWM, FR_INA, FR_INB, FR_EN, s);
  motorbackward(BL_PWM, BL_INA, BL_INB, BL_EN, s);
  motorbackward(BR_PWM, BR_INA, BR_INB, BR_EN, s);
}

// Left: all -
void moveLeft(int s) {
  motorBackward(FL_PWM, FL_INA, FL_INB, FL_EN, s);
  motorBackward(FR_PWM, FR_INA, FR_INB, FR_EN, s);
  motorForward(BL_PWM, BL_INA, BL_INB, BL_EN, s);
  motorForward(BR_PWM, BR_INA, BR_INB, BR_EN, s);
}

// Rotate CW
void rotateCW(int s) {
  motorForward (FL_PWM, FL_INA, FL_INB, FL_EN, s);
  motorBackward (FR_PWM, FR_INA, FR_INB, FR_EN, s);
  motorForward(BL_PWM, BL_INA, BL_INB, BL_EN, s);
  motorBackward(BR_PWM, BR_INA, BR_INB, BR_EN, s);
}

// Rotate CCW
void rotateCCW(int s) {
  motorBackward(FL_PWM, FL_INA, FL_INB, FL_EN, s);
  motorForward(FR_PWM, FR_INA, FR_INB, FR_EN, s);
  motorBackward (BL_PWM, BL_INA, BL_INB, BL_EN, s);
  motorForward (BR_PWM, BR_INA, BR_INB, BR_EN, s);
}

// ===== Setup =====
void setup() {
  pinMode(FL_PWM, OUTPUT); pinMode(FL_INA, OUTPUT); pinMode(FL_INB, OUTPUT); pinMode(FL_EN, OUTPUT);
  pinMode(FR_PWM, OUTPUT); pinMode(FR_INA, OUTPUT); pinMode(FR_INB, OUTPUT); pinMode(FR_EN, OUTPUT);
  pinMode(BL_PWM, OUTPUT); pinMode(BL_INA, OUTPUT); pinMode(BL_INB, OUTPUT); pinMode(BL_EN, OUTPUT);
  pinMode(BR_PWM, OUTPUT); pinMode(BR_INA, OUTPUT); pinMode(BR_INB, OUTPUT); pinMode(BR_EN, OUTPUT);

  analogWriteResolution(8); // 0..255

  stopAll();
  delay(1000);
}

// ===== Main demo =====
void loop() {
  // Forward 5s
  moveFwd(DRIVE_SPEED);
  delay(5000);
  stopAll();
  delay(500);

  // Back 5s
  moveBack(DRIVE_SPEED);
  delay(5000);
  stopAll();
  delay(500);

  // Right 5s
  moveRight(DRIVE_SPEED);
  delay(5000);
  stopAll();
  delay(500);

  // Left 5s
  moveLeft(DRIVE_SPEED);
  delay(5000);
  stopAll();
  delay(500);

  // Rotate CW: 12 steps = ~360°
  for (int i = 0; i < 12; i++) {
    rotateCW(TURN_SPEED);
    delay(TURN_STEP_MS);   // <<< TUNE THIS
    stopAll();
    delay(300);
  }

  delay(1000);

  // Rotate CCW: 12 steps = ~360°
  for (int i = 0; i < 12; i++) {
    rotateCCW(TURN_SPEED);
    delay(TURN_STEP_MS);   // <<< TUNE THIS
    stopAll();
    delay(300);
  }

  delay(3000); // repeat
}