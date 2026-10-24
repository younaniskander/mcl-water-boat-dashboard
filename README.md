# MCL Water Boat Dashboard

A client-only Web Bluetooth dashboard for the MCL Water Boat ESP32 firmware. It reads the existing JSON water telemetry stream and sends the existing motor commands without changing the firmware contract.

## Run locally

```bash
npm run dev
```

Open the dashboard in Chrome or Edge over HTTPS when connecting to the physical ESP32. Web Bluetooth is not available in most other browsers or insecure origins.

If the dashboard is opened inside an embedded Preview iframe, the browser may report `Access to the feature "bluetooth" is disallowed by permissions policy`. This is a browser container restriction, not an ESP32 or UUID error. Use the dashboard's **Open standalone dashboard** link, or open the HTTPS dashboard directly in a top-level Chrome or Edge tab. The standalone response includes `Permissions-Policy: bluetooth=(self)`.

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

## Project structure

The project uses a standard Vite + TypeScript layout: `public/` holds static route metadata, `src/` holds the browser client and dashboard styles, and the root contains Vite, TypeScript, ESLint, Prettier, Wrangler, and package configuration. The BLE contract and hardware pin map remain documented above.

The original ESP32 firmware is included as [`public/mcl-water-boat.ino`](public/mcl-water-boat.ino). It is copied unchanged from the supplied Arduino source and is available from the built site as `/mcl-water-boat.ino`.
