document.addEventListener("DOMContentLoaded", function() {
    const telemetryDiv = document.getElementById('telemetry');
    const faultPanel = document.getElementById('faultStatusPanel');

    // Розшифровка кодів помилок VESC (Mc_fault_code)
    const vescFaults = {
        0:  "No Fault",
        1:  "Over Voltage",
        2:  "Under Voltage",
        3:  "DRV8302 Error",
        4:  "ABS Over Current",
        5:  "Over Temp FET",
        6:  "Over Temp Motor",
        7:  "Over Temp Gate Driver",
        8:  "Under Voltage Cutoff",
        9:  "Over Voltage Cutoff",
        10: "High Offset Current Sensor 1",
        11: "High Offset Current Sensor 2",
        12: "High Offset Current Sensor 3",
        13: "Phase 1 Error",
        14: "Phase 2 Error",
        15: "Phase 3 Error"
    };

    // Отримання контекстів для всіх графіків
    const ctxs = {
        throttle: document.getElementById('throttleChart').getContext('2d'),
        voltage: document.getElementById('voltageChart').getContext('2d'),
        rpm: document.getElementById('rpmChart').getContext('2d'),
        duty: document.getElementById('dutyChart').getContext('2d'),
        motorCurrent: document.getElementById('motorCurrentChart').getContext('2d'),
        batteryCurrent: document.getElementById('batteryCurrentChart').getContext('2d'),
        temp: document.getElementById('tempChart').getContext('2d'),
    };

    // Налаштування кольорів для мульти-графіків
    const motorLabels = ['RF', 'RB', 'LF', 'LB', 'Avg'];
    const motorColors = [
        'rgba(255, 99, 132, 1)',   // RF - Червоний
        'rgba(54, 162, 235, 1)',   // RB - Синій
        'rgba(255, 206, 86, 1)',   // LF - Жовтий
        'rgba(75, 192, 192, 1)',   // LB - Зелений
        'rgba(153, 102, 255, 1)'   // Avg - Фіолетовий
    ];

    // Універсальна функція створення графіків
    function createChart(ctx, label, isMulti = true) {
        let datasets = [];

        if (isMulti) {
            datasets = motorLabels.map((mLabel, index) => ({
                label: mLabel,
                data: [],
                borderColor: motorColors[index],
                borderWidth: 1.5,
                pointRadius: 0, // Прибираємо точки для чистоти графіка
                fill: false
            }));
        } else {
            datasets = [{
                label: label,
                data: [],
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1.5,
                pointRadius: 0,
                fill: false
            }];
        }

        return new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1.7, // Робимо графіки більш "пласкими"
                animation: false, // Вимикаємо анімацію для продуктивності
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'second',
                            displayFormats: { second: 'HH:mm:ss' },
                            tooltipFormat: 'HH:mm:ss.SSS'
                        },
                        title: { display: false },
                        ticks: { maxTicksLimit: 6 }
                    },
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        labels: { boxWidth: 10, font: { size: 10 } }
                    }
                }
            }
        });
    }

    // Ініціалізація графіків
    const charts = {
        throttle: createChart(ctxs.throttle, 'Throttle', false),
        voltage: createChart(ctxs.voltage, 'Voltage'),
        rpm: createChart(ctxs.rpm, 'RPM'),
        duty: createChart(ctxs.duty, 'Duty Cycle'),
        motorCurrent: createChart(ctxs.motorCurrent, 'Motor Current'),
        batteryCurrent: createChart(ctxs.batteryCurrent, 'Battery Current'),
        temp: createChart(ctxs.temp, 'Temp FET'),
    };

    // WebSocket з'єднання
    const ws = new WebSocket("ws://" + window.location.host + "/ws");

    ws.onopen = () => console.log("WebSocket connected");
    ws.onclose = () => console.log("WebSocket disconnected");
    ws.onerror = (e) => console.log(`WebSocket error: ${e.message}`);

    ws.onmessage = function(event) {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (e) {
            console.error("Error parsing JSON", e);
            return;
        }

        const timestamp = new Date(data.timestamp * 1000);

        // Оновлення текстового логу (показуємо лише важливі дані для економії ресурсів)
        // Можна розкоментувати повний лог, якщо потрібно
        // telemetryDiv.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
        // Для економії відобразимо тільки час останнього пакету
        telemetryDiv.innerHTML = `<div class="p-2">Last Update: ${timestamp.toLocaleTimeString()}</div>`;

        const motors = ['rf', 'rb', 'lf', 'lb'];

        // Збір даних з перевіркою на null/undefined
        const metrics = {
            voltage: motors.map(m => data[m]?.v_in ?? 0),
            rpm: motors.map(m => data[m]?.erpm ?? 0),
            duty: motors.map(m => data[m]?.duty ?? 0),
            motorCurrent: motors.map(m => data[m]?.motor_current ?? 0),
            batteryCurrent: motors.map(m => data[m]?.battery_current ?? 0),
            temp: motors.map(m => data[m]?.temp_fet ?? 0),
            faults: motors.map(m => ({ id: m.toUpperCase(), code: data[m]?.fault ?? 0 }))
        };

        // Оновлення графіків
        updateSingleChart(charts.throttle, timestamp, data.throttle);
        updateMultiChart(charts.voltage, timestamp, metrics.voltage);
        updateMultiChart(charts.rpm, timestamp, metrics.rpm);
        updateMultiChart(charts.duty, timestamp, metrics.duty);
        updateMultiChart(charts.motorCurrent, timestamp, metrics.motorCurrent);
        updateMultiChart(charts.batteryCurrent, timestamp, metrics.batteryCurrent);
        updateMultiChart(charts.temp, timestamp, metrics.temp);

        // Оновлення статусів помилок з розшифровкою
        updateFaultStatus(metrics.faults);
    };

    // Функція оновлення мульти-графіків (з розрахунком середнього)
    function updateMultiChart(chart, label, values) {
        const average = values.reduce((a, b) => a + b, 0) / (values.length || 1);
        const allData = [...values, average];

        chart.data.labels.push(label);
        chart.data.datasets.forEach((dataset, index) => {
            dataset.data.push(allData[index]);
        });

        trimChartData(chart);
        chart.update('none'); // 'none' значно підвищує FPS
    }

    // Функція оновлення одиночного графіка
    function updateSingleChart(chart, label, value) {
        chart.data.labels.push(label);
        chart.data.datasets[0].data.push(value);
        trimChartData(chart);
        chart.update('none');
    }

    // Обмеження кількості точок на графіку
    function trimChartData(chart) {
        const maxPoints = 60; // Зберігати історію 60 пакетів
        if (chart.data.labels.length > maxPoints) {
            chart.data.labels.shift();
            chart.data.datasets.forEach(d => d.data.shift());
        }
    }

    // Візуалізація кодів помилок
    function updateFaultStatus(faults) {
        let html = '';
        faults.forEach(f => {
            const isOk = f.code === 0;
            const colorClass = isOk ? 'bg-success' : 'bg-danger';

            // Отримуємо текстовий опис помилки, або "Unknown", якщо коду немає в базі
            const errorDescription = vescFaults[f.code] || "Unknown Fault Code";

            // Формування HTML
            // Якщо ОК - показуємо просто ОК
            // Якщо помилка - показуємо код + опис дрібним шрифтом

            let statusContent = '';
            if (isOk) {
                statusContent = `<strong>OK</strong>`;
            } else {
                statusContent = `
                    <strong>FAULT (${f.code})</strong>
                    <div style="font-size: 0.75rem; margin-top: 2px; opacity: 0.9;">
                        ${errorDescription}
                    </div>
                `;
            }

            html += `
                <div class="col-md-3 mb-2">
                    <div class="card text-white ${colorClass} text-center h-100">
                        <div class="card-body p-2 d-flex flex-column justify-content-center">
                            <h6 class="card-title mb-0">${f.id}</h6>
                            <div class="mt-1">${statusContent}</div>
                        </div>
                    </div>
                </div>
            `;
        });
        faultPanel.innerHTML = html;
    }
});


    // const throttleCanvas = document.getElementById('throttleChart').getContext('2d');
    // const rpmCanvas = document.getElementById('rpmChart').getContext('2d');
    // const currentCanvas = document.getElementById('currentChart').getContext('2d');
    // const tempCanvas = document.getElementById('tempChart').getContext('2d');
    // const voltageCanvas = document.getElementById('voltageChart').getContext('2d');


    // function createMultiMotorChart(ctx, label) {
    //     const motorLabels = ['RF', 'RB', 'LF', 'LB', 'Average'];
    //     const colors = ['rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)', 'rgba(255, 206, 86, 1)', 'rgba(75, 192, 192, 1)', 'rgba(153, 102, 255, 1)'];
    //     const datasets = motorLabels.map((motorLabel, index) => ({
    //         label: motorLabel,
    //         data: [],
    //         borderColor: colors[index],
    //         borderWidth: 1,
    //         fill: false
    //     }));
    //
    //     return new Chart(ctx, {
    //         type: 'line',
    //         data: {
    //             labels: [],
    //             datasets: datasets
    //         },
    //         options: {
    //             responsive: true,
    //             maintainAspectRatio: true, // Allows you to control height via container
    //             aspectRatio: 2,            // Higher = wider, lower = taller
    //             scales: {
    //                 x: {
    //                     type: 'time',
    //                     time: {
    //                         unit: 'second'
    //                     },
    //                     position: 'bottom',
    //                     title: { display: true, text: 'Time' }
    //                 },
    //                 y: {
    //                     title: { display: true, text: 'Value' }
    //                 }
    //             }
    //         }
    //     });
    // }
    //
    // function createSingleLineChart(ctx, label, color) {
    //     return new Chart(ctx, {
    //         type: 'line',
    //         data: {
    //             labels: [],
    //             datasets: [{
    //                 label: label,
    //                 data: [],
    //                 borderColor: color,
    //                 borderWidth: 1,
    //                 fill: false
    //             }]
    //         },
    //         options: {
    //             responsive: true,
    //             maintainAspectRatio: true,
    //             aspectRatio: 2,
    //             scales: {
    //                 x: {
    //                     type: 'time',
    //                     time: {
    //                         unit: 'second'
    //                     },
    //                     position: 'bottom',
    //                     title: { display: true, text: 'Time' }
    //                 },
    //                 y: {
    //                     title: { display: true, text: 'Value' }
    //                 }
    //             }
    //         }
    //     });
    // }
    //
    // const throttleChart = createSingleLineChart(throttleCanvas, 'Throttle', 'rgba(75, 192, 192, 1)');
    // const rpmChart = createMultiMotorChart(rpmCanvas, 'RPM');
    // const currentChart = createMultiMotorChart(currentCanvas, 'Current (A)');
    // const tempChart = createMultiMotorChart(tempCanvas, 'Motor Temp (FET)');
    // const voltageChart = createMultiMotorChart(voltageCanvas, 'Voltage In');
    //
    // const ws = new WebSocket("ws://" + window.location.host + "/ws");
    //
    // ws.onopen = function(event) {
    //     console.log("WebSocket connection established.");
    // };
    //
    // ws.onmessage = function(event) {
    //     const telemetryData = JSON.parse(event.data);
    //     telemetryDiv.innerHTML = `<pre>${JSON.stringify(telemetryData, null, 2)}</pre>`;
    //
    //     const motors = ['rf', 'rb', 'lf', 'lb'];
    //
    //     const tempValues = motors.map(m => telemetryData[m]?.temp_fet ?? 0);
    //     const voltageValues = motors.map(m => telemetryData[m]?.v_in ?? 0);
    //
    //     updateSingleLineChart(throttleChart, new Date(telemetryData.timestamp * 1000), telemetryData.throttle);
    //     updateMultiMotorChart(tempChart, new Date(telemetryData.timestamp * 1000), tempValues);
    //     updateMultiMotorChart(voltageChart, new Date(telemetryData.timestamp * 1000), voltageValues);
    // };
    //
    // function updateMultiMotorChart(chart, label, data) {
    //     const average = data.reduce((a, b) => a + b, 0) / data.length;
    //     const allData = [...data, average];
    //
    //     if (chart.data.labels.length > 50) {
    //         chart.data.labels.shift();
    //         chart.data.datasets.forEach((dataset) => {
    //             dataset.data.shift();
    //         });
    //     }
    //
    //     chart.data.labels.push(label);
    //     chart.data.datasets.forEach((dataset, index) => {
    //         dataset.data.push(allData[index]);
    //     });
    //     chart.update();
    // }
    //
    // function updateSingleLineChart(chart, label, data) {
    //     if (chart.data.labels.length > 50) {
    //         chart.data.labels.shift();
    //         chart.data.datasets.forEach((dataset) => {
    //             dataset.data.shift();
    //         });
    //     }
    //
    //     chart.data.labels.push(label);
    //     chart.data.datasets.forEach((dataset) => {
    //         dataset.data.push(data);
    //     });
    //     chart.update();
    // }
    //
    // ws.onclose = function(event) {
    //     console.log("WebSocket connection closed.");
    // };
    //
    // ws.onerror = function(error) {
    //     console.log(`WebSocket error: ${error.message}`);
    // };
