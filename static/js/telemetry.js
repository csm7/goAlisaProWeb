document.addEventListener("DOMContentLoaded", function() {
    const telemetryDiv = document.getElementById('telemetry');
    const throttleCanvas = document.getElementById('throttleChart').getContext('2d');
    const tempCanvas = document.getElementById('tempChart').getContext('2d');
    const voltageCanvas = document.getElementById('voltageChart').getContext('2d');

    function createMultiMotorChart(ctx, label) {
        const motorLabels = ['RF', 'RB', 'LF', 'LB', 'Average'];
        const colors = ['rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)', 'rgba(255, 206, 86, 1)', 'rgba(75, 192, 192, 1)', 'rgba(153, 102, 255, 1)'];
        const datasets = motorLabels.map((motorLabel, index) => ({
            label: motorLabel,
            data: [],
            borderColor: colors[index],
            borderWidth: 1,
            fill: false
        }));

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: datasets
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'second'
                        },
                        position: 'bottom',
                        title: { display: true, text: 'Time' }
                    },
                    y: {
                        title: { display: true, text: 'Value' }
                    }
                }
            }
        });
    }

    function createSingleLineChart(ctx, label, color) {
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: label,
                    data: [],
                    borderColor: color,
                    borderWidth: 1,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'second'
                        },
                        position: 'bottom',
                        title: { display: true, text: 'Time' }
                    },
                    y: {
                        title: { display: true, text: 'Value' }
                    }
                }
            }
        });
    }

    const throttleChart = createSingleLineChart(throttleCanvas, 'Throttle', 'rgba(75, 192, 192, 1)');
    const tempChart = createMultiMotorChart(tempCanvas, 'Motor Temp (FET)');
    const voltageChart = createMultiMotorChart(voltageCanvas, 'Voltage In');

    const ws = new WebSocket("ws://" + window.location.host + "/ws");

    ws.onopen = function(event) {
        console.log("WebSocket connection established.");
    };

    ws.onmessage = function(event) {
        const telemetryData = JSON.parse(event.data);
        telemetryDiv.innerHTML = `<pre>${JSON.stringify(telemetryData, null, 2)}</pre>`;

        const motors = ['rf', 'rb', 'lf', 'lb'];

        const tempValues = motors.map(m => telemetryData[m].temp_fet);
        const voltageValues = motors.map(m => telemetryData[m].v_in);

        updateSingleLineChart(throttleChart, new Date(telemetryData.timestamp * 1000), telemetryData.throttle);
        updateMultiMotorChart(tempChart, new Date(telemetryData.timestamp * 1000), tempValues);
        updateMultiMotorChart(voltageChart, new Date(telemetryData.timestamp * 1000), voltageValues);
    };

    function updateMultiMotorChart(chart, label, data) {
        const average = data.reduce((a, b) => a + b, 0) / data.length;
        const allData = [...data, average];

        if (chart.data.labels.length > 50) {
            chart.data.labels.shift();
            chart.data.datasets.forEach((dataset) => {
                dataset.data.shift();
            });
        }

        chart.data.labels.push(label);
        chart.data.datasets.forEach((dataset, index) => {
            dataset.data.push(allData[index]);
        });
        chart.update();
    }

    function updateSingleLineChart(chart, label, data) {
        if (chart.data.labels.length > 50) {
            chart.data.labels.shift();
            chart.data.datasets.forEach((dataset) => {
                dataset.data.shift();
            });
        }

        chart.data.labels.push(label);
        chart.data.datasets.forEach((dataset) => {
            dataset.data.push(data);
        });
        chart.update();
    }

    ws.onclose = function(event) {
        console.log("WebSocket connection closed.");
    };

    ws.onerror = function(error) {
        console.log(`WebSocket error: ${error.message}`);
    };
});
