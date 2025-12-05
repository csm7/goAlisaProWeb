package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/gorilla/websocket"
)

// Telemetry represents the structure of the telemetry data
type Telemetry struct {
	Throttle              float64   `json:"throttle"`
	Steering              int       `json:"steering"`
	MovementStateForwardBack string    `json:"movement_state_forward_back"`
	RF                    RFData    `json:"rf"`
	Timestamp             float64   `json:"timestamp"`
	Source                string    `json:"source"`
}

// RFData represents the structure of the RF data
type RFData struct {
	TempFET        float64 `json:"temp_fet"`
	MotorCurrent   float64 `json:"motor_current"`
	BatteryCurrent float64 `json:"battery_current"`
	MotorIDCurrent float64 `json:"motor_id_current"`
	MotorIQ        float64 `json:"motor_iq"`
	Duty           float64 `json:"duty"`
	ERPM           int     `json:"erpm"`
	VIn            float64 `json:"v_in"`
	AHDraw         float64 `json:"ah_draw"`
	AHCharge       float64 `json:"ah_charge"`
	WHDraw         float64 `json:"wh_draw"`
	WHCharge       float64 `json:"wh_charge"`
	Tachometer     int     `json:"tachometer"`
	TachometerAbs  int     `json:"tachometer_abs"`
	Fault          int     `json:"fault"`
	PIDPosNow      float64 `json:"pid_pos_now"`
	ControllerID   int     `json:"controller_id"`
}

// Config represents the structure of the configuration data
type Config struct {
	MaxSpeed  float64 `json:"max_speed"`
	TurnSpeed float64 `json:"turn_speed"`
}

var telemetryData Telemetry
var telemetryMutex = &sync.Mutex{}

var clients = make(map[*websocket.Conn]bool)
var clientsMutex = &sync.Mutex{}
var broadcast = make(chan Telemetry)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

var messagePubHandler mqtt.MessageHandler = func(client mqtt.Client, msg mqtt.Message) {
	telemetryMutex.Lock()
	defer telemetryMutex.Unlock()
	err := json.Unmarshal(msg.Payload(), &telemetryData)
	if err != nil {
		fmt.Printf("Error unmarshalling telemetry data: %s\n", err)
		return
	}
	broadcast <- telemetryData
}

var connectHandler mqtt.OnConnectHandler = func(client mqtt.Client) {
	fmt.Println("Connected to MQTT broker")
}

var connectLostHandler mqtt.ConnectionLostHandler = func(client mqtt.Client, err error) {
	fmt.Printf("Connection lost: %v", err)
}

func main() {
	broker := "localhost"
	port := 1883
	opts := mqtt.NewClientOptions()
	opts.AddBroker(fmt.Sprintf("tcp://%s:%d", broker, port))
	opts.SetClientID("go_mqtt_client")
	opts.SetDefaultPublishHandler(messagePubHandler)
	opts.OnConnect = connectHandler
	opts.OnConnectionLost = connectLostHandler
	opts.SetAutoReconnect(true)
	opts.SetConnectRetry(true)
	opts.SetConnectRetryInterval(5 * time.Second)

	client := mqtt.NewClient(opts)
	for {
		if token := client.Connect(); token.Wait() && token.Error() != nil {
			fmt.Printf("Failed to connect to MQTT broker: %v. Retrying in 5 seconds...\n", token.Error())
			time.Sleep(5 * time.Second)
		} else {
			break
		}
	}

	sub(client)

	go handleMessages()

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "index.html")
	})
	http.HandleFunc("/ws", handleConnections)
	http.HandleFunc("/telemetry", getTelemetry)
	http.HandleFunc("/config", func(w http.ResponseWriter, r *http.Request) {
		handleConfig(w, r, client)
	})

	fmt.Println("Starting server on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		fmt.Printf("Error starting server: %s\n", err)
	}
}

func sub(client mqtt.Client) {
	topic := "ugv/motor/vesc/telemetry"
	token := client.Subscribe(topic, 1, nil)
	token.Wait()
	fmt.Printf("Subscribed to topic: %s\n", topic)
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer ws.Close()

	clientsMutex.Lock()
	clients[ws] = true
	clientsMutex.Unlock()

	for {
		_, _, err := ws.ReadMessage()
		if err != nil {
			clientsMutex.Lock()
			delete(clients, ws)
			clientsMutex.Unlock()
			break
		}
	}
}

func handleMessages() {
	for {
		msg := <-broadcast
		clientsMutex.Lock()
		for client := range clients {
			err := client.WriteJSON(msg)
			if err != nil {
				client.Close()
				delete(clients, client)
			}
		}
		clientsMutex.Unlock()
	}
}

func getTelemetry(w http.ResponseWriter, r *http.Request) {
	telemetryMutex.Lock()
	defer telemetryMutex.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(telemetryData)
}

func handleConfig(w http.ResponseWriter, r *http.Request, client mqtt.Client) {
	var config Config
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	configJSON, err := json.Marshal(config)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	token := client.Publish("ugv/motor/vesc/config", 0, false, configJSON)
	token.Wait()
	w.WriteHeader(http.StatusOK)
}
