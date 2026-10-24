/*
  MCL Boat - BLE Water Dashboard
  ESP32 Freenove WROVER

  Removed: RC receiver, Wi-Fi web server, battery sensor, leak sensor,
           distance sensor, compass, MPU6050.
  Added: BLE control, pH, turbidity, EC/conductivity inputs.

  The browser dashboard sends a command repeatedly while a motor button is held.
  If commands stop for 600 ms, both ESCs go to neutral.
*/

#include <Arduino.h>
#include <ESP32Servo.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ArduinoJson.h>
#include <math.h>
#include <TinyGPSPlus.h>
#include <HardwareSerial.h>

// -------------------- Motor pins --------------------
#define ESC_LEFT_PIN       13
#define ESC_RIGHT_PIN      23
#define ESC_NEUTRAL        90
#define ESC_MIN_REVERSE    30
#define ESC_MAX_FORWARD    150
#define ESC_LEFT_TRIM      0
#define ESC_RIGHT_TRIM     0

// -------------------- Sensor pins -------------------
// ESP32 ADC1 pins are used so readings remain available even if Wi-Fi is added later.
#define PH_PIN              34
#define TURBIDITY_PIN       35
#define EC_PIN              32

// -------------------- Optional GPS ------------------
#define GPS_RX_PIN          18
#define GPS_TX_PIN          19
#define GPS_BAUD            9600
#define GPS_ENABLED         true

// -------------------- ADC and calibration ------------
#define ADC_SAMPLES         16
#define ADC_REFERENCE_V     3.30f
#define ADC_MAX_VALUE       4095.0f

// PH-4502C needs calibration with pH 7 and pH 4/10 buffer solutions.
// This is a starting point only; change after calibration.
#define PH7_VOLTAGE         2.50f
#define PH_SLOPE            -3.50f

// DFRobot-style turbidity boards commonly use this approximate curve.
// Sensor modules vary, so calibrate with clean and dirty reference water.
#define TURBIDITY_MIN_NTU   0.0f
#define TURBIDITY_MAX_NTU   3000.0f

// EC/Conductivity boards need their own calibration solution.
// EC_SCALE is the approximate microSiemens/cm per volt after calibration.
#define EC_SCALE_US_PER_V   1000.0f
#define EC_ZERO_VOLTAGE     0.00f
#define EC_TEMP_C           25.0f

// -------------------- BLE UUIDs ---------------------
#define BLE_SERVICE_UUID    "7b7e0001-2d8b-4c70-9c2e-8e2e5a8b0001"
#define BLE_DATA_UUID       "7b7e0002-2d8b-4c70-9c2e-8e2e5a8b0001"
#define BLE_COMMAND_UUID    "7b7e0003-2d8b-4c70-9c2e-8e2e5a8b0001"

Servo escLeft;
Servo escRight;
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

BLECharacteristic* dataCharacteristic = nullptr;
BLECharacteristic* commandCharacteristic = nullptr;
bool bleConnected = false;

unsigned long lastCommandMs = 0;
unsigned long lastPublishMs = 0;
bool leftHeld = false;
bool rightHeld = false;

struct WaterReading {
  float ph;
  float phVoltage;
  float turbidityNTU;
  float turbidityVoltage;
  float ecUsCm;
  float ecMsCm;
  float salinityPpt;
  float ecVoltage;
  double latitude;
  double longitude;
  bool gpsValid;
};

WaterReading reading{};

// Forward declarations used by BLE callbacks.
void stopMotors();
void applyMotorCommand();

// -------------------- BLE callbacks -----------------
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* server) override {
    bleConnected = true;
    Serial.println("[BLE] Client connected");
  }

  void onDisconnect(BLEServer* server) override {
    bleConnected = false;
    leftHeld = false;
    rightHeld = false;
    stopMotors();
    Serial.println("[BLE] Client disconnected - motors stopped");
    delay(100);
    BLEDevice::startAdvertising();
  }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    std::string raw = characteristic->getValue();
    if (raw.empty()) return;

    String command = String(raw.c_str());
    command.trim();
    lastCommandMs = millis();

    if (command == "L1") {
      leftHeld = true;
    } else if (command == "R1") {
      rightHeld = true;
    } else if (command == "B1") {
      leftHeld = true;
      rightHeld = true;
    } else if (command == "STOP") {
      leftHeld = false;
      rightHeld = false;
      stopMotors();
    }
    applyMotorCommand();
  }
};

// -------------------- Motor control -----------------
void setMotors(int leftValue, int rightValue) {
  int left = constrain(leftValue + ESC_LEFT_TRIM, ESC_MIN_REVERSE, ESC_MAX_FORWARD);
  int right = constrain(rightValue + ESC_RIGHT_TRIM, ESC_MIN_REVERSE, ESC_MAX_FORWARD);
  escLeft.write(left);
  escRight.write(right);
}

void stopMotors() {
  escLeft.write(ESC_NEUTRAL);
  escRight.write(ESC_NEUTRAL);
}

