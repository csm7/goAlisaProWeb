# UGV Telemetry Web Server

This project is a Go-based web server designed to run on a Raspberry Pi 5. It provides a real-time web interface for monitoring and configuring a UGV (Unmanned Ground Vehicle).

## Key Features

- **Real-time Telemetry:** Subscribes to an MQTT topic to receive live telemetry data from the UGV.
- **Multi-Motor Visualization:** Displays data for four motors plus an averaged curve on real-time charts.
- **Web-based Configuration:** Allows users to update UGV parameters through a web form, which sends the configuration back to the UGV via a separate MQTT topic.
- **Responsive UI:** The web interface is built with Bootstrap and is designed to be user-friendly on both desktop and
- **Configurable:** The MQTT broker address and port can be configured via environment variables.
- **Offline Capable:** All frontend assets (CSS, JavaScript) are served locally, so no internet connection is required for operation.

## Project Structure

```
.
├── .gitignore             # Git ignore file
├── go.mod                 # Go module definition
├── go.sum                 # Go module checksums
├── main.go                # The main Go application file (backend)
├── index.html             # The main landing page
├── telemetry.html         # The page for displaying real-time telemetry charts
├── configuration.html     # The page for updating UGV configuration
├── static/                # Directory for all local frontend assets
│   ├── css/
│   │   └── bootstrap.min.css
│   └── js/
│       ├── bootstrap.bundle.min.js
│       ├── chart.js
│       ├── chartjs-adapter-date-fns.bundle.min.js
│       └── telemetry.js
└── README.md              # This documentation file
```

## How to Run

To run the web server, you will need to have Go installed on your system.

1.  **Prerequisites:**
    -   An MQTT broker (like Mosquitto) must be running and accessible to the server.

2.  **Configuration (Optional):**
    -   The MQTT broker address and port can be configured using the following environment variables. If they are not set, the server will use the default values.
        -   `MQTT_BROKER`: The hostname or IP address of the MQTT broker (default: `localhost`).
        -   `MQTT_PORT`: The port of the MQTT broker (default: `1883`).
    -   Example:
        ```bash
        export MQTT_BROKER=192.168.1.100
        export MQTT_PORT=1883
        ```

3.  **Download Dependencies:**
    -   Open a terminal in the project's root directory and run the following command to download the necessary Go modules:
        ```bash
        go mod tidy
        ```

4.  **Run the Server:**
    -   After the dependencies are downloaded, run the following command to start the web server:
        ```bash
        go run main.go
        ```

5.  **Access the Web Interface:**
    -   Once the server is running, you can access the web interface by opening a web browser and navigating to `http://localhost:8080`.

## Telemetry Data

The web server expects to receive telemetry data in a specific JSON format. The top-level object contains general information, and nested objects contain data for each of the four motors.

### Motor Abbreviations

-   `RF`: Right Front motor
-   `RB`: Right Back motor
-   `LF`: Left Front motor
-   `LB`: Left Back motor

## Algorithm and Workflow

The application is composed of two main parts: a Go backend and a JavaScript-powered frontend.

### Backend (`main.go`)

The backend is a concurrent Go application that handles MQTT communication, WebSocket connections, and serves the web interface.

1.  **Initialization:**
    - On startup, the program reads the `MQTT_BROKER` and `MQTT_PORT` environment variables, falling back to defaults if they are not set.
    - It initializes a new MQTT client with options to automatically reconnect if the connection to the broker is lost.
    - It also sets up a broadcast channel (`chan Telemetry`) which is used to distribute incoming telemetry data to all connected clients.

2.  **MQTT Connection and Subscription:**
    - The server enters a loop to connect to the configured MQTT broker. If the connection fails, it waits for 5 seconds and retries indefinitely.
    - Once connected, it subscribes to the `ugv/motor/vesc/telemetry` topic with a QoS level of 0.

3.  **Message Handling:**
    - The `messagePubHandler` is set as the default callback for incoming MQTT messages.
    - When a message arrives, the handler unmarshals the JSON payload into the `Telemetry` Go struct.
    - The populated `Telemetry` struct is then sent into the `broadcast` channel.

4.  **HTTP and WebSocket Server:**
    - The backend starts an HTTP server on port `:8080`.
    - It serves the HTML pages and the local static assets from the `/static` directory.
    - The `/ws` endpoint upgrades incoming HTTP connections to a WebSocket connection.
    - The `/config` endpoint handles POST requests from the configuration page and publishes the data to the `ugv/motor/vesc/config` MQTT topic.

5.  **Data Broadcasting:**
    - A separate goroutine (`handleMessages`) listens on the `broadcast` channel and forwards any received `Telemetry` object to all connected WebSocket clients.

### Frontend

The frontend consists of three HTML pages and the associated JavaScript for dynamic functionality.

1.  **Page Structure:**
    - A Bootstrap navigation bar allows the user to switch between the Telemetry and Configuration pages.

2.  **Telemetry Page (`telemetry.html` and `telemetry.js`):**
    - Establishes a WebSocket connection to the `/ws` endpoint.
    - Initializes three time-series charts using Chart.js and the date-fns adapter.
    - The `ws.onmessage` event handler parses the incoming JSON data and updates the charts and the raw data view in real-time.

3.  **Configuration Page (`configuration.html`):**
    - Contains an HTML form for updating UGV parameters.
    - The form's `submit` event is handled by JavaScript, which sends a POST request with the configuration data to the `/config` endpoint.
