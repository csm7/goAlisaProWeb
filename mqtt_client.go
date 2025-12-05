package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

var messagePubHandler mqtt.MessageHandler = func(client mqtt.Client, msg mqtt.Message) {
	var telemetryData Telemetry
	err := json.Unmarshal(msg.Payload(), &telemetryData)
	if err != nil {
		log.Printf("Error unmarshalling telemetry data: %s\n", err)
		return
	}
	broadcast <- telemetryData
}

var connectHandler mqtt.OnConnectHandler = func(client mqtt.Client) {
	log.Println("Connected to MQTT broker")
}

var connectLostHandler mqtt.ConnectionLostHandler = func(client mqtt.Client, err error) {
	log.Printf("Connection lost: %v\n", err)
}

func setupMQTTClient(broker, port string) mqtt.Client {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(fmt.Sprintf("tcp://%s:%s", broker, port))
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
			log.Printf("Failed to connect to MQTT broker: %v. Retrying in 5 seconds...\n", token.Error())
			time.Sleep(5 * time.Second)
		} else {
			break
		}
	}
	return client
}

func sub(client mqtt.Client) {
	topic := "ugv/motor/vesc/telemetry"
	token := client.Subscribe(topic, 0, nil)
	token.Wait()
	log.Printf("Subscribed to topic: %s\n", topic)
}
