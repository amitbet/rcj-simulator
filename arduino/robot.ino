#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BNO055.h>
#include <utility/imumaths.h>
 
#include <TPixy2.h>
 

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
const int IN2_M4 = 15;
const int EN_M4 = 16;

// Back Right (M2)   [B]
const int PWM_M2 = 14;
const int IN1_M2 = 20;
const int IN2_M2 = 19;
const int EN_M2 = 17;

// Keep existing drive code names
const int FL_PWM = PWM_M1;
const int FL_INA = IN1_M1;
const int FL_INB = IN2_M1;
const int FL_EN = EN_M1;

const int BL_PWM = PWM_M4;
const int BL_INA = IN1_M4;
const int BL_INB = IN2_M4;
const int BL_EN = EN_M4;

const int FR_PWM = PWM_M3;
const int FR_INA = IN1_M3;
const int FR_INB = IN2_M3;
const int FR_EN = EN_M3;

const int BR_PWM = PWM_M2;
const int BR_INA = IN1_M2;
const int BR_INB = IN2_M2;
const int BR_EN = EN_M2;


// BNO055 on I2C (requested wiring: SDA=24, SCL=25)
const int I2C_SDA_PIN = 24;
const int I2C_SCL_PIN = 25;
Adafruit_BNO055 bno = Adafruit_BNO055(55, 0x28, &Wire);

unsigned long lastImuPrintMs = 0;
const unsigned long IMU_PRINT_PERIOD_MS = 100;
unsigned long lastPixyPrintMs = 0;
const unsigned long PIXY_PRINT_PERIOD_MS = 100;

// Pixy2 SPI1 pins (Teensy 4.1)
const int PIXY_MISO_PIN = 1;
const int PIXY_MOSI_PIN = 26;
const int PIXY_SCK_PIN = 27;
const int PIXY_CS_PIN = 0;

#define PIXY_SPI_CLOCKRATE 2000000
class Link2SPI1_SS
{
public:
  int8_t open(uint32_t arg)
  {
    if (arg == PIXY_DEFAULT_ARGVAL) {
      ssPin = 0;
    } else {
      ssPin = (uint8_t)arg;
    }
    pinMode(ssPin, OUTPUT);
    digitalWrite(ssPin, HIGH);
    SPI1.begin();
    SPI1.beginTransaction(SPISettings(PIXY_SPI_CLOCKRATE, MSBFIRST, SPI_MODE1));
    return 0;
  }

  void close()
  {
    SPI1.endTransaction();
  }

  int16_t recv(uint8_t *buf, uint8_t len, uint16_t *cs = NULL)
  {
    uint8_t i;
    if (cs) *cs = 0;
    digitalWrite(ssPin, LOW);
    for (i = 0; i < len; i++)
    {
      buf[i] = SPI1.transfer(0x00);
      if (cs) *cs += buf[i];
    }
    digitalWrite(ssPin, HIGH);
    return len;
  }

  int16_t send(uint8_t *buf, uint8_t len)
  {
    uint8_t i;
    digitalWrite(ssPin, LOW);
    for (i = 0; i < len; i++)
      SPI1.transfer(buf[i]);
    digitalWrite(ssPin, HIGH);
    return len;
  }

private:
  uint8_t ssPin;
};

typedef TPixy2<Link2SPI1_SS> Pixy2SPI1_SS;
Pixy2SPI1_SS pixy;
 
// ===== Speeds =====
const int DRIVE_SPEED = 180;   // for straight/strafe
const int TURN_SPEED  = 160;   // for rotation
const int SEARCH_TURN_SPEED = 120;

// ===== Pixy2 orange ball tracking =====
// Set this to the Pixy2 signature trained for the orange ball in PixyMon.
const uint8_t ORANGE_BALL_SIGNATURE = 3;
const int PIXY_FRAME_CENTER_X = 158;  // Pixy2 frame width is 316 px
const int PIXY_CENTER_DEADBAND = 18;  // px from center considered "aligned"
const int BALL_TARGET_AREA = 4200;    // tune based on desired stop distance
const int BALL_AREA_TOLERANCE = 700;

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
  motorBackward(BL_PWM, BL_INA, BL_INB, BL_EN, s);
  motorBackward(BR_PWM, BR_INA, BR_INB, BR_EN, s);
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

