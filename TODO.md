# MCL Water Boat Dashboard — TODO

## 1. BLE connection and telemetry transport
- [x] Connect directly from the browser to the ESP32 BLE device named `MCL-Water-Boat` using service UUID `7b7e0001-2d8b-4c70-9c2e-8e2e5a8b0001`, data characteristic UUID `7b7e0002-2d8b-4c70-9c2e-8e2e5a8b0001`, and command characteristic UUID `7b7e0003-2d8b-4c70-9c2e-8e2e5a8b0001`.
- [x] Present disconnected, connecting, connected, error, and safety-readiness states, including an explicit disconnect control.
- [x] Decode the ESP32 JSON notifications and display live pH, turbidity in NTU, EC/conductivity, salinity, sensor voltages, timestamps, and telemetry freshness.
- [x] Show GPS validity and current latitude/longitude when the ESP32 reports valid GPS data.

## 2. Safety-focused motor controls
- [x] Provide hold-to-run left, right, and both motor controls that send only `L1`, `R1`, and `B1` while actively held.
- [x] Send the exact `STOP` command on release, cancel, blur, hidden-page, and disconnect safety paths.
- [x] Keep motor controls disabled until a BLE command characteristic is available and telemetry is fresh enough for safe operation.

## 3. Hardware compatibility and documentation
- [x] Preserve the ESP32 assignments exactly: ESC left GPIO 13, ESC right GPIO 23, pH GPIO 34, turbidity GPIO 35, EC GPIO 32, GPS RX GPIO 18, and GPS TX GPIO 19.
- [x] Document the unchanged BLE identifiers, command protocol, browser requirements, and pin map.

## 4. Responsive client-only delivery
- [x] Deliver a responsive marine dashboard optimized for laptop and tablet use with no server, database, or authentication.
- [x] Serve the complete page route manifest at `/manus-routes.json`.
- [x] Save the completed project to a new private GitHub repository named `mcl-water-boat-dashboard` when GitHub access is available.
