# MCL Water Boat Dashboard

A client-only Web Bluetooth dashboard for the MCL Water Boat ESP32 firmware. It reads the existing JSON water telemetry stream and sends the existing motor commands without changing the firmware contract.

## Run locally

```bash
npm run dev
```

Open the dashboard in Chrome or Edge over HTTPS when connecting to the physical ESP32. Web Bluetooth is not available in most other browsers or insecure origins.

## BLE contract

- Device name: `MCL-Water-Boat`
- Service: `7b7e0001-2d8b-4c70-9c2e-8e2e5a8b0001`
- Data characteristic: `7b7e0002-2d8b-4c70-9c2e-8e2e5a8b0001`
- Command characteristic: `7b7e0003-2d8b-4c70-9c2e-8e2e5a8b0001`
- Motor commands: `L1`, `R1`, `B1`, and `STOP`

The dashboard expects the ESP32 to notify JSON objects with the existing fields `ph`, `phVoltage`, `turbidityNTU`, `turbidityVoltage`, `ecUsCm`, `ecMsCm`, `salinityPpt`, `ecVoltage`, `gpsValid`, `lat`, and `lng`.

## Pin map — unchanged

| Function | ESP32 pin |
| --- | ---: |
| Left ESC | GPIO 13 |
| Right ESC | GPIO 23 |
| pH sensor | GPIO 34 |
| Turbidity sensor | GPIO 35 |
| EC sensor | GPIO 32 |
| GPS RX | GPIO 18 |
| GPS TX | GPIO 19 |

## Safety behavior

Motor controls are disabled until the dashboard is connected and has received fresh telemetry. While a control is held, the dashboard repeats only its matching command. Releasing the control, leaving it, cancelling the pointer, losing window focus, hiding the page, becoming stale, disconnecting, or pressing Emergency stop sends `STOP` and clears the active hold.

No server, database, authentication, or pin changes are part of this project.
