# UGV Telemetry Web Server

This project is a Go-based web server designed to run on a Raspberry Pi 5. It provides a real-time web interface for monitoring and configuring a UGV (Unmanned Ground Vehicle).

## Key Features

- **Real-time Telemetry:** Subscribes to an MQTT topic to receive live telemetry data from the UGV.
- **Multi-Motor Visualization:** Displays data for four motors plus an averaged curve on real-time charts.
- **Web-based Configuration:** Allows users to update UGV parameters through a web form, which sends the configuration back to the UGV via a separate MQTT topic.
- **Responsive UI:** The web interface is built with Bootstrap and is designed to be user-friendly on both desktop and mobile browsers.
- **Offline Capable:** All frontend assets (CSS, JavaScript) are served locally, so no internet connection is required for operation.

## Project Structure

```
.
├── go.mod                 # Go module definition
├── go.sum                 # Go module checksums
├── main.go                # The main Go application file (backend)
├── index.html             # The main landing page
├── telemetry.html         # The page for displaying real-time telemetry charts
├── configuration.html     # The page for updating UGV configuration
├── static/                # Directory for all local frontend assets
│   ├── css/
│   │   └── bootstrap.min.css # Bootstrap CSS library
│   └── js/
│       ├── bootstrap.bundle.min.js # Bootstrap JavaScript library
│       ├── chart.js                # Chart.js library for graphs
│       └── telemetry.js            # Custom JavaScript for the telemetry page
└── README.md              # This documentation file
```

## How to Run

To run the web server, you will need to have Go installed on your system.

1.  **Prerequisites:**
    -   An MQTT broker (like Mosquitto) must be running on `localhost:1883`. The server will not start if it cannot connect to the broker.

2.  **Download Dependencies:**
    -   Open a terminal in the project's root directory and run the following command to download the necessary Go modules:
        ```bash
        go mod tidy
        ```

3.  **Run the Server:**
    -   After the dependencies are downloaded, run the following command to start the web server:
        ```bash
        go run main.go
        ```

4.  **Access the Web Interface:**
    -   Once the server is running, you can access the web interface by opening a web browser and navigating to `http://localhost:8080`.

## Algorithm and Workflow

The application is composed of two main parts: a Go backend and a JavaScript-powered frontend.

### Backend (`main.go`)

The backend is a concurrent Go application that handles MQTT communication, WebSocket connections, and serves the web interface.

1.  **Initialization:**
    - On startup, the program initializes a new MQTT client with options to automatically reconnect if the connection to the broker is lost.
    - It also sets up a broadcast channel (`chan Telemetry`) which is used to distribute incoming telemetry data to all connected clients.

2.  **MQTT Connection and Subscription:**
    - The server enters a loop to connect to the MQTT broker (hardcoded to `localhost:1883`). If the connection fails, it waits for 5 seconds and retries indefinitely. This makes the server resilient to broker downtime.
    - Once connected, it subscribes to the `ugv/motor/vesc/telemetry` topic with a QoS level of 0.

3.  **Message Handling:**
    - The `messagePubHandler` is set as the default callback for incoming MQTT messages.
    - When a message arrives, the handler unmarshals the JSON payload into the `Telemetry` Go struct.
    - The populated `Telemetry` struct is then sent into the `broadcast` channel.

4.  **HTTP and WebSocket Server:**
    - The backend starts an HTTP server on port `:8080`.
    - It serves the HTML pages (`index.html`, `telemetry.html`, `configuration.html`) and the local static assets from the `/static` directory.
    - The `/ws` endpoint upgrades incoming HTTP connections to a WebSocket connection. Each new connection is added to a thread-safe map of active clients.
    - The `/config` endpoint handles POST requests from the configuration page. It decodes the JSON payload from the request and publishes it to the `ugv/motor/vesc/config` MQTT topic.

5.  **Data Broadcasting:**
    - A separate goroutine (`handleMessages`) runs concurrently. It continuously listens for `Telemetry` objects on the `broadcast` channel.
    - When a `Telemetry` object is received, it iterates over the map of connected WebSocket clients and sends the data as a JSON message to each client. This ensures all users see the same real-time data.
    - The client map is protected by a mutex to prevent race conditions.

### Frontend

The frontend consists of three HTML pages and the associated JavaScript for dynamic functionality.

1.  **Page Structure:**
    - A Bootstrap navigation bar allows the user to switch between the Telemetry and Configuration pages.

2.  **Telemetry Page (`telemetry.html` and `telemetry.js`):**
    - When the page loads, `telemetry.js` is executed.
    - It establishes a WebSocket connection to the `/ws` endpoint on the Go server.
    - It initializes three charts using Chart.js: one for throttle, one for motor temperature, and one for voltage.
        - The temperature and voltage charts are configured to display five lines each: one for each of the four motors (`RF`, `RB`, `LF`, `LB`) and one for the calculated average.
        - The throttle chart displays a single line, as throttle is a global value.
    - The `ws.onmessage` event handler is triggered whenever new data is received from the server.
    - Inside the handler, the incoming JSON string is parsed into a JavaScript object.
    - The raw JSON is displayed in a `<pre>` tag for debugging.
    - For each chart, the relevant data is extracted from the telemetry object. For the multi-motor charts, an array of values is created, and the average is calculated.
    - The `updateChart` functions are called to append the new data (and the new timestamp) to each chart, creating a real-time graph. The charts are configured to show a moving window of the last 50 data points.

3.  **Configuration Page (`configuration.html`):**
    - This page contains a simple HTML form for updating UGV parameters.
    - An event listener is attached to the form's `submit` event.
    - When the form is submitted, the JavaScript prevents the default page reload, reads the values from the input fields, and constructs a JSON object.
    - It then uses the `fetch` API to send this JSON object as a POST request to the `/config` endpoint on the Go server.
    - The user is shown a success or failure message based on the HTTP response.