void printImuData() {
  const unsigned long now = millis();
  if (now - lastImuPrintMs < IMU_PRINT_PERIOD_MS) {
    return;
  }
  lastImuPrintMs = now;

  imu::Vector<3> euler = bno.getVector(Adafruit_BNO055::VECTOR_EULER);
  imu::Vector<3> gyro = bno.getVector(Adafruit_BNO055::VECTOR_GYROSCOPE);
  imu::Vector<3> accel = bno.getVector(Adafruit_BNO055::VECTOR_LINEARACCEL);

  uint8_t sys = 0;
  uint8_t gyroCal = 0;
  uint8_t accelCal = 0;
  uint8_t magCal = 0;
  bno.getCalibration(&sys, &gyroCal, &accelCal, &magCal);

  // heading=Euler.x, roll=Euler.z, pitch=Euler.y (BNO055 convention)
  Serial.print("BNO055 heading=");
  Serial.print(euler.x(), 1);
  Serial.print(" roll=");
  Serial.print(euler.z(), 1);
  Serial.print(" pitch=");
  Serial.print(euler.y(), 1);
  Serial.print(" gyro_dps=(");
  Serial.print(gyro.x(), 2);
  Serial.print(",");
  Serial.print(gyro.y(), 2);
  Serial.print(",");
  Serial.print(gyro.z(), 2);
  Serial.print(") linacc_ms2=(");
  Serial.print(accel.x(), 2);
  Serial.print(",");
  Serial.print(accel.y(), 2);
  Serial.print(",");
  Serial.print(accel.z(), 2);
  Serial.print(") cal=");
  Serial.print(sys);
  Serial.print("/");
  Serial.print(gyroCal);
  Serial.print("/");
  Serial.print(accelCal);
  Serial.print("/");
  Serial.println(magCal);
}

void printPixyData() {
  const unsigned long now = millis();
  if (now - lastPixyPrintMs < PIXY_PRINT_PERIOD_MS) {
    return;
  }
  lastPixyPrintMs = now;

   int8_t blocksStatus = pixy.ccc.getBlocks();
  if (blocksStatus < 0) {
    Serial.print("Pixy2 read error=");
    Serial.println(blocksStatus);
    return;
  }

  if (pixy.ccc.numBlocks == 0) {
    Serial.println("Pixy2 blocks=0");
    return;
  }

  const Block &b = pixy.ccc.blocks[0];
  Serial.print("Pixy2 blocks=");
  Serial.print(pixy.ccc.numBlocks);
  Serial.print(" sig=");
  Serial.print(b.m_signature);
  Serial.print(" x=");
  Serial.print(b.m_x);
  Serial.print(" y=");
  Serial.print(b.m_y);
  Serial.print(" w=");
  Serial.print(b.m_width);
  Serial.print(" h=");
  Serial.println(b.m_height);
 }

void delayWithImu(unsigned long waitMs) {
  const unsigned long start = millis();
  while (millis() - start < waitMs) {
    printImuData();
    printPixyData();
    delay(10);
  }
}

bool getBestOrangeBall(Block &bestBlock) {
  const int8_t blocksStatus = pixy.ccc.getBlocks();
  if (blocksStatus < 0 || pixy.ccc.numBlocks == 0) {
    return false;
  }

  bool found = false;
  int bestArea = 0;
  for (uint16_t i = 0; i < pixy.ccc.numBlocks; i++) {
    const Block &b = pixy.ccc.blocks[i];
    if (b.m_signature != ORANGE_BALL_SIGNATURE) {
      continue;
    }

    const int area = (int)b.m_width * (int)b.m_height;
    if (!found || area > bestArea) {
      bestArea = area;
      bestBlock = b;
      found = true;
    }
  }
  return found;
}

