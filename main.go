package main

import (
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/gorilla/websocket"
)

var clients = make(map[*websocket.Conn]bool)
var clientsMutex = &sync.Mutex{}
var broadcast = make(chan Telemetry)

func main() {
	broker := getEnv("MQTT_BROKER", "broker.mqtt.cool")
	port := getEnv("MQTT_PORT", "1883")
	client := setupMQTTClient(broker, port)
	sub(client)

	go handleMessages()

	setupRouter(client)

	log.Println("Starting server on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatalf("Error starting server: %s\n", err)
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
