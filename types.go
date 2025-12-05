package main

// Telemetry represents the structure of the telemetry data for all four motors.
type Telemetry struct {
	Throttle              float64   `json:"throttle"`
	Steering              float64   `json:"steering"`
	MovementStateForwardBack string    `json:"movement_state_forward_back"`
	RF                    MotorData `json:"rf"`
	RB                    MotorData `json:"rb"`
	LF                    MotorData `json:"lf"`
	LB                    MotorData `json:"lb"`
	Timestamp             float64   `json:"timestamp"`
	Source                string    `json:"source"`
}

// MotorData represents the structure of the data for a single motor.
type MotorData struct {
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