// ===== Setup =====
void setup() {
  pinMode(FL_PWM, OUTPUT); pinMode(FL_INA, OUTPUT); pinMode(FL_INB, OUTPUT); pinMode(FL_EN, OUTPUT);
  pinMode(FR_PWM, OUTPUT); pinMode(FR_INA, OUTPUT); pinMode(FR_INB, OUTPUT); pinMode(FR_EN, OUTPUT);
  pinMode(BL_PWM, OUTPUT); pinMode(BL_INA, OUTPUT); pinMode(BL_INB, OUTPUT); pinMode(BL_EN, OUTPUT);
  pinMode(BR_PWM, OUTPUT); pinMode(BR_INA, OUTPUT); pinMode(BR_INB, OUTPUT); pinMode(BR_EN, OUTPUT);

  analogWriteResolution(8); // 0..255
  Serial.begin(115200);
  delay(200);

#if defined(CORE_TEENSY) || defined(TEENSYDUINO)
  Wire.setSDA(I2C_SDA_PIN);
  Wire.setSCL(I2C_SCL_PIN);
#endif
  Wire.begin();

  if (!bno.begin()) {
    Serial.println("BNO055 init failed. Check wiring/address (0x28/0x29).");
  } else {
    bno.setExtCrystalUse(true);
    Serial.println("BNO055 initialized on I2C.");
  }

#if defined(CORE_TEENSY) || defined(TEENSYDUINO)
  SPI1.setMISO(PIXY_MISO_PIN);
  SPI1.setMOSI(PIXY_MOSI_PIN);
  SPI1.setSCK(PIXY_SCK_PIN);
  SPI1.setCS(PIXY_CS_PIN);
#endif
  pinMode(PIXY_CS_PIN, OUTPUT);
  digitalWrite(PIXY_CS_PIN, HIGH);
  SPI1.begin();

  const int8_t pixyStatus = pixy.init(PIXY_CS_PIN);
  if (pixyStatus < 0) {
    Serial.print("Pixy2 init failed, status=");
    Serial.println(pixyStatus);
  } else {
    Serial.println("Pixy2 initialized on SPI.");
  }
 
  stopAll();
  delay(1000);
}

void demo() {
  // Forward 5s
  moveFwd(DRIVE_SPEED);
  delayWithImu(5000);
  stopAll();
  delayWithImu(500);

  // Back 5s
  moveBack(DRIVE_SPEED);
  delayWithImu(5000);
  stopAll();
  delayWithImu(500);

  // Right 5s
  moveRight(DRIVE_SPEED);
  delayWithImu(5000);
  stopAll();
  delayWithImu(500);

  // Left 5s
  moveLeft(DRIVE_SPEED);
  delayWithImu(5000);
  stopAll();
  delayWithImu(500);

  // Rotate CW: 12 steps = ~360°
  for (int i = 0; i < 12; i++) {
    rotateCW(TURN_SPEED);
    delayWithImu(TURN_STEP_MS);   // <<< TUNE THIS
    stopAll();
    delayWithImu(300);
  }

  delayWithImu(1000);

  // Rotate CCW: 12 steps = ~360°
  for (int i = 0; i < 12; i++) {
    rotateCCW(TURN_SPEED);
    delayWithImu(TURN_STEP_MS);   // <<< TUNE THIS
    stopAll();
    delayWithImu(300);
  }

  delayWithImu(3000); // repeat
}

// ===== Main behavior: follow orange ball with forward-facing Pixy2 =====
void ball_follow() {
  Block ball;
  const bool hasBall = getBestOrangeBall(ball);

  if (!hasBall) {
    // Search by slowly rotating in place until the ball is seen.
    rotateCW(SEARCH_TURN_SPEED);
    printImuData();
    printPixyData();
    delay(20);
    return;
  }

  const int xError = (int)ball.m_x - PIXY_FRAME_CENTER_X;
  const int ballArea = (int)ball.m_width * (int)ball.m_height;

  if (xError > PIXY_CENTER_DEADBAND) {
    rotateCW(TURN_SPEED);
  } else if (xError < -PIXY_CENTER_DEADBAND) {
    rotateCCW(TURN_SPEED);
  } else if (ballArea < (BALL_TARGET_AREA - BALL_AREA_TOLERANCE)) {
    moveFwd(DRIVE_SPEED);
  } else if (ballArea > (BALL_TARGET_AREA + BALL_AREA_TOLERANCE)) {
    moveBack(DRIVE_SPEED / 2);
  } else {
    stopAll();
  }

  printImuData();
  printPixyData();
  delay(20);
}


void loop() {
  demo();
}