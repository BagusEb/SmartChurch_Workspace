#include <WiFi.h>
#include <HTTPClient.h>
#include <ld2410.h>

ld2410 radar;

// ======================================================
// Wi-Fi Configuration
// ======================================================
const char* ssid = "your_wifi_name";
const char* password = "your_wifi_password";
const char* serverUrl = "http://<Mini_PC_local_IP>:8001/";

const int BUZZER_PIN = 4;

// ======================================================
// Timing Configuration
// ======================================================
const unsigned long sendCooldown = 5000;   // Minimum interval between data transmissions (5 seconds)
unsigned long lastSendTime = 0;

// ======================================================
// Detection Lock (Debounce Mechanism)
// Prevents multiple detections while a person remains
// within the sensing area.
// ======================================================
bool readyToDetect = true;
unsigned long emptyAreaTime = 0;
const unsigned long emptyAreaDelay = 2000; // Area must remain empty for 2 seconds before reactivation

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // ======================================================
  // Initialize Wi-Fi Connection
  // ======================================================
  WiFi.disconnect(true);
  delay(1000);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("Connecting to Wi-Fi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }

  Serial.println("\n[SUCCESS] Wi-Fi connected.");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());

  // ======================================================
  // Initialize LD2410 Radar Sensor
  // ======================================================
  Serial1.begin(256000, SERIAL_8N1, 32, 19);
  radar.begin(Serial1);

  Serial.println("Radar initialized. Waiting for movement...");
}

void loop() {

  radar.read();

  if (radar.isConnected()) {

    if (radar.presenceDetected()) {

      // Update the last detected timestamp
      emptyAreaTime = millis();

      if (readyToDetect &&
          (lastSendTime == 0 ||
           millis() - lastSendTime >= sendCooldown) &&
          radar.movingTargetDetected()) {

        int distance = radar.movingTargetDistance();

        String direction = "";
        bool validZone = false;

        // ======================================================
        // Distance Zone Classification
        // 0–249 cm   : Entrance (IN)
        // 260–300 cm : Exit (OUT)
        // ======================================================

        // Ignore invalid sensor readings
        if (distance > 0 && distance < 250) {

          direction = "in";
          validZone = true;

          Serial.println("\n[IN] Person entered (Distance < 2.5 m)");

          // Double beep
          digitalWrite(BUZZER_PIN, HIGH);
          delay(100);
          digitalWrite(BUZZER_PIN, LOW);
          delay(100);
          digitalWrite(BUZZER_PIN, HIGH);
          delay(100);
          digitalWrite(BUZZER_PIN, LOW);

        }
        else if (distance >= 251 && distance <= 300) {

          direction = "out";
          validZone = true;

          Serial.println("\n[OUT] Person exited (Distance ≥ 2.51 m)");

          // Single long beep
          digitalWrite(BUZZER_PIN, HIGH);
          delay(300);
          digitalWrite(BUZZER_PIN, LOW);

        }

        // ======================================================
        // Send Data to the Server
        // ======================================================
        if (validZone) {

          Serial.print("Sending data to server... Distance: ");
          Serial.print(distance);
          Serial.println(" cm");

          if (WiFi.status() == WL_CONNECTED) {

            HTTPClient http;

            http.begin(serverUrl);
            http.addHeader("Content-Type", "application/json");
            http.setTimeout(3000);

            String payload =
              "{\"status\":\"" + direction +
              "\", \"distance\":" + String(distance) + "}";

            int httpResponseCode = http.POST(payload);

            if (httpResponseCode > 0) {

              Serial.print("SUCCESS! HTTP Response Code: ");
              Serial.println(httpResponseCode);

            } else {

              Serial.print("FAILED! Error: ");
              Serial.println(http.errorToString(httpResponseCode));
            }

            http.end();

          } else {

            Serial.println("Wi-Fi connection lost while sending data.");
          }

          // Lock detection until the sensing area becomes empty
          lastSendTime = millis();
          readyToDetect = false;

          Serial.println("[INFO] Detection locked. Waiting for the area to clear...");
        }
      }

    } else {

      // Reactivate detection after the area has been empty
      // for the configured delay period.
      if (!readyToDetect &&
          (millis() - emptyAreaTime >= emptyAreaDelay)) {

        readyToDetect = true;

        Serial.println("\n[INFO] Area is clear. Detection reactivated.");
      }
    }
  }
}