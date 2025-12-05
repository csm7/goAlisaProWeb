package main

import (
	"encoding/json"
	"log"
	"net/http"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}
	defer ws.Close()

	clientsMutex.Lock()
	clients[ws] = true
	clientsMutex.Unlock()

	for {
		// Read message from browser. Not used in this application.
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
				log.Printf("error: %v\n", err)
				client.Close()
				delete(clients, client)
			}
		}
		clientsMutex.Unlock()
	}
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

func setupRouter(client mqtt.Client) {
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "index.html")
	})
	http.HandleFunc("/telemetry", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "telemetry.html")
	})
	http.HandleFunc("/configuration", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "configuration.html")
	})
	http.HandleFunc("/ws", handleConnections)
	http.HandleFunc("/config", func(w http.ResponseWriter, r *http.Request) {
		handleConfig(w, r, client)
	})
}