void applyMotorCommand() {
  if (!bleConnected || millis() - lastCommandMs > 600) {
    leftHeld = false;
    rightHeld = false;
    stopMotors();
    return;
  }

  // Each button runs only its own motor. The dashboard sends STOP on release.
  int left = leftHeld ? ESC_MAX_FORWARD : ESC_NEUTRAL;
  int right = rightHeld ? ESC_MAX_FORWARD : ESC_NEUTRAL;
  setMotors(left, right);
}

// -------------------- ADC helpers -------------------
float readVoltage(uint8_t pin) {
  uint32_t total = 0;
  for (int i = 0; i < ADC_SAMPLES; i++) {
    total += analogRead(pin);
    delayMicroseconds(300);
  }
  float average = (float)total / ADC_SAMPLES;
  return average * ADC_REFERENCE_V / ADC_MAX_VALUE;
}

float readPH(float voltage) {
  // pH = 7 at PH7_VOLTAGE; PH_SLOPE must be adjusted during calibration.
  return constrain(7.0f + (voltage - PH7_VOLTAGE) * PH_SLOPE, 0.0f, 14.0f);
}

float readTurbidityNTU(float voltage) {
  // Common approximate curve for analog turbidity modules.
  float ntu = -1120.4f * voltage * voltage + 5742.3f * voltage - 4352.9f;
  if (voltage >= 2.50f) ntu = 0.0f;
  return constrain(ntu, TURBIDITY_MIN_NTU, TURBIDITY_MAX_NTU);
}

void readWaterSensors() {
  reading.phVoltage = readVoltage(PH_PIN);
  reading.ph = readPH(reading.phVoltage);

  reading.turbidityVoltage = readVoltage(TURBIDITY_PIN);
  reading.turbidityNTU = readTurbidityNTU(reading.turbidityVoltage);

  reading.ecVoltage = readVoltage(EC_PIN);
  reading.ecUsCm = max(0.0f, (reading.ecVoltage - EC_ZERO_VOLTAGE) * EC_SCALE_US_PER_V);
  reading.ecMsCm = reading.ecUsCm / 1000.0f;

  // Approximate salinity in ppt from conductivity at 25 C.
  // For accurate salinity, calibrate against a known seawater standard.
  reading.salinityPpt = reading.ecMsCm * 0.64f;
}

// -------------------- Optional GPS ------------------
void updateGPS() {
  if (!GPS_ENABLED) return;
  while (gpsSerial.available()) gps.encode(gpsSerial.read());
  reading.gpsValid = gps.location.isValid() && gps.location.age() < 3000;
  if (reading.gpsValid) {
    reading.latitude = gps.location.lat();
    reading.longitude = gps.location.lng();
  }
}

// -------------------- BLE data ----------------------
void publishReading() {
  if (!bleConnected || dataCharacteristic == nullptr) return;

  StaticJsonDocument<768> doc;
  doc["type"] = "water";
  doc["ms"] = millis();
  doc["ph"] = reading.ph;
  doc["phVoltage"] = reading.phVoltage;
  doc["turbidityNTU"] = reading.turbidityNTU;
  doc["turbidityVoltage"] = reading.turbidityVoltage;
  doc["ecUsCm"] = reading.ecUsCm;
  doc["ecMsCm"] = reading.ecMsCm;
  doc["salinityPpt"] = reading.salinityPpt;
  doc["ecVoltage"] = reading.ecVoltage;
  doc["gpsValid"] = reading.gpsValid;
  if (reading.gpsValid) {
    doc["lat"] = reading.latitude;
    doc["lng"] = reading.longitude;
  }

  String output;
  serializeJson(doc, output);
  dataCharacteristic->setValue(output.c_str());
  dataCharacteristic->notify();
}

void setupBLE() {
  BLEDevice::init("MCL-Water-Boat");
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService* service = server->createService(BLE_SERVICE_UUID);

  dataCharacteristic = service->createCharacteristic(
    BLE_DATA_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  dataCharacteristic->addDescriptor(new BLE2902());

  commandCharacteristic = service->createCharacteristic(
    BLE_COMMAND_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  commandCharacteristic->setCallbacks(new CommandCallbacks());

  service->start();
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(BLE_SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  advertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.println("[BLE] Advertising as MCL-Water-Boat");
}

// -------------------- Arduino -----------------------
void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetPinAttenuation(PH_PIN, ADC_11db);
  analogSetPinAttenuation(TURBIDITY_PIN, ADC_11db);
  analogSetPinAttenuation(EC_PIN, ADC_11db);

  escLeft.attach(ESC_LEFT_PIN, 1000, 2000);
  escRight.attach(ESC_RIGHT_PIN, 1000, 2000);
  stopMotors();
  delay(1000);

  if (GPS_ENABLED) gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  setupBLE();
  readWaterSensors();
  Serial.println("[BOOT] Ready");
}

void loop() {
  updateGPS();
  readWaterSensors();
  applyMotorCommand();

  if (millis() - lastPublishMs >= 1000) {
    lastPublishMs = millis();
    publishReading();
    Serial.printf("[WATER] pH=%.2f turb=%.1f NTU EC=%.2f mS/cm sal=%.2f ppt\n",
      reading.ph, reading.turbidityNTU, reading.ecMsCm, reading.salinityPpt);
  }
  delay(20);
}
